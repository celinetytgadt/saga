// Saga – bewaren op dit toestel en synchroniseren met Google Drive (via Apps Script).

import { leegeState, merge } from './model.js';

const LS_STATE = 'saga.state.v1';
const LS_SYNC = 'saga.sync.v1';

let state = laadState();
let syncCfg = laadJson(LS_SYNC) || { url: '', token: '' };
let syncStatus = { status: syncCfg.url ? 'wacht' : 'lokaal', melding: '' };
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
  syncStatus = { status, melding };
  melden();
}

let timer = null;
let bezig = false;
let opnieuw = false;

export function planSync(ms = 1500) {
  if (!syncCfg.url) return;
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

export async function sync() {
  if (!syncCfg.url || !syncCfg.token) {
    zetStatus('lokaal');
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
      body: JSON.stringify({ actie: 'sync', token: syncCfg.token, data: state }),
    });
    const j = await antwoord.json();
    if (!j.ok) throw new Error(j.fout || 'onbekende fout');
    // Wijzigingen die tijdens het wachten gebeurden zitten al in `state` en zijn recenter.
    state = merge(state, j.data);
    bewaar();
    zetStatus('ok');
  } catch (e) {
    zetStatus('fout', e.message || String(e));
  } finally {
    bezig = false;
    if (opnieuw) {
      opnieuw = false;
      planSync(200);
    }
  }
}
