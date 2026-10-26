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
 * titel of beschrijving. Uit de extra agenda's die je in Saga aanvinkt (Instellingen → Agenda's)
 * neemt het alle afspraken over. Het script schrijft nooit in de agenda.
 *
 * Alles blijft bewaard in het bestand (ook afgewerkte en verwijderde dingen), zodat je
 * achteraf kunt zien waar je tijd naartoe ging. Bij het synchroniseren krijgt een toestel
 * enkel terug wat de laatste maand nog speelde (zie actief, dezelfde regels als in js/model.js);
 * met de actie "alles" krijgt het de volledige planning (voor het tijdsoverzicht en de back-up).
 *
 * Elke ochtend (rond 6 uur) stuurt het script, als je dat aanzette in Saga (Instellingen →
 * Ochtendmail), een korte mail naar jezelf: wat vandaag gepland staat, welke lessen je moet
 * voorbereiden, wat er ingediend wordt en wat bleef liggen.
 *
 * Installatie: zie docs/INSTALLATIE.md.
 */

const MAP_NAAM = 'Saga';
const BESTAND_NAAM = 'saga-data.json';
const BACKUPS_HOUDEN = 14;

// Verhogen bij elke wijziging die de app moet kennen; de app waarschuwt bij een oudere versie.
const SCRIPT_VERSIE = 11;

// Welke agenda('s) gelezen worden, op naam (hoofdletters maken niet uit).
// Leeg laten ([]) = alle agenda's die je in Google Agenda ziet.
const AGENDA_NAMEN = ['De Zottekes'];

// Link in de ochtendmail.
const APP_URL = 'https://celinetytgadt.github.io/saga/#/vandaag';

const AGENDA_DAGEN_TERUG = 7;
// Een jaar vooruit: een opleiding plant haar lesdagen vaak maanden op voorhand.
const AGENDA_DAGEN_VOORUIT = 365;
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
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'ochtendMail'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('ochtendMail').timeBased().everyDays(1).atHour(6).create();
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
    if (verzoek.actie === 'sync' || verzoek.actie === 'alles') {
      const samen = merge(opgeslagen, verzoek.data || {});
      if (verzoek.agenda) samen.afspraken = bewaarAgendaInfo_(leesAgenda_(samen.afspraken || {}, extraAgendas_(samen)));
      const tekst = JSON.stringify(samen);
      if (tekst !== JSON.stringify(opgeslagen)) {
        maakDagelijkseBackup_(bestand);
        schrijfBestand_(bestand, tekst);
      }
      const vandaag = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const data = verzoek.actie === 'alles' ? samen : actief(samen, vandaag, Date.now());
      return json_({ ok: true, data: data, scriptVersie: SCRIPT_VERSIE, agendaInfo: agendaInfo_() });
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
    data.afspraken = bewaarAgendaInfo_(leesAgenda_(data.afspraken || {}, extraAgendas_(data)));
    if (JSON.stringify(data.afspraken) !== voor) schrijfBestand_(bestand, JSON.stringify(data));
  } finally {
    slot.releaseLock();
  }
}

/** Dagelijks (trigger): een korte mail met de dag, als die aanstaat in Saga. */
function ochtendMail() {
  const data = leesData_(haalBestand_());
  if (!data.instellingen || !data.instellingen.ochtendmail) return;
  const vandaag = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const brief = dagBriefje_(data, vandaag);
  if (!brief) return;
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Saga · ' + brief.onderwerp, brief.tekst);
}

/** Om te testen vanuit de editor: stuurt de ochtendmail meteen (ook als ze uitstaat). */
function testOchtendMail() {
  const data = leesData_(haalBestand_());
  const vandaag = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const brief = dagBriefje_(data, vandaag) || { onderwerp: 'niets gepland', tekst: 'Niets gepland vandaag.' };
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Saga · ' + brief.onderwerp, brief.tekst);
  Logger.log(brief.tekst);
}

// ---------- ochtendmail: de dag in een paar regels ----------
// Dezelfde regels als in de app (js/model.js), in het kort.

const DAGEN_ = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAANDEN_ = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function datum_(s) {
  return new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
}

function iso_(d) {
  const z = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

function plusDagen_(s, n) {
  const d = datum_(s);
  d.setDate(d.getDate() + n);
  return iso_(d);
}

function kortDatum_(s) {
  const d = datum_(s);
  return DAGEN_[d.getDay()] + ' ' + d.getDate() + ' ' + MAANDEN_[d.getMonth()];
}

function levend_(c) {
  return Object.keys(c || {}).map(function (id) { return c[id]; }).filter(function (o) { return o && !o.del; });
}

function isWerkdag_(data, d) {
  const m = (data.dagen || {})[d];
  if (m && !m.del && typeof m.werkdag === 'boolean') return m.werkdag;
  const sw = levend_(data.afspraken).some(function (a) { return a.werk && a.datum <= d && d <= (a.eindDatum || a.datum); });
  return sw || ((data.instellingen || {}).werkdagen || []).indexOf(datum_(d).getDay()) !== -1;
}

function werkdagVan_(t) {
  return t.werkdag || (t.indien ? plusDagen_(t.indien, 1) : null);
}

function titel_(data, t) {
  if (t.soort === 'verbeteren' && t.indien) return 'Verbeteren CR: ' + t.titel;
  const les = t.lesId && data.lessen && data.lessen[t.lesId];
  return t.titel || (les && les.titel) || '(zonder titel)';
}

function klasNamen_(data, ids) {
  return (ids || []).map(function (id) { return data.klassen && data.klassen[id] && data.klassen[id].naam; }).filter(Boolean).join(' + ');
}

// { onderwerp, tekst } of null als er niets te melden is.
function dagBriefje_(data, vandaag) {
  const taken = levend_(data.taken).filter(function (t) { return !t.klaar; });
  const lessen = levend_(data.lessen);
  const regels = [];

  const gepland = taken.filter(function (t) { return werkdagVan_(t) === vandaag; });
  if (gepland.length) {
    regels.push('Gepland voor vandaag:');
    gepland.forEach(function (t) { regels.push('  ○ ' + titel_(data, t)); });
  }

  const werkdagen = [];
  for (let i = 1; i <= 21 && werkdagen.length < 2; i++) {
    const d = plusDagen_(vandaag, i);
    if (isWerkdag_(data, d)) werkdagen.push(d);
  }
  const voorbereiden = lessen
    .filter(function (l) { return werkdagen.indexOf(l.datum) !== -1; })
    .filter(function (l) { return taken.some(function (t) { return t.lesId === l.id && t.hoofd; }); })
    .sort(function (a, b) { return a.datum < b.datum ? -1 : 1; });
  if (voorbereiden.length) {
    regels.push('', 'Nog voor te bereiden:');
    voorbereiden.forEach(function (l) { regels.push('  ○ ' + kortDatum_(l.datum) + ' · ' + klasNamen_(data, l.klasIds || [l.klasId]) + ' · ' + l.titel); });
  }

  const indienen = taken.filter(function (t) { return t.indien === vandaag; });
  if (indienen.length) {
    regels.push('', 'Vandaag ingediend:');
    indienen.forEach(function (t) { regels.push('  ⚑ ' + t.titel); });
  }

  const liggen = taken.filter(function (t) {
    const wd = werkdagVan_(t);
    if (!wd || wd >= vandaag) return false;
    const les = t.hoofd && data.lessen && data.lessen[t.lesId];
    return !(les && les.datum && les.datum < vandaag);
  });
  if (liggen.length) regels.push('', liggen.length + (liggen.length === 1 ? ' blokje bleef' : ' blokjes bleven') + ' liggen. In Saga kun je ze in één keer herplannen.');

  if (!regels.length) return null;
  regels.push('', 'Open Saga: ' + APP_URL);
  const delen = [];
  if (gepland.length) delen.push(gepland.length + ' gepland');
  if (voorbereiden.length) delen.push(voorbereiden.length + (voorbereiden.length === 1 ? ' les' : ' lessen') + ' voor te bereiden');
  if (!delen.length && liggen.length) delen.push(liggen.length + ' bleef liggen');
  if (!delen.length) delen.push('vandaag ingediend');
  return { onderwerp: kortDatum_(vandaag) + ' · ' + delen.join(', '), tekst: regels.join('\n') };
}

/** Handig om te testen vanuit de editor: toont welke agenda's er zijn en wat Saga zou overnemen. */
function testAgenda() {
  Logger.log('Agenda\'s in je account: %s', CalendarApp.getAllCalendars().map(function (c) { return c.getName(); }).join(', '));
  const r = leesAgenda_({}, extraAgendas_(leesData_(haalBestand_())));
  Logger.log('Gelezen: %s', r.info.agendas.concat(r.info.extra).join(', ') || '(geen)');
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

// De extra agenda's die in Saga aangevinkt zijn (Instellingen → Agenda's), op id.
function extraAgendas_(data) {
  const lijst = data && data.instellingen && data.instellingen.extraAgendas;
  return Array.isArray(lijst) ? lijst : [];
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
 * Uit AGENDA_NAMEN enkel afspraken met #s of #sw; uit de extra agenda's (ids in `extra`) alle afspraken,
 * met de naam van de agenda erbij. Enkel wat veranderde krijgt een nieuwe `upd`; verdwenen afspraken
 * (ook die van een agenda die je uitvinkte) worden als verwijderd gemarkeerd.
 * Wordt de hoofdagenda niet gevonden, dan blijft alles zoals het was.
 */
function leesAgenda_(oud, extra) {
  extra = extra || [];
  const nu = new Date();
  const van = new Date(nu.getTime() - AGENDA_DAGEN_TERUG * 86400000);
  const tot = new Date(nu.getTime() + AGENDA_DAGEN_VOORUIT * 86400000);
  const scriptTz = Session.getScriptTimeZone();
  const agendaTz = CalendarApp.getDefaultCalendar().getTimeZone();
  const stempel = Date.now();
  const r = Object.assign({}, oud);
  const gezien = {};
  const agendas = kiesAgendas_();
  const hoofd = agendas.map(function (a) { return a.getId(); });
  // Alle andere agenda's: om in Saga te kunnen aanvinken.
  const anderen = CalendarApp.getAllCalendars().filter(function (c) { return hoofd.indexOf(c.getId()) === -1; });
  const extraAgendas = anderen.filter(function (c) { return extra.indexOf(c.getId()) !== -1; });
  const info = {
    tijd: stempel,
    tot: Utilities.formatDate(tot, scriptTz, 'yyyy-MM-dd'),
    agendas: agendas.map(function (a) { return a.getName(); }),
    aantal: 0,
    fout: null,
    extra: extraAgendas.map(function (a) { return a.getName(); }),
    aantalExtra: 0,
    alle: anderen.map(function (c) { return { id: c.getId(), naam: c.getName() }; }),
  };
  if (!agendas.length) {
    const namen = CalendarApp.getAllCalendars().map(function (c) { return c.getName(); });
    info.fout = 'agenda "' + AGENDA_NAMEN.join('", "') + '" niet gevonden. Het script ziet: ' + (namen.join(', ') || 'geen agenda\'s');
    return { afspraken: oud, info: info };
  }

  agendas.concat(extraAgendas).forEach(function (agenda) {
    const isExtra = extraAgendas.indexOf(agenda) !== -1;
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
      if (!isExtra && !werk && !CODE_S.test(titel) && !CODE_S.test(beschrijving)) return;

      const heleDag = ev.isAllDayEvent();
      let datum, eindDatum, tijd, eindTijd;
      if (heleDag) {
        datum = Utilities.formatDate(ev.getAllDayStartDate(), scriptTz, 'yyyy-MM-dd');
        eindDatum = Utilities.formatDate(new Date(ev.getAllDayEndDate().getTime() - 43200000), scriptTz, 'yyyy-MM-dd');
        tijd = null;
        eindTijd = null;
      } else {
        datum = Utilities.formatDate(ev.getStartTime(), agendaTz, 'yyyy-MM-dd');
        eindDatum = Utilities.formatDate(new Date(ev.getEndTime().getTime() - 1000), agendaTz, 'yyyy-MM-dd');
        tijd = Utilities.formatDate(ev.getStartTime(), agendaTz, 'HH:mm');
        eindTijd = Utilities.formatDate(ev.getEndTime(), agendaTz, 'HH:mm');
      }
      // Dezelfde afspraak in twee agenda's (uitnodiging) maar één keer: de hoofdagenda gaat voor.
      const id = ev.getId() + '_' + datum;
      if (gezien[id]) return;
      const schoon = titel.replace(CODE_SW, '$1').replace(CODE_S, '$1').replace(/\s+/g, ' ').trim();
      const item = { id: id, titel: schoon || '(afspraak)', datum: datum, eindDatum: eindDatum, tijd: tijd, eindTijd: eindTijd, werk: werk };
      if (isExtra) item.agenda = agenda.getName();
      gezien[id] = true;
      if (isExtra) info.aantalExtra++;
      else info.aantal++;
      const o = oud[id];
      const zelfde = o && !o.del && o.titel === item.titel && o.datum === item.datum &&
        o.eindDatum === item.eindDatum && o.tijd === item.tijd && o.eindTijd === item.eindTijd && o.werk === item.werk &&
        (o.agenda || null) === (item.agenda || null);
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

/**
 * Wat een toestel nog nodig heeft: enkel wat de laatste maand nog speelde.
 * (Zelfde functie als in js/model.js; de tests controleren dat ze hetzelfde doen.)
 */
const ACTIEF_DAGEN = 31;

function actief(state, vandaagDatum, nu, bewaardTot) {
  const d = new Date(Number(vandaagDatum.slice(0, 4)), Number(vandaagDatum.slice(5, 7)) - 1, Number(vandaagDatum.slice(8, 10)) - ACTIEF_DAGEN);
  const z = (n) => String(n).padStart(2, '0');
  const grens = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  let grensMs = nu - ACTIEF_DAGEN * 86400000;
  if (typeof bewaardTot === 'number' && bewaardTot < grensMs) grensMs = bewaardTot;
  const recent = (o) => (o.upd || 0) > grensMs;
  const taken = state.taken || {};
  const metStukken = {};
  Object.keys(taken).forEach((id) => {
    const t = taken[id];
    if (t && !t.del && t.opdrachtId) metStukken[t.opdrachtId] = true;
  });
  const eigenOud = (k, o) => {
    if (!o || typeof o !== 'object') return false;
    if (o.del) return !recent(o);
    if (k === 'taken') return !recent(o) && !!o.klaar && (o.werkdag || '') < grens;
    if (k === 'lessen') return !recent(o) && !!o.datum && o.datum < grens;
    if (k === 'opdrachten') return !recent(o) && (o.deadline ? o.deadline < grens : !!metStukken[o.id]);
    if (k === 'afspraken') return (o.eindDatum || o.datum || '') < grens;
    if (k === 'dagen') return String(o.id || '') < grens;
    if (k === 'afwezigheden') return !recent(o) && (o.tot || o.van || '') < grens;
    return false;
  };
  const levend = { lessen: {}, opdrachten: {} };
  Object.keys(taken).forEach((id) => {
    const t = taken[id];
    if (eigenOud('taken', t)) return;
    if (t.lesId) levend.lessen[t.lesId] = true;
    if (t.opdrachtId) levend.opdrachten[t.opdrachtId] = true;
  });
  const ouderBlijft = (k, id) => {
    const o = state[k] && state[k][id];
    return !!o && (!!levend[k][id] || !eigenOud(k, o));
  };
  const r = {};
  Object.keys(state).forEach((k) => {
    const c = state[k];
    if (k === 'instellingen' || !c || typeof c !== 'object' || Array.isArray(c)) {
      r[k] = c;
      return;
    }
    const nieuw = {};
    let weg = false;
    Object.keys(c).forEach((id) => {
      const o = c[id];
      let blijft;
      if (k === 'lessen' || k === 'opdrachten') blijft = ouderBlijft(k, id);
      else if (k === 'taken')
        blijft = !eigenOud(k, o) || (!!o.lesId && ouderBlijft('lessen', o.lesId)) || (!!o.opdrachtId && ouderBlijft('opdrachten', o.opdrachtId));
      else blijft = !eigenOud(k, o);
      if (blijft) nieuw[id] = o;
      else weg = true;
    });
    r[k] = weg ? nieuw : c;
  });
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
