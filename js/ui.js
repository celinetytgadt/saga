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

// Filter van het overzicht en het bakje: domein (alles | school | opleiding).
// (Vroeger ook een klas en "enkel lessen"; lessen staan niet meer in Saga.)
export function leesFilter(f) {
  const d = f && typeof f === 'object' ? f.domein : f;
  return { domein: ['school', 'opleiding'].includes(d) ? d : 'alles', lessen: false, klasId: null };
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

// Wat het filter toont. Vroeger werk bij een les en de weekblokken staan niet op de planning.
export function toonTaak(s, t) {
  if (M.isLesWerk(t) || M.isWeekblok(t)) return false;
  const f = ui.filter;
  return f.domein === 'alles' || M.domeinVan(t) === f.domein;
}

export function toonOpdracht(o) {
  const f = ui.filter;
  return f.domein === 'alles' || M.opdrachtDomein(o) === f.domein;
}

// ---------- korte melding onderaan, met "Ongedaan maken" ----------

let toastTimer = null;

// `acties`: knoppen [{ label, doe }]. Een melding die blijft staan (`duur: 0`)
// krijgt een kruisje om ze weg te klikken.
export function melding(tekst, { ongedaan = null, actie = null, acties = [], duur = 6000 } = {}) {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(toastTimer);
  const knoppen = ongedaan ? [{ label: 'Ongedaan maken', doe: ongedaan }] : [...(actie ? [actie] : []), ...acties];
  el.innerHTML =
    `<span>${esc(tekst)}</span>` +
    knoppen.map((k, i) => `<button type="button" class="toast-knop" data-i="${i}">${esc(k.label)}</button>`).join('') +
    (duur ? '' : '<button type="button" class="toast-sluit" aria-label="Melding sluiten" title="Sluiten">×</button>');
  el.hidden = false;
  for (const b of el.querySelectorAll('.toast-knop')) {
    b.addEventListener('click', () => {
      el.hidden = true;
      knoppen[b.dataset.i].doe();
    });
  }
  el.querySelector('.toast-sluit')?.addEventListener('click', () => (el.hidden = true));
  if (duur) toastTimer = setTimeout(() => (el.hidden = true), duur);
}
