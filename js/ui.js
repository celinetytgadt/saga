// Saga – gedeelde toestand van de schermen en kleine hulpjes.

import * as M from './model.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const mobiel = matchMedia('(max-width: 760px)');
export const WEEK = [1, 2, 3, 4, 5, 6, 0]; // ma → zo
export const GRIJS = '#8a96a8';

export function lokaal(sleutel, standaard) {
  try {
    return JSON.parse(localStorage.getItem(sleutel)) ?? standaard;
  } catch {
    return standaard;
  }
}

export function bewaarLokaal(sleutel, waarde) {
  try {
    localStorage.setItem(sleutel, JSON.stringify(waarde));
  } catch {
    // niet erg: enkel een voorkeur op dit toestel
  }
}

// Filter van het overzicht en het bakje: domein (alles | school | opleiding),
// eventueel één klas, en eventueel enkel de lessen.
// (Vroeger één woord: 'alles' | 'school' | 'opleiding' | 'lessen'.)
export function leesFilter(f) {
  if (f && typeof f === 'object')
    return { domein: ['school', 'opleiding'].includes(f.domein) ? f.domein : 'alles', lessen: !!f.lessen, klasId: f.klasId || null };
  if (f === 'lessen') return { domein: 'alles', lessen: true, klasId: null };
  return { domein: ['school', 'opleiding'].includes(f) ? f : 'alles', lessen: false, klasId: null };
}

export const ui = {
  view: 'dagen',
  id: null, // bv. de klas bij #/klas/<id>
  wekenTerug: 1, // overzicht: aantal weken vóór deze week
  wekenVooruit: M.WEKEN_START, // overzicht: aantal weken na deze week (groeit bij het scrollen)
  naarVandaag: true, // na het tekenen naar vandaag scrollen (gsm)
  filter: leesFilter(lokaal('saga.filter', 'alles')),
  laatsteKlassen: lokaal('saga.laatsteKlassen', []),
  laatsteVak: null,
  tekst: lokaal('saga.tekst', 'normaal'), // klein | normaal | groot
  weergaveOpen: false, // menu "Weergave" bij het overzicht
  verbergAfspraken: lokaal('saga.verbergAfspraken', false), // persoonlijke afspraken niet tonen (op dit toestel, bv. bij projecteren)
  zijbalk: lokaal('saga.zijbalk', { breedte: 270, verborgen: false }), // bakje op de computer
  tijd: { periode: 'jaar', data: null, volledig: false, bezig: false, fout: '' }, // tijdsoverzicht
  terug: null, // wat er na het sluiten van een dialoog opnieuw moet openen
  herteken: null, // stukje van de open dialoog dat mee moet vernieuwen
};

export function zetFilter(wijziging) {
  ui.filter = leesFilter({ ...ui.filter, ...wijziging });
  bewaarLokaal('saga.filter', ui.filter);
}

// Wat het filter toont. Een klas kiezen toont enkel wat bij die klas hoort.
export function toonTaak(s, t) {
  const f = ui.filter;
  if (f.lessen) return false;
  if (f.klasId) return M.klassenVanTaak(s, t).includes(f.klasId);
  return f.domein === 'alles' || M.domeinVan(t) === f.domein;
}

export function toonLes(l) {
  const f = ui.filter;
  if (f.domein === 'opleiding' && !f.klasId) return false;
  return !f.klasId || M.klassenVanLes(l).includes(f.klasId);
}

export function toonOpdracht(o) {
  const f = ui.filter;
  if (f.lessen) return false;
  if (f.klasId) return (o.klasIds || []).includes(f.klasId);
  return f.domein === 'alles' || M.opdrachtDomein(o) === f.domein;
}

// ---------- korte melding onderaan, met "Ongedaan maken" ----------

let toastTimer = null;

export function melding(tekst, { ongedaan = null, actie = null, duur = 6000 } = {}) {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(toastTimer);
  const knop = ongedaan ? 'Ongedaan maken' : actie?.label;
  el.innerHTML = `<span>${esc(tekst)}</span>${knop ? `<button type="button" class="toast-knop">${esc(knop)}</button>` : ''}`;
  el.hidden = false;
  el.querySelector('.toast-knop')?.addEventListener('click', () => {
    el.hidden = true;
    if (ongedaan) ongedaan();
    else actie?.doe();
  });
  if (duur) toastTimer = setTimeout(() => (el.hidden = true), duur);
}
