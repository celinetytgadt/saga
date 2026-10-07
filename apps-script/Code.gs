/**
 * Saga – opslag op Google Drive.
 *
 * Dit script draait in het Google-account van Céline en bewaart de planning
 * als één JSON-bestand in de map "Saga" op Drive. Elke dag wordt een
 * back-up bewaard (de laatste 14 blijven staan).
 *
 * Installatie: zie docs/INSTALLATIE.md.
 */

const MAP_NAAM = 'Saga';
const BESTAND_NAAM = 'saga-data.json';
const BACKUPS_HOUDEN = 14;

const COLLECTIES = ['klassen', 'lessen', 'taken', 'sjablonen', 'dagen'];

/** Eenmalig uitvoeren vanuit de editor: maakt map, bestand en geheime sleutel aan. */
function installeer() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('SAGA_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SAGA_TOKEN', token);
  }
  haalBestand_();
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
    const opgeslagen = JSON.parse(bestand.getBlob().getDataAsString() || '{}');
    if (verzoek.actie === 'sync') {
      const samen = merge(opgeslagen, verzoek.data || {});
      const tekst = JSON.stringify(samen);
      if (tekst !== JSON.stringify(opgeslagen)) {
        maakDagelijkseBackup_(bestand);
        bestand.setContent(tekst);
      }
      return json_({ ok: true, data: samen });
    }
    return json_({ ok: false, fout: 'onbekende actie' });
  } finally {
    slot.releaseLock();
  }
}

/**
 * Samenvoegen van twee versies: per object wint de recentste `upd`.
 * Bij gelijke `upd` blijft de versie uit `a`. (Zelfde functie als in js/model.js.)
 */
function merge(a, b) {
  a = a || {};
  b = b || {};
  const r = Object.assign({}, b, a);
  COLLECTIES.forEach(function (c) {
    r[c] = Object.assign({}, a[c] || {});
    Object.keys(b[c] || {}).forEach(function (id) {
      const v = b[c][id];
      const o = r[c][id];
      if (!o || (v.upd || 0) > (o.upd || 0)) r[c][id] = v;
    });
  });
  const ia = a.instellingen;
  const ib = b.instellingen;
  r.instellingen = !ia || (ib && (ib.upd || 0) > (ia.upd || 0)) ? ib : ia;
  return r;
}

function haalMap_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SAGA_MAP');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // map verwijderd: hieronder opnieuw aanmaken
    }
  }
  const map = DriveApp.createFolder(MAP_NAAM);
  props.setProperty('SAGA_MAP', map.getId());
  return map;
}

function haalBestand_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SAGA_BESTAND');
  if (id) {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.isTrashed()) return f;
    } catch (err) {
      // bestand verwijderd: hieronder opnieuw aanmaken
    }
  }
  const f = haalMap_().createFile(BESTAND_NAAM, '{}', 'application/json');
  props.setProperty('SAGA_BESTAND', f.getId());
  return f;
}

function maakDagelijkseBackup_(bestand) {
  const props = PropertiesService.getScriptProperties();
  const vandaag = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (props.getProperty('SAGA_LAATSTE_BACKUP') === vandaag) return;
  const map = haalMap_();
  bestand.makeCopy('saga-backup-' + vandaag + '.json', map);
  props.setProperty('SAGA_LAATSTE_BACKUP', vandaag);

  const backups = [];
  const it = map.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf('saga-backup-') === 0) backups.push(f);
  }
  backups.sort(function (x, y) {
    return x.getName() < y.getName() ? 1 : -1;
  });
  backups.slice(BACKUPS_HOUDEN).forEach(function (f) {
    f.setTrashed(true);
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
