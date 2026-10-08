// Saga – bewaren op dit toestel en synchroniseren met Google Drive (via Apps Script).

import { leegeState, merge } from './model.js';

const LS_STATE = 'saga.state.v1';
const LS_SYNC = 'saga.sync.v1';
const SCRIPT_VERSIE = 5; // minimaal vereiste versie van apps-script/Code.gs

let state = laadState();
let syncCfg = laadJson(LS_SYNC) || { url: '', token: '' };
let syncStatus = { status: syncCfg.url ? 'wacht' : 'lokaal', melding: '', laatste: laadJson('saga.laatsteSync') };
const luisteraars = new Set();

function laadJson(sleutel) {
  try {
    return JSON.parse(localStorage.getItem(sleutel));
  } catch {
    return null;
  }
}

function laadState() {
  const s = laadJson(LS_STATE);
  return s ? merge(leegeState(), s) : leegeState();
}

function bewaar() {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify(state));
  } catch {
    // Opslag vol of geblokkeerd: de gegevens blijven in het geheugen en gaan mee bij de volgende sync.
  }
}

function melden() {
  for (const f of luisteraars) f();
}

export function getState() {
  return state;
}

export function abonneer(f) {
  luisteraars.add(f);
}

// Alle wijzigingen gaan via deze functie: bewaren, scherm vernieuwen, synchroniseren.
export function wijzig(f) {
  f(state);
  bewaar();
  melden();
  planSync();
}

// Een volledige back-up (bv. een geïmporteerd bestand) samenvoegen met wat er al is.
export function voegSamen(data) {
  state = merge(state, data);
  bewaar();
  melden();
  planSync(200);
}

// ---------- synchronisatie ----------

export function getSync() {
  return { ...syncCfg, ...syncStatus };
}

export function zetSyncCfg(url, token) {
  syncCfg = { url: url.trim(), token: token.trim() };
  localStorage.setItem(LS_SYNC, JSON.stringify(syncCfg));
  zetStatus(syncCfg.url ? 'wacht' : 'lokaal');
  return sync();
}

function zetStatus(status, melding = '') {
  syncStatus = { ...syncStatus, status, melding };
  if (status === 'ok') {
    syncStatus.laatste = Date.now();
    try {
      localStorage.setItem('saga.laatsteSync', JSON.stringify(syncStatus.laatste));
    } catch {
      // niet erg
    }
  }
  melden();
}

// Technische foutmeldingen omzetten naar iets waar je mee verder kunt.
function uitleg(e) {
  const m = e?.message || String(e);
  if (/failed to fetch|networkerror|load failed/i.test(m))
    return 'Saga kan het script niet bereiken. Controleer of het adres klopt (eindigt op /exec) en of bij de implementatie "Wie heeft toegang" op "Iedereen" staat. Ben je offline, dan probeert Saga het later opnieuw.';
  if (/json|unexpected token|doctype/i.test(m))
    return 'Het adres geeft geen antwoord van Saga. Gebruik de URL van de web-app (eindigt op /exec, niet op /dev) en zet "Wie heeft toegang" op "Iedereen".';
  if (m === 'verkeerde sleutel')
    return 'De geheime sleutel klopt niet. Kopieer ze opnieuw uit het uitvoeringslogboek van de functie installeer.';
  return m;
}

let timer = null;
let bezig = false;
let opnieuw = false;

export function planSync(ms = 1500) {
  if (!syncCfg.url) return;
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

// Synchroniseren en meteen de agenda opnieuw laten inlezen.
export function vernieuwAgenda() {
  return sync({ agenda: true });
}

export async function sync({ agenda = false } = {}) {
  if (!syncCfg.url && !syncCfg.token) {
    zetStatus('lokaal');
    return;
  }
  if (!syncCfg.url || !syncCfg.token) {
    zetStatus('fout', syncCfg.url ? 'vul ook de geheime sleutel in.' : 'vul ook het adres van de web-app in.');
    return;
  }
  if (!/^https:\/\/script\.google\.com\/.+\/exec\/?$/.test(syncCfg.url) && !/^http:\/\/localhost/.test(syncCfg.url)) {
    zetStatus('fout', 'het adres moet beginnen met https://script.google.com/ en eindigen op /exec. Kopieer de "URL van de web-app" bij Implementeren → Implementaties beheren.');
    return;
  }
  if (bezig) {
    opnieuw = true;
    return;
  }
  bezig = true;
  zetStatus('bezig');
  try {
    // text/plain vermijdt een CORS-preflight, die Apps Script niet ondersteunt.
    const antwoord = await fetch(syncCfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ actie: 'sync', token: syncCfg.token, data: state, agenda }),
    });
    const j = await antwoord.json();
    if (!j.ok) throw new Error(j.fout || 'onbekende fout');
    // Wijzigingen die tijdens het wachten gebeurden zitten al in `state` en zijn recenter.
    state = merge(state, j.data);
    bewaar();
    syncStatus.agenda = j.agendaInfo || null;
    if ((j.scriptVersie || 1) < SCRIPT_VERSIE) {
      zetStatus('fout', 'je planning is bewaard, maar het Google-script is verouderd. Plak de nieuwe Code.gs, voer "installeer" opnieuw uit en maak een nieuwe versie (zie installatiegids, "Het script bijwerken").');
    } else {
      zetStatus('ok');
    }
  } catch (e) {
    zetStatus('fout', uitleg(e));
  } finally {
    bezig = false;
    if (opnieuw) {
      opnieuw = false;
      planSync(200);
    }
  }
}
