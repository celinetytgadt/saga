// Saga – bewaren op dit toestel en synchroniseren met Google Drive (via Apps Script).

import { leegeState, merge, actief, vandaag, momentopname, zetTerug } from './model.js';

const LS_STATE = 'saga.state.v1';
const LS_SYNC = 'saga.sync.v1';
const SCRIPT_VERSIE = 7; // minimaal vereiste versie van apps-script/Code.gs

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

// soort: 'data' (de planning veranderde hier), 'sync' (er kwam iets binnen van een
// ander toestel of uit een back-up) of 'status' (enkel de synchronisatiestatus).
function melden(soort = 'data') {
  for (const f of luisteraars) f(soort);
}

export function getState() {
  return state;
}

export function abonneer(f) {
  luisteraars.add(f);
}

// Alle wijzigingen gaan via deze functie: bewaren, scherm vernieuwen, synchroniseren.
// Geeft terug wat `f` teruggeeft.
export function wijzig(f) {
  const r = f(state);
  bewaar();
  melden();
  planSync();
  return r;
}

// Zelfde als wijzig, maar geeft ook een functie die alles weer ongedaan maakt.
export function wijzigOngedaan(f) {
  const foto = momentopname(state);
  const resultaat = wijzig(f);
  return { resultaat, ongedaan: () => wijzig((st) => zetTerug(st, foto)) };
}

// Een back-up (bv. een geïmporteerd bestand) samenvoegen met wat er al is.
export function voegSamen(data) {
  state = merge(state, data);
  bewaar();
  melden('sync');
  planSync(200);
}

// ---------- synchronisatie ----------

// Bij het verlaten of wegleggen van de app: openstaande wijzigingen meteen doorsturen.
export function syncAlsNodig() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    sync();
  }
}

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
  const zelfde = syncStatus.status === status && syncStatus.melding === melding;
  syncStatus = { ...syncStatus, status, melding };
  if (status === 'ok') {
    syncStatus.laatste = Date.now();
    try {
      localStorage.setItem('saga.laatsteSync', JSON.stringify(syncStatus.laatste));
    } catch {
      // niet erg
    }
  }
  if (!zelfde || status === 'ok') melden('status');
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

// Kwam er iets nieuws binnen? (merge behoudt dezelfde objecten als er niets veranderde)
function iets(voor, na) {
  if (voor.instellingen !== na.instellingen) return true;
  return Object.keys(na).some((k) => {
    if (k === 'instellingen' || !na[k] || typeof na[k] !== 'object') return false;
    if (Object.keys(na[k]).length !== Object.keys(voor[k] || {}).length) return true; // er viel iets weg
    return Object.keys(na[k]).some((id) => na[k][id] !== voor[k]?.[id]);
  });
}

// text/plain vermijdt een CORS-preflight, die Apps Script niet ondersteunt.
async function post(verzoek) {
  const antwoord = await fetch(syncCfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...verzoek, token: syncCfg.token }),
  });
  const j = await antwoord.json();
  if (!j.ok) throw new Error(j.fout === 'onbekende actie' ? 'script verouderd' : j.fout || 'onbekende fout');
  return j;
}

// De volledige planning, ook wat enkel nog op Drive staat (voor het tijdsoverzicht en
// de back-up). Zonder synchronisatie: wat op dit toestel staat.
export async function haalAlles() {
  if (!syncCfg.url || !syncCfg.token) return { data: state, volledig: false };
  try {
    const j = await post({ actie: 'alles', data: state });
    if ((j.scriptVersie || 1) < SCRIPT_VERSIE) throw new Error('script verouderd');
    return { data: merge(state, j.data), volledig: true };
  } catch (e) {
    throw new Error(e.message === 'script verouderd' ? 'het Google-script is verouderd (zie installatiegids, "Het script bijwerken").' : uitleg(e));
  }
}

let timer = null;
let bezig = false;
let opnieuw = false;

// Wijzigingen worden gebundeld: pas 20 seconden na de laatste wijziging gaat alles naar Drive.
export function planSync(ms = 20000) {
  if (!syncCfg.url) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    sync();
  }, ms);
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
    const verzonden = Date.now();
    const j = await post({ actie: 'sync', data: state, agenda });
    // Wijzigingen die tijdens het wachten gebeurden zitten al in `state` en zijn recenter.
    // Wat ouder is dan een maand en al op Drive staat, mag van het toestel (zie actief).
    const voor = state;
    state = actief(merge(state, j.data), vandaag(), Date.now(), verzonden);
    bewaar();
    if (iets(voor, state)) melden('sync');
    syncStatus.agenda = j.agendaInfo || null;
    syncStatus.scriptVersie = j.scriptVersie || 1;
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
