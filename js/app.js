// Saga – opstart, navigatie en acties.
//
// Opbouw: ui.js (gedeelde toestand), weergave.js (bouwstenen), views/ (schermen),
// dialogen.js (vensters), model.js (rekenregels), store.js (bewaren en synchroniseren).

import * as M from './model.js';
import { getState, abonneer, wijzig, getSync, zetSyncCfg, sync, syncAlsNodig, vernieuwAgenda, voegSamen, haalAlles } from './store.js';
import { $, esc, ui, mobiel, bewaarLokaal, zetFilter, melding } from './ui.js';
import { snelInvoerHtml, taakTitel, tijdFormHtml, timerHtml } from './weergave.js';
import { viewRaster, viewLijst, viewBakje, bakjeVoorFilter } from './views/overzicht.js';
import { viewKlassen } from './views/school.js';
import { viewKlas } from './views/klas.js';
import { viewOpleiding } from './views/opleiding.js';
import { viewInstellingen } from './views/instellingen.js';
import { viewTijd } from './views/tijd.js';
import { viewVandaag } from './views/vandaag.js';
import {
  dlg, dialoog, metOngedaan, sluit, openTaak, openLes, openOpdracht, openDag, openNieuw, openLeerlingTaak, openStukkenPlakken, openKlas, openVak,
  openOnderwerp, openPlakken, openAfwezigheid,
} from './dialogen.js';

const VIEWS = ['vandaag', 'dagen', 'bakje', 'klassen', 'klas', 'opleiding', 'instellingen', 'tijd'];
// Welk menu-item oplicht bij een scherm.
const NAV = { klas: 'klassen', bakje: 'vandaag' };

// ---------- tekenen ----------

// Elke les één taak, oude blokken omzetten, … Nodig bij het opstarten en wanneer er
// gegevens binnenkomen (synchronisatie, back-up). Geeft true als er iets veranderde.
function ruimOp() {
  if (!M.heeftOpruimwerk(getState())) return false;
  wijzig((st) => {
    M.zorgHoofdtaken(st);
    M.losseBlokkenNaarStukken(st);
    M.herstelDeelDeadlines(st);
  });
  return true;
}

// Wat er na een wijziging opnieuw getekend wordt. Tijdens het slepen wachten we,
// anders verdwijnt het blokje onder je muis.
function opWijziging(soort) {
  // na een synchronisatie kunnen er lessen zonder taak (of oude gegevens) binnengekomen zijn
  if (soort === 'sync' && ruimOp()) return;
  if (soort === 'status' && ui.view !== 'instellingen') return tekenStatus();
  if (ui.sleept) {
    ui.tekenStraks = true;
    return;
  }
  render();
}

function tekenStatus() {
  const sy = getSync();
  const dot = $('#sync-status');
  dot.className = `sync-dot sync-${sy.status}`;
  dot.title = {
    lokaal: 'Alleen op dit toestel',
    wacht: 'Wacht op synchronisatie',
    bezig: 'Synchroniseren…',
    ok: 'Gesynchroniseerd',
    fout: `Synchroniseren mislukt: ${sy.melding}`,
  }[sy.status];
}

// Lopende timer bovenaan, zodat je hem ziet en kunt pauzeren vanop elk scherm.
// Loopt hij al lang (zie timerCheck), dan vraagt de balk of hij nog loopt.
function tekenTimer(s) {
  const balk = $('#timer-balk');
  const t = M.lopendeTaak(s);
  const check = M.timerCheck(t);
  balk.hidden = !t;
  balk.dataset.check = check?.stand || '';
  balk.classList.toggle('vraag', check?.stand === 'vraag');
  document.title = check?.stand === 'vraag' ? '⏱ Loopt je timer nog? · Saga' : 'Saga';
  if (!t) return (balk.innerHTML = '');
  if (check?.stand === 'vraag') {
    balk.innerHTML = `<span class="timer-info" title="${esc(taakTitel(s, t))}"><span class="timer-titel">Loopt "${esc(taakTitel(s, t))}" nog?</span></span>
      <button class="knop klein primair" data-actie="timer-ja" data-id="${t.id}">Ja</button>
      <button class="knop klein" data-actie="timer" data-id="${t.id}">Stop</button>`;
    return;
  }
  balk.innerHTML = `<button class="timer-pauze" data-actie="timer" data-id="${t.id}" aria-label="Timer pauzeren" title="Pauzeren">❚❚</button>
    <span class="timer-info" role="button" tabindex="0" data-actie="taak" data-id="${t.id}" title="${esc(taakTitel(s, t))}">
      <span class="timer-tijd" data-klok="${t.id}">${M.klokTekst(M.bestedeTijd(t))}</span>
      <span class="timer-titel">${esc(taakTitel(s, t))}</span>
    </span>`;
}

// Lopende klokken elke seconde bijwerken, zonder alles opnieuw te tekenen.
function tik() {
  const s = getState();
  for (const el of document.querySelectorAll('[data-klok]')) {
    const t = s.taken[el.dataset.klok];
    if (t?.gestart) el.textContent = M.klokTekst(M.bestedeTijd(t));
  }
}

// Vergeten timer: vragen of hij nog loopt, en stoppen als er geen antwoord komt
// (ook als Saga intussen dicht was: dan stopt hij op het moment van de vraag).
function controleerTimer() {
  const s = getState();
  const t = M.lopendeTaak(s);
  const check = M.timerCheck(t);
  if (check?.stand === 'stop') {
    const uur = new Date(check.tot).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
    wijzig((st) => M.stopTimer(st, t.id, check.tot));
    melding(`Timer van "${taakTitel(s, t)}" gestopt om ${uur}: geen antwoord op "Loopt dit nog?".`, { actie: { label: 'Tijd nakijken', doe: () => openTaak(t.id) }, duur: 0 });
    return;
  }
  if ((check?.stand || '') !== ($('#timer-balk').dataset.check || '')) {
    tekenTimer(s);
    if (check?.stand === 'vraag') navigator.vibrate?.(200);
  }
}

// Een klein feestje bij het afvinken, op de plaats van het vinkje.
function feest(el) {
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'feest';
  f.textContent = '✓';
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height / 2}px`;
  document.body.append(f);
  setTimeout(() => f.remove(), 900);
}

function render() {
  M.metCache(teken);
}

function teken() {
  const s = getState();
  ui.dag = M.vandaag();
  // scrollposities bewaren, zodat de lijsten niet terug naar boven springen
  const scroll = [...document.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollTop]);
  // een openstaand veld om de tijd aan te passen niet wegtekenen
  const tijdForm = $('#app .tijd-form');
  let view = ui.view;
  if (view === 'bakje' && !mobiel.matches) view = 'dagen';
  const html = {
    vandaag: () => viewVandaag(s),
    dagen: () => (mobiel.matches ? viewLijst(s) : viewRaster(s)),
    bakje: () => viewBakje(s),
    klassen: () => viewKlassen(s),
    klas: () => viewKlas(s, ui.id),
    opleiding: () => viewOpleiding(s),
    instellingen: () => viewInstellingen(s),
    tijd: () => viewTijd(s),
  }[view]();
  $('#app').innerHTML = html;
  if (tijdForm) {
    const wrap = $(`#app .timer-wrap[data-taak="${tijdForm.dataset.id}"]`);
    if (wrap) wrap.replaceChildren(tijdForm);
  }
  document.body.dataset.view = view;
  for (const [naam, top] of scroll) {
    const el = $(`[data-scroll="${naam}"]`);
    if (el) el.scrollTop = top;
  }

  for (const a of document.querySelectorAll('[data-nav]')) {
    a.classList.toggle('actief', a.dataset.nav === (NAV[view] || view));
  }
  // enkel wat bleef liggen telt mee: geen grote rode teller voor alles wat nog kan
  const aantal = bakjeVoorFilter(s).liggen.length;
  const badge = $('#bakje-teller');
  badge.textContent = aantal;
  badge.hidden = !aantal;

  tekenStatus();
  tekenTimer(s);

  if (dlg.open && ui.herteken) ui.herteken();

  // hoogte van de balk, voor wat eronder blijft plakken (dagnamen van het raster)
  document.documentElement.style.setProperty('--balk-h', $('.balk').offsetHeight + 'px');
  if (view === 'dagen') volgOnderkant();
  else kijker?.disconnect();

  // gsm: naar vandaag scrollen; computer: bovenaan staat vorige week, dus naar boven
  if (ui.naarVandaag && view === 'dagen') {
    ui.naarVandaag = false;
    const el = mobiel.matches && $('.dag.vandaag');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - $('.balk').offsetHeight - 8);
    else window.scrollTo(0, 0);
  }
}

// #/dagen, #/klas/<id>, …
function route() {
  const [v, id] = location.hash.replace(/^#\/?/, '').split('/');
  // zonder adres: Vandaag
  ui.view = VIEWS.includes(v) ? v : 'vandaag';
  ui.id = id ? decodeURIComponent(id) : null;
  ui.naarVandaag = true;
  window.scrollTo(0, 0);
  if (dlg.open) {
    ui.terug = null;
    sluit();
  }
  if (ui.view === 'tijd') laadTijd();
  render();
}

// Het tijdsoverzicht heeft de volledige planning nodig, ook wat enkel op Drive staat.
async function laadTijd(opnieuw = false) {
  const t = ui.tijd;
  if (t.bezig || (t.data && !opnieuw)) return;
  t.bezig = true;
  t.fout = '';
  render();
  try {
    const r = await haalAlles();
    Object.assign(t, { data: r.data, volledig: r.volledig });
  } catch (e) {
    Object.assign(t, { data: null, volledig: false, fout: e.message });
  } finally {
    t.bezig = false;
    if (ui.view === 'tijd') render();
  }
}

// ---------- doorlopend overzicht ----------

// Bijna onderaan het overzicht? Dan komen er weken bij.
function meerWeken() {
  if (ui.view !== 'dagen' || ui.wekenVooruit >= M.WEKEN_MAX) return;
  ui.wekenVooruit = Math.min(M.WEKEN_MAX, ui.wekenVooruit + 6);
  if (ui.sleept) ui.tekenStraks = true;
  else render();
}

const kijker =
  'IntersectionObserver' in window
    ? new IntersectionObserver((items) => items.some((i) => i.isIntersecting) && meerWeken(), { rootMargin: '0px 0px 600px 0px' })
    : null;

function volgOnderkant() {
  kijker?.disconnect();
  const el = $('[data-meer-weken]');
  if (el) kijker?.observe(el);
}

// ---------- acties ----------

// Persoonlijke afspraken tonen of verbergen: een voorkeur van dit toestel.
function zetVerbergAfspraken(aan) {
  ui.verbergAfspraken = aan;
  bewaarLokaal('saga.verbergAfspraken', aan);
  render();
}

const acties = {
  vink(el) {
    const id = el.dataset.id;
    const t = getState().taken[id];
    if (!t) return;
    if (t.klaar) return wijzig((s) => M.zetKlaar(s, id, false));
    feest(el);
    const n = M.gedaanOp(getState(), M.vandaag()).length + 1;
    metOngedaan(`✓ "${taakTitel(getState(), t)}" afgevinkt${n > 1 ? ` · al ${n} vandaag` : ''}`, (s) => M.zetKlaar(s, id, true));
  },
  'timer-ja'(el) {
    wijzig((s) => M.bevestigTimer(s, el.dataset.id));
  },
  timer(el) {
    const id = el.dataset.id;
    wijzig((s) => (s.taken[id]?.gestart ? M.stopTimer(s, id) : M.startTimer(s, id)));
  },
  // Bestede tijd aanpassen: een veldje in de plaats van de timer.
  'tijd-aanpassen'(el) {
    const t = getState().taken[el.dataset.id];
    const timer = el.closest('.timer');
    if (!t || !timer) return;
    timer.outerHTML = tijdFormHtml(t);
    const veld = document.querySelector(`.tijd-form[data-id="${t.id}"] input`);
    veld?.focus();
    veld?.select();
  },
  'tijd-annuleer'(el) {
    const t = getState().taken[el.dataset.id];
    const form = el.closest('.tijd-form');
    if (t && form) form.outerHTML = timerHtml(t);
  },
  taak(el) {
    const { terugLes, terugOpdracht } = el.dataset;
    const terug = terugLes ? () => openLes(terugLes) : terugOpdracht ? () => openOpdracht(terugOpdracht) : null;
    openTaak(el.dataset.id, {}, terug);
  },
  les(el) {
    openLes(el.dataset.id);
  },
  opdracht(el) {
    openOpdracht(el.dataset.id);
  },
  dag(el) {
    openDag(el.dataset.datum);
  },
  'plan-vandaag'(el) {
    const t = getState().taken[el.dataset.id];
    if (!t) return;
    metOngedaan(`"${taakTitel(getState(), t)}" staat op vandaag`, (s) => M.zetWerkdag(s, t.id, M.vandaag()));
  },
  // Alles wat bleef liggen opnieuw verdelen over de komende vrije dagen
  // (op Vandaag enkel wat bij de magjes staat: `data-ids`).
  herplan(el) {
    const s = getState();
    const ids = el?.dataset.ids?.split(',');
    const plan = M.herplanPlan(s, ids ? ids.map((id) => s.taken[id]).filter(Boolean) : bakjeVoorFilter(s).liggen);
    if (!plan.length) return;
    const laatste = plan.map((p) => p.datum).sort().at(-1);
    metOngedaan(`${plan.length} ${plan.length === 1 ? 'blokje' : 'blokjes'} herpland tot ${M.kortDatum(laatste)}`, (st) => M.pasHerplanToe(st, plan));
  },
  'snel-noteren'() {
    snelNoteren();
  },
  afwezigheid(el) {
    openAfwezigheid(el.dataset.id || null, { datum: el.dataset.datum });
  },
  nieuw() {
    openNieuw();
  },
  'nieuwe-taak'(el) {
    const lesId = el.dataset.les || null;
    const opdrachtId = el.dataset.opdracht || null;
    const terug = lesId ? () => openLes(lesId) : opdrachtId ? () => openOpdracht(opdrachtId) : null;
    const extra = el.dataset.onderwerp ? { onderwerpId: el.dataset.onderwerp, domein: 'school' } : el.dataset.domein ? { domein: el.dataset.domein } : {};
    if (el.dataset.klas) extra.klasIds = [el.dataset.klas];
    openTaak(null, { werkdag: el.dataset.datum || null, lesId, opdrachtId, ...extra }, terug);
  },
  'nieuwe-les'(el) {
    openLes(null, { datum: el.dataset.datum || null, klasId: el.dataset.klas || null });
  },
  'nieuwe-opdracht'(el) {
    const domein = el.dataset.domein === 'school' ? 'school' : null;
    openOpdracht(null, { vakId: el.dataset.vak || null, domein, onderwerpId: el.dataset.onderwerp || null, klasId: el.dataset.klas || null });
  },
  // Taak voor leerlingen, bij een les of voor een klas.
  'nieuwe-leerlingtaak'(el) {
    const lesId = el.dataset.les || null;
    openLeerlingTaak(null, { lesId, klasIds: el.dataset.klas ? [el.dataset.klas] : [] }, lesId ? () => openLes(lesId) : null);
  },
  'stukken-plakken'(el) {
    openStukkenPlakken(el.dataset.opdracht);
  },
  verdeel(el) {
    const plan = M.verdeelOpdracht(getState(), el.dataset.opdracht);
    if (!plan.length) return;
    const laatste = plan.map((p) => p.datum).sort().at(-1);
    metOngedaan(`${plan.length} ${plan.length === 1 ? 'stuk' : 'stukken'} verdeeld over je vrije dagen tot ${M.kortDatum(laatste)}`, (s) => M.pasVerdelingToe(s, plan));
  },
  'rooster-plannen'(el) {
    const plan = M.planVolgensRooster(getState(), el.dataset.klas);
    if (!plan.length) return;
    metOngedaan(`${plan.length} ${plan.length === 1 ? 'les' : 'lessen'} ingepland tot ${M.kortDatum(plan.at(-1).datum)}`, (s) => M.pasLesplanToe(s, plan));
  },
  reeks(el) {
    const r = Number(el.dataset.r);
    const plan = M.reeksPlan(getState(), el.dataset.les, el.dataset.klas, r);
    if (!plan) return melding('Dat kan niet: de plaats is al bezet of er is geen lesrooster.');
    metOngedaan(`${plan.length} ${plan.length === 1 ? 'les' : 'lessen'} één lesmoment ${r > 0 ? 'later' : 'vroeger'}`, (s) => M.pasLesplanToe(s, plan));
  },
  tekst(el) {
    ui.tekst = el.dataset.k;
    bewaarLokaal('saga.tekst', ui.tekst);
    zetTekst();
    render();
  },
  agenda() {
    vernieuwAgenda();
  },
  'bakje-verberg'() {
    ui.zijbalk = { ...ui.zijbalk, verborgen: true };
    bewaarLokaal('saga.zijbalk', ui.zijbalk);
    render();
  },
  'bakje-toon'() {
    ui.zijbalk = { ...ui.zijbalk, verborgen: false };
    bewaarLokaal('saga.zijbalk', ui.zijbalk);
    render();
  },
  filter(el) {
    zetFilter({ domein: el.dataset.domein, klasId: null });
    render();
  },
  // Alles weer tonen: geen klas, alle domeinen, ook taken en afspraken.
  'filter-wis'() {
    zetFilter({ domein: 'alles', klasId: null, lessen: false });
    zetVerbergAfspraken(false);
  },
  // Vanop de pagina van een klas: het overzicht met enkel die klas.
  'filter-klas'(el) {
    zetFilter({ klasId: el.dataset.klas, lessen: false });
    location.hash = '#/dagen';
  },
  'naar-vandaag'() {
    ui.wekenTerug = 1;
    ui.wekenVooruit = M.WEKEN_START;
    ui.naarVandaag = true;
    render();
  },
  'meer-weken'() {
    meerWeken();
  },
  // Eerdere weken komen bovenaan bij; de weken die je zag blijven op hun plaats.
  'eerdere-weken'() {
    const hoogte = document.documentElement.scrollHeight;
    ui.wekenTerug = Math.min(M.WEKEN_TERUG_MAX, ui.wekenTerug + 2);
    render();
    window.scrollBy(0, document.documentElement.scrollHeight - hoogte);
  },
  'tijd-periode'(el) {
    ui.tijd.periode = el.dataset.p;
    render();
  },
  'tijd-laden'() {
    laadTijd(true);
  },
  'klas-bewerk'(el) {
    openKlas(el.dataset.id || null);
  },
  'vak-bewerk'(el) {
    openVak(el.dataset.id || null);
  },
  'onderwerp-bewerk'(el) {
    openOnderwerp(el.dataset.id || null);
  },
  'lessen-plakken'(el) {
    openPlakken(el.dataset.klas);
  },
  werkdag(el) {
    const d = Number(el.dataset.dag);
    wijzig((s) => {
      const w = new Set(s.instellingen.werkdagen);
      w.has(d) ? w.delete(d) : w.add(d);
      s.instellingen = { ...s.instellingen, werkdagen: [...w].sort(), upd: Date.now() };
    });
  },
  // Download: de volledige planning (ook wat enkel nog op Drive staat).
  async backup(el) {
    el.disabled = true;
    let data = getState();
    try {
      data = (await haalAlles()).data;
    } catch (e) {
      melding(`Enkel wat op dit toestel staat (${e.message})`);
    } finally {
      el.disabled = false;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `saga-backup-${M.vandaag()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

document.addEventListener('click', (e) => {
  // klik buiten het menu "Weergave": menu dicht
  const menu = $('.weergave-menu[open]');
  if (menu && !e.target.closest('.weergave-menu')) menu.open = false;
  if (e.target.closest('[data-sluit-dlg]') && dlg.open) {
    ui.terug = null;
    sluit();
  }
  const el = e.target.closest('[data-actie]');
  if (!el) return;
  const f = acties[el.dataset.actie];
  if (!f) return;
  e.preventDefault();
  f(el, e);
});

// Snel noteren vanop elk scherm (toets N op de computer): het veld op het scherm, anders een venstertje.
function snelNoteren() {
  const veld = $('#app .snel-invoer textarea');
  if (veld && !dlg.open) {
    veld.scrollIntoView({ block: 'center' });
    return veld.focus();
  }
  dialoog(`<h2>Snel noteren</h2>${snelInvoerHtml('in-venster')}<p class="hint">Komt in het bakje. Een lijst plakken mag: elke regel wordt een to do.</p>`);
  $('#dlg .snel-invoer textarea')?.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-actie]')) {
    e.preventDefault();
    e.target.click();
  }
  // in het notitieveld: Enter bewaart, Shift+Enter is een nieuwe regel
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches?.('.snel-invoer textarea')) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
  const typt = e.target.closest?.('input, textarea, select, [contenteditable]');
  if ((e.key === 'n' || e.key === 'N') && !typt && !dlg.open && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    snelNoteren();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.instellingGetal) {
    wijzig((s) => {
      s.instellingen = { ...s.instellingen, [el.dataset.instellingGetal]: Number(el.value), upd: Date.now() };
    });
  } else if (el.dataset.instelling) {
    // instellingen die direct bij wijziging bewaard worden
    wijzig((s) => {
      s.instellingen = { ...s.instellingen, [el.dataset.instelling]: el.checked, upd: Date.now() };
    });
  } else if (el.dataset.extraAgenda) {
    // extra agenda aan- of uitvinken en meteen opnieuw inlezen
    wijzig((s) => {
      const lijst = (s.instellingen.extraAgendas || []).filter((id) => id !== el.dataset.extraAgenda);
      if (el.checked) lijst.push(el.dataset.extraAgenda);
      s.instellingen = { ...s.instellingen, extraAgendas: lijst, upd: Date.now() };
    });
    vernieuwAgenda();
  } else if (el.dataset.lokaal === 'verbergAfspraken') {
    zetVerbergAfspraken(el.checked);
  } else if (el.dataset.weergave === 'lessen') {
    zetFilter({ lessen: el.checked });
    render();
  } else if (el.matches('[data-filter-klas]')) {
    zetFilter({ klasId: el.value || null });
    render();
  } else if ((el.id === 'backup-in' || el.id === 'backup-terug') && el.files[0]) {
    const terug = el.id === 'backup-terug';
    el.files[0]
      .text()
      .then((tekst) => {
        const data = JSON.parse(tekst);
        if (!data || typeof data !== 'object' || !data.taken) throw new Error('geen Saga-back-up');
        if (terug) {
          metOngedaan('Planning teruggezet naar de back-up', (st) => M.herstelNaar(st, data));
          ruimOp();
        } else {
          voegSamen(data);
          melding('Back-up samengevoegd.');
        }
      })
      .catch(() => melding('Dit bestand kon niet gelezen worden. Kies een back-up van Saga (.json).'))
      .finally(() => (el.value = ''));
  }
});

// Het menu "Weergave" blijft open na het tekenen, zolang je het niet zelf sluit.
document.addEventListener(
  'toggle',
  (e) => {
    if (e.target.matches?.('.weergave-menu')) ui.weergaveOpen = e.target.open;
  },
  true
);

document.addEventListener('submit', (e) => {
  if (e.target.id === 'f-sync') {
    e.preventDefault();
    const w = Object.fromEntries(new FormData(e.target).entries());
    zetSyncCfg(w.url, w.token);
  } else if (e.target.matches('.snel-invoer')) {
    e.preventDefault();
    const veld = e.target.tekst;
    const titels = veld.value.split('\n').map((r) => r.trim()).filter(Boolean);
    if (!titels.length) return;
    const domein = ui.filter.domein === 'opleiding' ? 'opleiding' : 'school';
    veld.value = '';
    if (dlg.open && e.target.closest('#dlg')) sluit();
    metOngedaan(titels.length === 1 ? `"${titels[0]}" staat in het bakje` : `${titels.length} to do's in het bakje`, (s) => {
      for (const titel of titels) M.zet(s, 'taken', { id: M.nieuwId(), titel, domein, werkdag: null, deadline: null, vanaf: null, klaar: false, notitie: '' });
    });
    const nieuw = $('#app .snel-invoer textarea');
    if (nieuw && !mobiel.matches) nieuw.focus();
  } else if (e.target.matches('.tijd-form')) {
    e.preventDefault();
    const form = e.target;
    const min = M.leesMinuten(form.tijd.value);
    if (min === null) return (form.querySelector('.fout').hidden = false);
    const id = form.dataset.id;
    form.outerHTML = '<div class="timer"></div>'; // het venster tekent de timer opnieuw
    wijzig((s) => M.zetTijd(s, id, min * 60000));
  }
});

// ---------- slepen (computer) ----------

let sleepZone = null;

function markeerZone(z) {
  if (sleepZone === z) return;
  sleepZone?.classList.remove('drop-hier');
  sleepZone = z;
  z?.classList.add('drop-hier');
}

document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-sleep]');
  if (!el) return;
  e.dataTransfer.setData('text/plain', el.dataset.sleep);
  ui.sleept = true;
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => el.classList.add('sleept'));
});

document.addEventListener('dragend', (e) => {
  e.target.closest?.('[data-sleep]')?.classList.remove('sleept');
  markeerZone(null);
  ui.sleept = false;
  if (ui.tekenStraks) {
    ui.tekenStraks = false;
    render();
  }
});

document.addEventListener('dragover', (e) => {
  const z = e.target.closest?.('[data-drop]');
  markeerZone(z);
  if (z) e.preventDefault();
});

document.addEventListener('drop', (e) => {
  const z = e.target.closest?.('[data-drop]');
  markeerZone(null);
  if (!z) return;
  e.preventDefault();
  const [soort, id] = e.dataTransfer.getData('text/plain').split(':');
  const doel = z.dataset.drop === 'bakje' ? null : z.dataset.drop;
  wijzig((s) => {
    if (soort === 'taak') M.zetWerkdag(s, id, doel);
    if (soort === 'les') M.verplaatsLes(s, id, doel);
  });
});

// ---------- bakje breder of smaller slepen ----------

document.addEventListener('pointerdown', (e) => {
  const greep = e.target.closest?.('[data-greep]');
  if (!greep) return;
  e.preventDefault();
  const overzicht = greep.closest('.overzicht');
  const links = overzicht.getBoundingClientRect().left + parseFloat(getComputedStyle(overzicht).paddingLeft);
  greep.classList.add('actief');
  greep.setPointerCapture(e.pointerId);
  const beweeg = (ev) => {
    const breedte = Math.round(Math.min(480, Math.max(180, ev.clientX - links)));
    ui.zijbalk = { ...ui.zijbalk, breedte };
    overzicht.style.setProperty('--zijbalk', breedte + 'px');
  };
  const klaar = () => {
    greep.classList.remove('actief');
    greep.removeEventListener('pointermove', beweeg);
    greep.removeEventListener('pointerup', klaar);
    greep.removeEventListener('pointercancel', klaar);
    bewaarLokaal('saga.zijbalk', ui.zijbalk);
  };
  greep.addEventListener('pointermove', beweeg);
  greep.addEventListener('pointerup', klaar);
  greep.addEventListener('pointercancel', klaar);
});

// ---------- start ----------

function zetTekst() {
  document.documentElement.dataset.tekst = ui.tekst;
}
zetTekst();

abonneer(opWijziging);
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', syncAlsNodig);
mobiel.addEventListener('change', render);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (ui.dag !== M.vandaag()) render(); // de datum van vandaag is veranderd
    sync();
  } else {
    syncAlsNodig();
  }
});
setInterval(() => document.visibilityState === 'visible' && sync(), 15 * 60 * 1000);
setInterval(() => {
  controleerTimer(); // ook op de achtergrond, zodat de titel van het tabblad de vraag toont
  if (document.visibilityState === 'visible') tik();
}, 1000);

ruimOp();
route();
sync();

// Nieuwe versie van de app klaar? Dan een melding om te herladen.
// (Niet bij de allereerste keer: dan was er nog geen versie.)
if ('serviceWorker' in navigator) {
  const hadVersie = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nieuw = reg.installing;
        nieuw?.addEventListener('statechange', () => {
          if (nieuw.state === 'activated' && hadVersie)
            melding('Er is een nieuwe versie van Saga.', { actie: { label: 'Herladen', doe: () => location.reload() }, duur: 0 });
        });
      });
    })
    .catch(() => {});
}
