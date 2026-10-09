/**
 * Saga – opslag op Google Drive.
 *
 * Dit script draait in het Google-account van Céline en bewaart de planning
 * als één JSON-bestand in de map "Saga" op Drive.
 *
 * Rechten (zie appsscript.json): de agenda wordt enkel gelezen, en op Drive
 * kan het script alleen aan de bestanden die het zelf maakte. Elke dag wordt een
 * back-up bewaard (de laatste 14 blijven staan).
 *
 * Elke nacht (rond 5 uur) leest het script de agenda('s) uit AGENDA_NAMEN en neemt het enkel
 * afspraken over met #s (tonen) of #sw (tonen + telt als werkdag) in de
 * titel of beschrijving. Het script schrijft nooit in de agenda.
 *
 * Installatie: zie docs/INSTALLATIE.md.
 */

const MAP_NAAM = 'Saga';
const BESTAND_NAAM = 'saga-data.json';
const BACKUPS_HOUDEN = 14;

// Verhogen bij elke wijziging die de app moet kennen; de app waarschuwt bij een oudere versie.
const SCRIPT_VERSIE = 6;

// Welke agenda('s) gelezen worden, op naam (hoofdletters maken niet uit).
// Leeg laten ([]) = alle agenda's die je in Google Agenda ziet.
const AGENDA_NAMEN = ['De Zottekes'];

const AGENDA_DAGEN_TERUG = 7;
const AGENDA_DAGEN_VOORUIT = 75;
// De code moet als los woord staan: #school of #sport tellen niet mee.
const CODE_S = /(^|\s)#s(?=$|\s|[.,;:!?)\]])/i;
const CODE_SW = /(^|\s)#sw(?=$|\s|[.,;:!?)\]])/i;

/**
 * Uitvoeren vanuit de editor (eerste keer, en opnieuw na een nieuwe versie van dit script):
 * maakt map, bestand en geheime sleutel aan, plant de dagelijkse agenda-update en voert ze meteen uit.
 */
function installeer() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('SAGA_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SAGA_TOKEN', token);
  }
  haalBestand_();
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'verversAgenda'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('verversAgenda').timeBased().everyDays(1).atHour(5).create();
  verversAgenda();
  Logger.log('Saga is klaar. Je geheime sleutel is:\n\n%s\n\nKopieer die naar Instellingen → Synchronisatie in Saga.', token);
}

function doGet() {
  return ContentService.createTextOutput('Saga draait. Open de app om je planning te zien.');
}

function doPost(e) {
  let verzoek;
  try {
    verzoek = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, fout: 'ongeldig verzoek' });
  }
  const token = PropertiesService.getScriptProperties().getProperty('SAGA_TOKEN');
  if (!token || verzoek.token !== token) return json_({ ok: false, fout: 'verkeerde sleutel' });

  const slot = LockService.getScriptLock();
  slot.waitLock(20000);
  try {
    const bestand = haalBestand_();
    const opgeslagen = leesData_(bestand);
    if (verzoek.actie === 'sync') {
      const samen = merge(opgeslagen, verzoek.data || {});
      if (verzoek.agenda) samen.afspraken = bewaarAgendaInfo_(leesAgenda_(samen.afspraken || {}));
      const tekst = JSON.stringify(samen);
      if (tekst !== JSON.stringify(opgeslagen)) {
        maakDagelijkseBackup_(bestand);
        schrijfBestand_(bestand, tekst);
      }
      return json_({ ok: true, data: samen, scriptVersie: SCRIPT_VERSIE, agendaInfo: agendaInfo_() });
    }
    return json_({ ok: false, fout: 'onbekende actie' });
  } finally {
    slot.releaseLock();
  }
}

/** Dagelijks (trigger): de agenda-afspraken met #s of #sw bijwerken in het databestand. */
function verversAgenda() {
  const slot = LockService.getScriptLock();
  slot.waitLock(30000);
  try {
    const bestand = haalBestand_();
    const data = leesData_(bestand);
    const voor = JSON.stringify(data.afspraken || {});
    data.afspraken = bewaarAgendaInfo_(leesAgenda_(data.afspraken || {}));
    if (JSON.stringify(data.afspraken) !== voor) schrijfBestand_(bestand, JSON.stringify(data));
  } finally {
    slot.releaseLock();
  }
}

/** Handig om te testen vanuit de editor: toont welke agenda's er zijn en wat Saga zou overnemen. */
function testAgenda() {
  Logger.log('Agenda\'s in je account: %s', CalendarApp.getAllCalendars().map(function (c) { return c.getName(); }).join(', '));
  const r = leesAgenda_({});
  Logger.log('Gelezen: %s', r.info.agendas.join(', ') || '(geen)');
  if (r.info.fout) Logger.log('Probleem: %s', r.info.fout);
  Object.keys(r.afspraken).forEach(function (id) {
    const a = r.afspraken[id];
    Logger.log('%s %s %s%s', a.datum, a.tijd || '', a.titel, a.werk ? ' (werkdag)' : '');
  });
}

// Namen vergelijken zonder op hoofdletters, spaties of "De " vooraan te letten.
function naamSleutel_(naam) {
  return String(naam || '').toLowerCase().replace(/^\s*de\s+/, '').replace(/\s+/g, ' ').trim();
}

function kiesAgendas_() {
  const alle = CalendarApp.getAllCalendars();
  if (!AGENDA_NAMEN.length) return alle;
  const gezocht = AGENDA_NAMEN.map(naamSleutel_);
  return alle.filter(function (c) {
    return gezocht.indexOf(naamSleutel_(c.getName())) !== -1;
  });
}

function bewaarAgendaInfo_(resultaat) {
  PropertiesService.getScriptProperties().setProperty('SAGA_AGENDA_INFO', JSON.stringify(resultaat.info));
  return resultaat.afspraken;
}

function agendaInfo_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('SAGA_AGENDA_INFO') || 'null');
  } catch (err) {
    return null;
  }
}

/**
 * Leest de gekozen agenda's en geeft { afspraken, info } terug.
 * Enkel wat veranderde krijgt een nieuwe `upd`; verdwenen afspraken worden als verwijderd gemarkeerd.
 * Wordt de agenda niet gevonden, dan blijft alles zoals het was.
 */
function leesAgenda_(oud) {
  const nu = new Date();
  const van = new Date(nu.getTime() - AGENDA_DAGEN_TERUG * 86400000);
  const tot = new Date(nu.getTime() + AGENDA_DAGEN_VOORUIT * 86400000);
  const scriptTz = Session.getScriptTimeZone();
  const agendaTz = CalendarApp.getDefaultCalendar().getTimeZone();
  const stempel = Date.now();
  const r = Object.assign({}, oud);
  const gezien = {};
  const agendas = kiesAgendas_();
  const info = { tijd: stempel, agendas: agendas.map(function (a) { return a.getName(); }), aantal: 0, fout: null };
  if (!agendas.length) {
    const namen = CalendarApp.getAllCalendars().map(function (c) { return c.getName(); });
    info.fout = 'agenda "' + AGENDA_NAMEN.join('", "') + '" niet gevonden. Het script ziet: ' + (namen.join(', ') || 'geen agenda\'s');
    return { afspraken: oud, info: info };
  }

  agendas.forEach(function (agenda) {
    let afspraken;
    try {
      afspraken = agenda.getEvents(van, tot);
    } catch (err) {
      return; // agenda niet leesbaar: overslaan
    }
    afspraken.forEach(function (ev) {
      const titel = ev.getTitle() || '';
      const beschrijving = ev.getDescription() || '';
      const werk = CODE_SW.test(titel) || CODE_SW.test(beschrijving);
      if (!werk && !CODE_S.test(titel) && !CODE_S.test(beschrijving)) return;

      const heleDag = ev.isAllDayEvent();
      let datum, eindDatum, tijd;
      if (heleDag) {
        datum = Utilities.formatDate(ev.getAllDayStartDate(), scriptTz, 'yyyy-MM-dd');
        eindDatum = Utilities.formatDate(new Date(ev.getAllDayEndDate().getTime() - 43200000), scriptTz, 'yyyy-MM-dd');
        tijd = null;
      } else {
        datum = Utilities.formatDate(ev.getStartTime(), agendaTz, 'yyyy-MM-dd');
        eindDatum = Utilities.formatDate(new Date(ev.getEndTime().getTime() - 1000), agendaTz, 'yyyy-MM-dd');
        tijd = Utilities.formatDate(ev.getStartTime(), agendaTz, 'HH:mm');
      }
      const id = ev.getId() + '_' + datum;
      const schoon = titel.replace(CODE_SW, '$1').replace(CODE_S, '$1').replace(/\s+/g, ' ').trim();
      const item = { id: id, titel: schoon || '(afspraak)', datum: datum, eindDatum: eindDatum, tijd: tijd, werk: werk };
      gezien[id] = true;
      info.aantal++;
      const o = oud[id];
      const zelfde = o && !o.del && o.titel === item.titel && o.datum === item.datum &&
        o.eindDatum === item.eindDatum && o.tijd === item.tijd && o.werk === item.werk;
      if (!zelfde) {
        item.upd = stempel;
        r[id] = item;
      }
    });
  });

  Object.keys(r).forEach(function (id) {
    if (!gezien[id] && !r[id].del) r[id] = { id: id, del: true, upd: stempel };
  });
  return { afspraken: r, info: info };
}

/**
 * Samenvoegen van twee versies: per object wint de recentste `upd`.
 * Bij gelijke `upd` blijft de versie uit `a`. Elke sleutel behalve
 * `instellingen` is een collectie. (Zelfde functie als in js/model.js.)
 */
function isCollectie_(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function merge(a, b) {
  a = a || {};
  b = b || {};
  const r = {};
  const sleutels = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); }));
  sleutels.forEach(function (k) {
    if (k === 'instellingen') return;
    if (!isCollectie_(a[k]) && !isCollectie_(b[k])) {
      r[k] = a[k] !== undefined ? a[k] : b[k];
      return;
    }
    r[k] = Object.assign({}, a[k] || {});
    Object.keys(b[k] || {}).forEach(function (id) {
      const v = b[k][id];
      const o = r[k][id];
      if (!o || (v.upd || 0) > (o.upd || 0)) r[k][id] = v;
    });
  });
  const ia = a.instellingen;
  const ib = b.instellingen;
  r.instellingen = !ia || (ib && (ib.upd || 0) > (ia.upd || 0)) ? ib : ia;
  return r;
}

// ---------- Drive ----------
// Saga gebruikt de Drive-API rechtstreeks met het beperkte recht "drive.file":
// het script kan enkel de bestanden zien en wijzigen die het zelf aangemaakt heeft,
// niet de rest van je Drive. (DriveApp zou toegang tot je hele Drive vragen.)

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

function drive_(methode, url, opties) {
  opties = opties || {};
  const params = {
    method: methode,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };
  if (opties.json !== undefined) {
    params.contentType = 'application/json';
    params.payload = JSON.stringify(opties.json);
  }
  if (opties.inhoud !== undefined) {
    params.contentType = 'application/json';
    params.payload = opties.inhoud;
  }
  const antwoord = UrlFetchApp.fetch(url, params);
  const code = antwoord.getResponseCode();
  if ((code === 404 || code === 403) && opties.magOntbreken) return null;
  if (code >= 300) throw new Error('Drive ' + code + ': ' + antwoord.getContentText().slice(0, 200));
  return antwoord.getContentText();
}

// Bestaat het bestand (of de map) nog en staat het niet in de prullenbak?
function bestaat_(id) {
  const meta = id && drive_('get', DRIVE_API + '/' + id + '?fields=id,trashed', { magOntbreken: true });
  return !!meta && !JSON.parse(meta).trashed;
}

function haalMap_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SAGA_MAP');
  if (bestaat_(id)) return id;
  const map = JSON.parse(drive_('post', DRIVE_API + '?fields=id', {
    json: { name: MAP_NAAM, mimeType: 'application/vnd.google-apps.folder' },
  }));
  props.setProperty('SAGA_MAP', map.id);
  return map.id;
}

function haalBestand_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SAGA_BESTAND');
  if (bestaat_(id)) return id;
  // Nieuw (of oud bestand van vóór de beperkte rechten): de toestellen vullen het bij de volgende sync.
  const f = JSON.parse(drive_('post', DRIVE_API + '?fields=id', {
    json: { name: BESTAND_NAAM, parents: [haalMap_()], mimeType: 'application/json' },
  }));
  schrijfBestand_(f.id, '{}');
  props.setProperty('SAGA_BESTAND', f.id);
  return f.id;
}

function leesData_(id) {
  return JSON.parse(drive_('get', DRIVE_API + '/' + id + '?alt=media') || '{}');
}

function schrijfBestand_(id, tekst) {
  drive_('patch', UPLOAD_API + '/' + id + '?uploadType=media', { inhoud: tekst });
}

function maakDagelijkseBackup_(bestand) {
  const props = PropertiesService.getScriptProperties();
  const vandaag = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (props.getProperty('SAGA_LAATSTE_BACKUP') === vandaag) return;
  const map = haalMap_();
  drive_('post', DRIVE_API + '/' + bestand + '/copy?fields=id', {
    json: { name: 'saga-backup-' + vandaag + '.json', parents: [map] },
  });
  props.setProperty('SAGA_LAATSTE_BACKUP', vandaag);

  const q = "'" + map + "' in parents and name contains 'saga-backup-' and trashed = false";
  const lijst = JSON.parse(drive_('get', DRIVE_API + '?pageSize=100&fields=files(id,name)&q=' + encodeURIComponent(q)));
  lijst.files
    .sort(function (x, y) { return x.name < y.name ? 1 : -1; })
    .slice(BACKUPS_HOUDEN)
    .forEach(function (f) { drive_('patch', DRIVE_API + '/' + f.id, { json: { trashed: true } }); });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
