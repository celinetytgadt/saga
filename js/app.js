// Saga – schermen en interactie.

import * as M from './model.js';
import { getState, abonneer, wijzig, getSync, zetSyncCfg, sync, voegSamen } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const mobiel = matchMedia('(max-width: 760px)');
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // ma → zo
const GEEN_KLAS = { naam: '?', kleur: '#8a96a8' };

const ui = {
  view: 'dagen',
  weekOffset: 0,
  laatsteKlas: null,
  terug: null, // wat er na het sluiten van een dialoog opnieuw moet openen
  herteken: null, // stukje van de open dialoog dat mee moet vernieuwen
};

// ---------- hulpjes ----------

function klasVan(s, les) {
  const k = les && s.klassen[les.klasId];
  return k && !k.del ? k : GEEN_KLAS;
}

function lesVan(s, taak) {
  const l = taak.lesId && s.lessen[taak.lesId];
  return l && !l.del ? l : null;
}

function vergelijkDatum(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

const sorteerTaken = (s) => (a, b) =>
  a.klaar - b.klaar ||
  vergelijkDatum(M.deadlineVan(s, a), M.deadlineVan(s, b)) ||
  a.titel.localeCompare(b.titel);

const sorteerLessen = (s) => (a, b) =>
  klasVan(s, a).naam.localeCompare(klasVan(s, b).naam) || (a.volg || 0) - (b.volg || 0);

function klassenGesorteerd(s) {
  return M.lijst(s, 'klassen').sort((a, b) => a.naam.localeCompare(b.naam));
}

function sjablonenGesorteerd(s) {
  return M.lijst(s, 'sjablonen').sort((a, b) => (a.volg || 0) - (b.volg || 0));
}

// Taken die in het bakje horen: geen werkdag, en (als ze bij een les horen) de les heeft een datum.
function inTePlannen(s) {
  return M.lijst(s, 'taken').filter((t) => {
    if (t.klaar || t.werkdag) return false;
    if (!t.lesId) return true;
    const l = lesVan(s, t);
    return l && l.datum;
  });
}

function blijvenLiggen(s, v = M.vandaag()) {
  return M.lijst(s, 'taken').filter((t) => !t.klaar && t.werkdag && t.werkdag < v);
}

function dagKort(datum) {
  const d = M.parseDatum(datum);
  return `${d.getDate()} ${M.MAANDNAMEN[d.getMonth()]}`;
}

// ---------- bouwstenen ----------

function taakKaart(s, t) {
  const w = M.waarschuwing(s, t);
  const les = lesVan(s, t);
  const dl = M.deadlineVan(s, t);
  const sub = [];
  if (les) sub.push(`<b>${esc(klasVan(s, les).naam)}</b> ${esc(les.titel)}`);
  if (dl && !t.klaar) sub.push(`⚑ ${M.kortDatum(dl)}`);
  if (w) sub.push(`<span class="reden">${esc(w.reden)}</span>`);
  const kleur = les ? klasVan(s, les).kleur : 'var(--rand-sterk)';
  return `<div class="taak ${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}" draggable="true" data-sleep="taak:${t.id}" style="--klas:${kleur}">
    <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
    <div class="taak-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">
      <span class="titel">${esc(t.titel)}</span>${sub.length ? `<span class="sub">${sub.join(' · ')}</span>` : ''}
    </div>
  </div>`;
}

function lesKaart(s, l) {
  const k = klasVan(s, l);
  const taken = M.takenVanLes(s, l.id);
  const klaar = taken.filter((t) => t.klaar).length;
  const teller = taken.length
    ? `<span class="teller ${klaar === taken.length ? 'af' : ''}">${klaar}/${taken.length}</span>`
    : '';
  return `<div class="les" role="button" tabindex="0" draggable="true" data-sleep="les:${l.id}" data-actie="les" data-id="${l.id}" style="--klas:${k.kleur}">
    <span class="les-klas">${esc(k.naam)}</span><span class="les-titel">${esc(l.titel)}</span>${teller}
  </div>`;
}

function indexeer(s) {
  const lessen = {};
  const taken = {};
  const deadlines = {};
  for (const l of M.lijst(s, 'lessen')) if (l.datum) (lessen[l.datum] ||= []).push(l);
  for (const t of M.lijst(s, 'taken')) {
    if (t.werkdag) (taken[t.werkdag] ||= []).push(t);
    if (!t.klaar) {
      const dl = M.deadlineVan(s, t);
      if (dl && dl !== t.werkdag) (deadlines[dl] ||= []).push(t);
    }
  }
  return { lessen, taken, deadlines };
}

function dagBlok(s, idx, datum, v, raster) {
  const werk = M.isWerkdag(s, datum);
  const weekend = [0, 6].includes(M.weekdag(datum));
  const lessen = (idx.lessen[datum] || []).sort(sorteerLessen(s));
  const taken = (idx.taken[datum] || [])
    .filter((t) => s.instellingen.toonKlaar || !t.klaar)
    .sort(sorteerTaken(s));
  const dls = idx.deadlines[datum] || [];
  const klassen = [
    'dag',
    datum === v && 'vandaag',
    datum < v && 'voorbij',
    werk && 'werkdag',
    weekend && 'weekend',
    datum.endsWith('-01') && 'eerste',
  ].filter(Boolean);
  return `<section class="${klassen.join(' ')}" data-drop="${datum}">
    <header class="dag-kop">
      <span class="dag-datum">${raster ? dagKort(datum) : M.kortDatum(datum)}</span>
      ${werk ? '<span class="label-werk">werk</span>' : ''}
      <button class="dag-plus" data-actie="dag" data-datum="${datum}" aria-label="Acties voor ${M.kortDatum(datum)}">+</button>
    </header>
    ${lessen.map((l) => lesKaart(s, l)).join('')}
    ${taken.map((t) => taakKaart(s, t)).join('')}
    ${
      dls.length
        ? `<div class="deadlines">${dls
            .map((t) => {
              const les = lesVan(s, t);
              return `<div class="deadline" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">⚑ ${esc(t.titel)}${les ? ` · ${esc(klasVan(s, les).naam)}` : ''}</div>`;
            })
            .join('')}</div>`
        : ''
    }
  </section>`;
}

function bakjeInhoud(s) {
  const v = M.vandaag();
  const liggen = blijvenLiggen(s, v).sort(sorteerTaken(s));
  const open = inTePlannen(s).sort(sorteerTaken(s));
  const lessen = M.lijst(s, 'lessen')
    .filter((l) => !l.datum)
    .sort(sorteerLessen(s));
  return `<div class="bakje-kop">
      <h2>Nog in te plannen</h2>
      <button class="knop klein" data-actie="nieuwe-taak">+ taak</button>
    </div>
    ${liggen.length ? `<h3 class="kop-rood">Blijven liggen</h3>${liggen.map((t) => taakKaart(s, t)).join('')}` : ''}
    ${liggen.length && open.length ? '<h3>Zonder werkdag</h3>' : ''}
    ${open.map((t) => taakKaart(s, t)).join('')}
    ${!liggen.length && !open.length ? '<p class="leeg">Alles staat ingepland. 🌿</p>' : ''}
    ${lessen.length ? `<h3>Lessen zonder datum</h3>${lessen.map((l) => lesKaart(s, l)).join('')}` : ''}
    <p class="hint">${mobiel.matches ? 'Tik op een taak om ze naar een dag te verplaatsen.' : 'Sleep blokjes naar een dag, of terug naar hier.'}</p>`;
}

// ---------- schermen ----------

function periodeNav(van, tot) {
  return `<div class="periode-nav">
    <button class="knop klein" data-actie="week" data-d="-1" aria-label="Week terug">‹</button>
    <button class="knop klein" data-actie="week" data-d="0">Vandaag</button>
    <button class="knop klein" data-actie="week" data-d="1" aria-label="Week verder">›</button>
    <span class="periode">${M.kortDatum(van)} – ${M.kortDatum(tot)}</span>
  </div>`;
}

function viewRaster(s) {
  const v = M.vandaag();
  const start = M.plusDagen(M.maandagVan(v), ui.weekOffset * 7);
  const dagen = Array.from({ length: 35 }, (_, i) => M.plusDagen(start, i));
  const idx = indexeer(s);
  return `<div class="overzicht">
    <aside class="bakje zijbalk" data-drop="bakje">${bakjeInhoud(s)}</aside>
    <div class="raster-wrap">
      ${periodeNav(dagen[0], dagen[34])}
      <div class="raster-kop">${WEEK.map((d) => `<div>${M.DAGNAMEN[d]}</div>`).join('')}</div>
      <div class="raster">${dagen.map((d) => dagBlok(s, idx, d, v, true)).join('')}</div>
    </div>
  </div>`;
}

function viewLijst(s) {
  const v = M.vandaag();
  const start = M.plusDagen(v, ui.weekOffset * 7);
  const dagen = Array.from({ length: 30 }, (_, i) => M.plusDagen(start, i));
  const idx = indexeer(s);
  const liggen = blijvenLiggen(s, v).length;
  return `<div class="lijst">
    ${periodeNav(dagen[0], dagen[29])}
    ${liggen ? `<a class="melding" href="#/bakje">${liggen} ${liggen === 1 ? 'taak blijft' : 'taken blijven'} liggen →</a>` : ''}
    ${dagen.map((d) => dagBlok(s, idx, d, v, false)).join('')}
  </div>`;
}

function viewBakje(s) {
  return `<div class="pagina bakje">${bakjeInhoud(s)}</div>`;
}

function klasKaart(s, k) {
  const v = M.vandaag();
  const lessen = M.lessenVanKlas(s, k.id);
  const grens = M.plusDagen(v, -14);
  const oud = lessen.filter((l) => l.datum && l.datum < grens);
  const rest = lessen.filter((l) => !(l.datum && l.datum < grens));
  const regel = (l) => {
    const taken = M.takenVanLes(s, l.id);
    const klaar = taken.filter((t) => t.klaar).length;
    return `<li><div class="lesregel" role="button" tabindex="0" data-actie="les" data-id="${l.id}">
      <span class="lesregel-datum">${l.datum ? M.kortDatum(l.datum) : '—'}</span>
      <span class="lesregel-titel">${esc(l.titel)}</span>
      ${taken.length ? `<span class="teller ${klaar === taken.length ? 'af' : ''}">${klaar}/${taken.length}</span>` : ''}
    </div></li>`;
  };
  return `<section class="kaart klas-kaart" style="--klas:${k.kleur}">
    <header>
      <span class="bol"></span><h2>${esc(k.naam)}</h2>
      <button class="knop klein" data-actie="klas-bewerk" data-id="${k.id}">Bewerken</button>
    </header>
    <p class="rooster-tekst">Lesdagen: ${
      (k.rooster || []).length
        ? WEEK.filter((d) => k.rooster.includes(d))
            .map((d) => M.DAGNAMEN[d])
            .join(', ')
        : '<span class="zacht">nog niet ingesteld</span>'
    }</p>
    ${oud.length ? `<details><summary>Eerdere lessen (${oud.length})</summary><ol class="lessen-lijst">${oud.map(regel).join('')}</ol></details>` : ''}
    ${rest.length ? `<ol class="lessen-lijst">${rest.map(regel).join('')}</ol>` : '<p class="leeg">Nog geen lessen.</p>'}
    <div class="knoppen">
      <button class="knop klein" data-actie="nieuwe-les" data-klas="${k.id}">+ les</button>
      <button class="knop klein" data-actie="lessen-plakken" data-klas="${k.id}">Lijst plakken</button>
    </div>
  </section>`;
}

function viewKlassen(s) {
  const klassen = klassenGesorteerd(s);
  return `<div class="pagina">
    <div class="pagina-kop"><h1>Klassen</h1><button class="knop primair" data-actie="klas-bewerk">+ klas</button></div>
    ${klassen.length ? `<div class="klassen">${klassen.map((k) => klasKaart(s, k)).join('')}</div>` : '<p class="leeg">Nog geen klassen. Voeg je eerste klas toe, bv. BKH4.</p>'}
  </div>`;
}

function deadlineOpties(gekozen, metLes = true, metDatum = true) {
  const opties = [`<option value="geen" ${gekozen === 'geen' ? 'selected' : ''}>geen deadline</option>`];
  if (metDatum) opties.push(`<option value="datum" ${gekozen === 'datum' ? 'selected' : ''}>vaste datum</option>`);
  if (metLes)
    for (const k of M.DEADLINE_KEUZES)
      opties.push(`<option value="${k.sleutel}" ${gekozen === k.sleutel ? 'selected' : ''}>${k.label}</option>`);
  return opties.join('');
}

function viewInstellingen(s) {
  const sy = getSync();
  const statusTekst = {
    lokaal: 'Alleen op dit toestel. Vul hieronder de koppeling in om te synchroniseren.',
    wacht: 'Wacht op synchronisatie…',
    bezig: 'Bezig met synchroniseren…',
    ok: 'Gesynchroniseerd met Google Drive.',
    fout: `Synchroniseren mislukt: ${esc(sy.melding)}`,
  }[sy.status];
  return `<div class="pagina instellingen">
    <h1>Instellingen</h1>

    <section class="kaart">
      <h2>Vaste werkdagen</h2>
      <p class="hint">Op deze dagen sta ik op school. Lesvoorbereiding valt dan een dag vroeger. Een extra werkdag (studiedag, evaluatiedag) duid je aan via de + bij die dag.</p>
      <div class="dagknoppen">${WEEK.map(
        (d) =>
          `<button class="dagknop ${s.instellingen.werkdagen.includes(d) ? 'aan' : ''}" data-actie="werkdag" data-dag="${d}" aria-pressed="${s.instellingen.werkdagen.includes(d)}">${M.DAGNAMEN[d]}</button>`
      ).join('')}</div>
    </section>

    <section class="kaart">
      <h2>Standaardtaken</h2>
      <p class="hint">Worden voorgesteld bij elke nieuwe les. Aanpassen hier verandert niets aan taken die al bestaan.</p>
      <div class="sjablonen">${sjablonenGesorteerd(s)
        .map(
          (sj) => `<div class="sjabloon">
          <input aria-label="Naam" value="${esc(sj.titel)}" data-sj="${sj.id}" data-veld="titel">
          <select aria-label="Klaar tegen" data-sj="${sj.id}" data-veld="deadline">${deadlineOpties(M.deadlineSleutel(sj.deadline), true, false)}</select>
          <label class="check"><input type="checkbox" ${sj.aan ? 'checked' : ''} data-sj="${sj.id}" data-veld="aan"> standaard aangevinkt</label>
          <button class="knop klein gevaar" data-actie="sjabloon-weg" data-id="${sj.id}" aria-label="Verwijder ${esc(sj.titel)}">✕</button>
        </div>`
        )
        .join('')}</div>
      <button class="knop klein" data-actie="sjabloon-nieuw">+ standaardtaak</button>
    </section>

    <section class="kaart">
      <h2>Weergave</h2>
      <label class="check"><input type="checkbox" data-instelling="toonKlaar" ${s.instellingen.toonKlaar ? 'checked' : ''}> Afgevinkte taken blijven zichtbaar in het overzicht</label>
    </section>

    <section class="kaart">
      <h2>Synchronisatie</h2>
      <p class="sync-tekst sync-${sy.status}">${statusTekst}</p>
      <form id="f-sync" class="formulier">
        <label>Adres van de Apps Script-webapp<input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(sy.url)}"></label>
        <label>Geheime sleutel<input name="token" type="password" autocomplete="off" value="${esc(sy.token)}"></label>
        <div class="knoppen"><button class="knop primair">Opslaan en synchroniseren</button></div>
      </form>
      <p class="hint">Hoe je dit instelt: zie <a href="https://github.com/celinetytgadt/saga/blob/HEAD/docs/INSTALLATIE.md" target="_blank" rel="noopener">de installatiegids</a>.</p>
    </section>

    <section class="kaart">
      <h2>Back-up</h2>
      <div class="knoppen">
        <button class="knop" data-actie="backup">Download back-up</button>
        <label class="knop">Back-up inladen<input type="file" accept="application/json,.json" id="backup-in" hidden></label>
      </div>
      <p class="hint">Inladen voegt samen met wat er al staat; er gaat niets verloren.</p>
    </section>

    <p class="credits">Saga · gemaakt door Céline Tytgadt</p>
  </div>`;
}

// ---------- tekenen ----------

function render() {
  const s = getState();
  let view = ui.view;
  if (view === 'bakje' && !mobiel.matches) view = 'dagen';
  const html = {
    dagen: () => (mobiel.matches ? viewLijst(s) : viewRaster(s)),
    bakje: () => viewBakje(s),
    klassen: () => viewKlassen(s),
    instellingen: () => viewInstellingen(s),
  }[view]();
  $('#app').innerHTML = html;
  document.body.dataset.view = view;

  for (const a of document.querySelectorAll('[data-nav]')) {
    a.classList.toggle('actief', a.dataset.nav === view);
  }
  const aantal = inTePlannen(s).length + blijvenLiggen(s).length;
  const badge = $('#bakje-teller');
  badge.textContent = aantal;
  badge.hidden = !aantal;

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

  if ($('#dlg').open && ui.herteken) ui.herteken();
}

function route() {
  const v = location.hash.replace('#/', '');
  ui.view = ['dagen', 'bakje', 'klassen', 'instellingen'].includes(v) ? v : 'dagen';
  render();
  window.scrollTo(0, 0);
}

// ---------- dialogen ----------

const dlg = $('#dlg');

function dialoog(html, init, { terug = null, herteken = null } = {}) {
  ui.terug = terug;
  ui.herteken = herteken;
  dlg.innerHTML = `<div class="dlg-in">${html}</div>`;
  if (!dlg.open) dlg.showModal();
  init?.(dlg);
  const eerste = dlg.querySelector('[autofocus]');
  if (eerste && !mobiel.matches) eerste.focus();
}

function sluit() {
  dlg.close();
}

dlg.addEventListener('click', (e) => {
  if (e.target === dlg) sluit();
});

dlg.addEventListener('close', () => {
  const terug = ui.terug;
  ui.terug = null;
  ui.herteken = null;
  dlg.innerHTML = '';
  if (terug) terug();
});

// Sluit de dialoog zonder terug te keren naar de vorige.
function sluitHelemaal() {
  ui.terug = null;
  sluit();
}

function formWaarden(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function lesOpties(s, gekozen) {
  const grens = M.plusDagen(M.vandaag(), -30);
  const lessen = M.lijst(s, 'lessen')
    .filter((l) => l.id === gekozen || !l.datum || l.datum >= grens)
    .sort((a, b) => vergelijkDatum(a.datum, b.datum) || sorteerLessen(s)(a, b));
  return lessen
    .map(
      (l) =>
        `<option value="${l.id}" ${l.id === gekozen ? 'selected' : ''}>${esc(klasVan(s, l).naam)} · ${esc(l.titel)}${l.datum ? ` (${M.kortDatum(l.datum)})` : ''}</option>`
    )
    .join('');
}

function openTaak(id, voorinvulling = {}, terug = null) {
  const s = getState();
  const t = id
    ? s.taken[id]
    : { titel: '', lesId: null, werkdag: null, deadline: null, vanaf: null, klaar: false, notitie: '', ...voorinvulling };
  if (!t || t.del) return;
  if (!id && t.lesId && !voorinvulling.deadline) t.deadline = { rel: -1 };
  const sleutel = M.deadlineSleutel(t.deadline);
  const vanaf = M.vanafVan(s, t);
  const basis = t.werkdag || M.vandaag();

  dialoog(
    `<h2>${id ? 'Taak' : 'Nieuwe taak'}</h2>
    ${
      id
        ? `<div class="snel" aria-label="Verplaats naar">
        <span class="snel-label">Verplaats naar</span>
        <button class="chip" data-zet="${M.vandaag()}">Vandaag</button>
        <button class="chip" data-zet="${M.plusDagen(M.vandaag(), 1)}">Morgen</button>
        <button class="chip" data-zet="${M.plusDagen(basis, 7)}">+1 week</button>
        <button class="chip" data-zet="">Bakje</button>
      </div>`
        : ''
    }
    <form id="f-taak" class="formulier">
      <label>Wat<input name="titel" required value="${esc(t.titel)}" ${id ? '' : 'autofocus'}></label>
      <label>Bij les<select name="lesId"><option value="">— losse taak —</option>${lesOpties(s, t.lesId)}</select></label>
      <label>Werkdag <small>(wanneer ik eraan werk; leeg = bakje)</small><input type="date" name="werkdag" value="${t.werkdag || ''}"></label>
      <div class="rij">
        <label>Klaar tegen<select name="deadlineSoort">${deadlineOpties(sleutel)}</select></label>
        <label class="dl-datum">Datum<input type="date" name="deadlineDatum" value="${t.deadline?.datum || ''}"></label>
      </div>
      <p class="hint" id="dl-uitleg"></p>
      <label>Kan pas vanaf <small>(optioneel, bv. na indienen)</small><input type="date" name="vanaf" value="${vanaf || ''}"></label>
      <label>Notitie<textarea name="notitie" rows="2">${esc(t.notitie)}</textarea></label>
      <label class="check"><input type="checkbox" name="klaar" ${t.klaar ? 'checked' : ''}> Klaar</label>
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-taak', d);
      const bijwerken = () => {
        const metLes = !!f.lesId.value;
        for (const o of f.deadlineSoort.options) if (o.value.startsWith('rel:')) o.disabled = !metLes;
        if (!metLes && f.deadlineSoort.value.startsWith('rel:')) f.deadlineSoort.value = 'geen';
        f.querySelector('.dl-datum').hidden = f.deadlineSoort.value !== 'datum';
        const proef = { lesId: f.lesId.value, deadline: M.deadlineUitSleutel(f.deadlineSoort.value, f.deadlineDatum.value) };
        const dl = M.deadlineVan(getState(), proef);
        $('#dl-uitleg', d).textContent =
          f.deadlineSoort.value.startsWith('rel:')
            ? dl
              ? `→ ${M.kortDatum(dl)}; schuift mee als de les verschuift.`
              : '→ de les heeft nog geen datum.'
            : '';
      };
      f.addEventListener('change', bijwerken);
      bijwerken();

      const bewaar = (wijzigingen) =>
        wijzig((st) => {
          const huidig = id ? st.taken[id] : null;
          M.zet(st, 'taken', { ...(huidig || t), id: id || M.nieuwId(), ...wijzigingen });
        });

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = formWaarden(f);
        let nieuweVanaf = w.vanaf ? { datum: w.vanaf } : null;
        if (w.vanaf && t.vanaf && w.vanaf === vanaf) nieuweVanaf = t.vanaf; // ongewijzigd: behoud koppeling
        bewaar({
          titel: w.titel.trim(),
          lesId: w.lesId || null,
          werkdag: w.werkdag || null,
          deadline: M.deadlineUitSleutel(w.deadlineSoort, w.deadlineDatum),
          vanaf: nieuweVanaf,
          notitie: w.notitie.trim(),
          klaar: !!w.klaar,
        });
        sluit();
      });
      d.querySelectorAll('[data-zet]').forEach((b) =>
        b.addEventListener('click', () => {
          bewaar({ werkdag: b.dataset.zet || null });
          sluit();
        })
      );
      $('[data-sluit]', d).addEventListener('click', sluit);
      $('[data-weg]', d)?.addEventListener('click', () => {
        if (!confirm(`Taak "${t.titel}" verwijderen?`)) return;
        wijzig((st) => M.wis(st, 'taken', id));
        sluit();
      });
    },
    { terug }
  );
}

function lesTakenHtml(s, lesId) {
  const les = s.lessen[lesId];
  const taken = M.takenVanLes(s, lesId).sort(sorteerTaken(s));
  const titels = new Set(taken.map((t) => t.titel.toLowerCase()));
  const ontbrekend = sjablonenGesorteerd(s).filter((sj) => !titels.has(sj.titel.toLowerCase()));
  return `<h3>Taken</h3>
    ${
      taken.length
        ? `<ul class="les-taken">${taken
            .map((t) => {
              const w = M.waarschuwing(s, t);
              const dl = M.deadlineVan(s, t);
              const info = [
                t.werkdag ? `werk: ${M.kortDatum(t.werkdag)}` : 'in bakje',
                dl ? `⚑ ${M.kortDatum(dl)}` : '',
              ].filter(Boolean);
              return `<li class="${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}">
                <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
                <div class="taak-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}" data-terug-les="${lesId}">
                  <span class="titel">${esc(t.titel)}</span><span class="sub">${info.join(' · ')}${w ? ` · <span class="reden">${esc(w.reden)}</span>` : ''}</span>
                </div>
              </li>`;
            })
            .join('')}</ul>`
        : '<p class="leeg">Nog geen taken bij deze les.</p>'
    }
    <div class="chips">
      ${ontbrekend.map((sj) => `<button type="button" class="chip" data-actie="sjabloon-bij-les" data-les="${lesId}" data-sj="${sj.id}">+ ${esc(sj.titel)}</button>`).join('')}
      <button type="button" class="chip" data-actie="nieuwe-taak" data-les="${lesId}">+ eigen taak</button>
      ${les?.datum ? `<button type="button" class="chip" data-actie="verbeteren" data-les="${lesId}">+ verbeteren</button>` : ''}
    </div>`;
}

function openLes(id, voorinvulling = {}) {
  const s = getState();
  const klassen = klassenGesorteerd(s);
  const l = id
    ? s.lessen[id]
    : {
        klasId: voorinvulling.klasId || ui.laatsteKlas || klassen[0]?.id || '',
        titel: '',
        datum: voorinvulling.datum || null,
      };
  if (!l || l.del) return;

  dialoog(
    `<h2>${id ? 'Les' : 'Nieuwe les'}</h2>
    <form id="f-les" class="formulier">
      <label>Klas<select name="klasId">
        ${klassen.map((k) => `<option value="${k.id}" ${k.id === l.klasId ? 'selected' : ''}>${esc(k.naam)}</option>`).join('')}
        <option value="__nieuw" ${klassen.length ? '' : 'selected'}>+ nieuwe klas…</option>
      </select></label>
      <label class="nieuwe-klas">Naam nieuwe klas<input name="nieuweKlas" placeholder="bv. BKH4"></label>
      <label>Onderwerp<input name="titel" required value="${esc(l.titel)}" placeholder="bv. Aankoopfactuur basis" ${id ? '' : 'autofocus'}></label>
      <label>Datum <small>(leeg = nog niet ingepland)</small><input type="date" name="datum" value="${l.datum || ''}"></label>
      ${
        id
          ? `<p class="hint">Verschuif je de les, dan schuiven de deadlines van de taken mee. Je werkdagen blijven staan.</p>`
          : `<fieldset><legend>Standaardtaken</legend>${sjablonenGesorteerd(s)
              .map(
                (sj) =>
                  `<label class="check"><input type="checkbox" name="sj" value="${sj.id}" ${sj.aan ? 'checked' : ''}> ${esc(sj.titel)} <small>(${M.deadlineLabel(sj.deadline)})</small></label>`
              )
              .join('')}</fieldset>`
      }
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>${id ? 'Sluiten' : 'Annuleren'}</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>
    ${id ? `<div class="les-taken-wrap">${lesTakenHtml(s, id)}</div>` : ''}`,
    (d) => {
      const f = $('#f-les', d);
      const toonNieuweKlas = () => {
        const nieuw = f.klasId.value === '__nieuw';
        f.querySelector('.nieuwe-klas').hidden = !nieuw;
        f.nieuweKlas.required = nieuw;
      };
      f.klasId.addEventListener('change', toonNieuweKlas);
      toonNieuweKlas();

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = formWaarden(f);
        const sjIds = new FormData(f).getAll('sj');
        wijzig((st) => {
          let klasId = w.klasId;
          if (klasId === '__nieuw') {
            klasId = M.nieuwId();
            M.zet(st, 'klassen', {
              id: klasId,
              naam: w.nieuweKlas.trim(),
              kleur: M.KLASKLEUREN[M.lijst(st, 'klassen').length % M.KLASKLEUREN.length],
              rooster: [],
            });
          }
          ui.laatsteKlas = klasId;
          const huidig = id ? st.lessen[id] : null;
          const les = M.zet(st, 'lessen', {
            ...(huidig || {}),
            id: id || M.nieuwId(),
            klasId,
            titel: w.titel.trim(),
            datum: w.datum || null,
            volg: huidig?.volg ?? M.volgendeVolg(st, klasId),
          });
          if (!id) M.maakStandaardTaken(st, les, sjIds);
        });
        sluitHelemaal();
      });
      $('[data-sluit]', d).addEventListener('click', sluitHelemaal);
      $('[data-weg]', d)?.addEventListener('click', () => {
        const n = M.takenVanLes(getState(), id).length;
        if (!confirm(`Les "${l.titel}"${n ? ` en ${n} ${n === 1 ? 'taak' : 'taken'}` : ''} verwijderen?`)) return;
        wijzig((st) => M.verwijderLes(st, id));
        sluitHelemaal();
      });
    },
    {
      herteken: id
        ? () => {
            const wrap = dlg.querySelector('.les-taken-wrap');
            if (wrap) wrap.innerHTML = lesTakenHtml(getState(), id);
          }
        : null,
    }
  );
}

function openVerbeteren(lesId) {
  const s = getState();
  const les = s.lessen[lesId];
  if (!les) return;
  const indien = les.datum || M.vandaag();
  dialoog(
    `<h2>Verbeteren</h2>
    <p class="hint">${esc(klasVan(s, les).naam)} · ${esc(les.titel)}</p>
    <form id="f-verb" class="formulier">
      <label>Wat<input name="titel" required value="Verbeteren ${esc(les.titel)}"></label>
      <label>Indienen door leerlingen<input type="date" name="indien" required value="${indien}"></label>
      <label>Verbeterd tegen <small>(voorstel: volgende les na indienen)</small><input type="date" name="deadline" required value="${M.volgendeLesNa(s, les.klasId, indien)}"></label>
      <div class="knoppen"><span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Toevoegen</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-verb', d);
      let deadlineAangepast = false;
      f.deadline.addEventListener('input', () => (deadlineAangepast = true));
      f.indien.addEventListener('change', () => {
        if (!deadlineAangepast && f.indien.value) f.deadline.value = M.volgendeLesNa(getState(), les.klasId, f.indien.value);
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = formWaarden(f);
        wijzig((st) =>
          M.zet(st, 'taken', {
            id: M.nieuwId(),
            titel: w.titel.trim(),
            lesId,
            werkdag: null,
            vanaf: { datum: w.indien },
            deadline: { datum: w.deadline },
            klaar: false,
            notitie: '',
          })
        );
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
    },
    { terug: () => openLes(lesId) }
  );
}

function openDag(datum) {
  const s = getState();
  const werk = M.isWerkdag(s, datum);
  const standaard = s.instellingen.werkdagen.includes(M.weekdag(datum));
  dialoog(
    `<h2>${M.kortDatum(datum)}</h2>
    <div class="menu">
      <button class="knop" data-actie="nieuwe-taak" data-datum="${datum}">+ taak op deze dag</button>
      <button class="knop" data-actie="nieuwe-les" data-datum="${datum}">+ les op deze dag</button>
      <button class="knop" data-werk>${werk ? 'Geen werkdag maken' : 'Extra werkdag maken'}</button>
    </div>
    <p class="hint">${werk === standaard ? (werk ? 'Vaste werkdag.' : '') : werk ? 'Extra werkdag (manueel aangeduid).' : 'Vaste werkdag, hier uitgezet.'}</p>`,
    (d) => {
      $('[data-werk]', d).addEventListener('click', () => {
        wijzig((st) => M.zet(st, 'dagen', { id: datum, werkdag: !werk === standaard ? null : !werk }));
        sluit();
      });
    }
  );
}

function openKlas(id) {
  const s = getState();
  const k = id ? s.klassen[id] : { naam: '', kleur: M.KLASKLEUREN[M.lijst(s, 'klassen').length % M.KLASKLEUREN.length], rooster: [] };
  dialoog(
    `<h2>${id ? 'Klas bewerken' : 'Nieuwe klas'}</h2>
    <form id="f-klas" class="formulier">
      <label>Naam<input name="naam" required value="${esc(k.naam)}" placeholder="bv. BKH4" autofocus></label>
      <fieldset><legend>Kleur</legend><div class="kleuren">${M.KLASKLEUREN.map(
        (c) => `<label class="kleur" style="--c:${c}"><input type="radio" name="kleur" value="${c}" ${c === k.kleur ? 'checked' : ''}><span></span></label>`
      ).join('')}</div></fieldset>
      <fieldset><legend>Lesdagen <small>(max. 1 les per dag)</small></legend><div class="dagknoppen">${WEEK.map(
        (d) => `<label class="dagknop-check"><input type="checkbox" name="rooster" value="${d}" ${(k.rooster || []).includes(d) ? 'checked' : ''}><span>${M.DAGNAMEN[d]}</span></label>`
      ).join('')}</div></fieldset>
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-klas', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        wijzig((st) =>
          M.zet(st, 'klassen', {
            ...(id ? st.klassen[id] : {}),
            id: id || M.nieuwId(),
            naam: fd.get('naam').trim(),
            kleur: fd.get('kleur') || k.kleur,
            rooster: fd.getAll('rooster').map(Number),
          })
        );
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
      $('[data-weg]', d)?.addEventListener('click', () => {
        const n = M.lessenVanKlas(getState(), id).length;
        if (!confirm(`Klas "${k.naam}"${n ? ` met ${n} lessen en hun taken` : ''} verwijderen?`)) return;
        wijzig((st) => {
          for (const l of M.lessenVanKlas(st, id)) M.verwijderLes(st, l.id);
          M.wis(st, 'klassen', id);
        });
        sluit();
      });
    }
  );
}

function openPlakken(klasId) {
  const s = getState();
  const k = s.klassen[klasId];
  dialoog(
    `<h2>Lessen plakken · ${esc(k.naam)}</h2>
    <form id="f-plak" class="formulier">
      <label>Eén les per regel, in volgorde<textarea name="lijst" rows="8" placeholder="Documentenstroom&#10;Aankoopfactuur basis&#10;Aankoopfactuur met korting" autofocus></textarea></label>
      <label class="check"><input type="checkbox" name="sj" checked> Standaardtaken toevoegen</label>
      <p class="hint">De lessen krijgen nog geen datum en komen bij "Lessen zonder datum". Hun taken verschijnen pas in het bakje zodra de les een datum heeft.</p>
      <div class="knoppen"><span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Toevoegen</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-plak', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const regels = f.lijst.value
          .split('\n')
          .map((r) => r.trim())
          .filter(Boolean);
        const metSj = f.sj.checked;
        wijzig((st) => {
          const sjIds = sjablonenGesorteerd(st)
            .filter((sj) => sj.aan)
            .map((sj) => sj.id);
          let volg = M.volgendeVolg(st, klasId);
          for (const titel of regels) {
            const les = M.zet(st, 'lessen', { id: M.nieuwId(), klasId, titel, datum: null, volg: volg++ });
            if (metSj) M.maakStandaardTaken(st, les, sjIds);
          }
        });
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
    }
  );
}

// ---------- acties ----------

const acties = {
  vink(el) {
    wijzig((s) => {
      const t = s.taken[el.dataset.id];
      if (t) M.zet(s, 'taken', { ...t, klaar: !t.klaar });
    });
  },
  taak(el) {
    const lesId = el.dataset.terugLes;
    openTaak(el.dataset.id, {}, lesId ? () => openLes(lesId) : null);
  },
  les(el) {
    openLes(el.dataset.id);
  },
  dag(el) {
    openDag(el.dataset.datum);
  },
  'nieuwe-taak'(el) {
    const lesId = el.dataset.les || null;
    openTaak(null, { werkdag: el.dataset.datum || null, lesId }, lesId ? () => openLes(lesId) : null);
  },
  'nieuwe-les'(el) {
    if (dlg.open) ui.terug = null;
    openLes(null, { datum: el.dataset.datum || null, klasId: el.dataset.klas || null });
  },
  verbeteren(el) {
    openVerbeteren(el.dataset.les);
  },
  'sjabloon-bij-les'(el) {
    wijzig((s) => M.maakStandaardTaken(s, s.lessen[el.dataset.les], [el.dataset.sj]));
  },
  week(el) {
    const d = Number(el.dataset.d);
    ui.weekOffset = d === 0 ? 0 : ui.weekOffset + d;
    render();
  },
  'klas-bewerk'(el) {
    openKlas(el.dataset.id || null);
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
  'sjabloon-nieuw'() {
    wijzig((s) => {
      const volg = Math.max(0, ...M.lijst(s, 'sjablonen').map((sj) => sj.volg || 0)) + 1;
      M.zet(s, 'sjablonen', { id: M.nieuwId(), titel: 'Nieuwe taak', deadline: { rel: -1 }, aan: false, volg });
    });
  },
  'sjabloon-weg'(el) {
    const sj = getState().sjablonen[el.dataset.id];
    if (sj && confirm(`Standaardtaak "${sj.titel}" verwijderen? Bestaande taken blijven staan.`))
      wijzig((s) => M.wis(s, 'sjablonen', sj.id));
  },
  backup() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `saga-backup-${M.vandaag()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-actie]');
  if (!el) return;
  const f = acties[el.dataset.actie];
  if (!f) return;
  e.preventDefault();
  f(el, e);
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-actie]')) {
    e.preventDefault();
    e.target.click();
  }
});

// Instellingen die direct bij wijziging bewaard worden.
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.sj && el.dataset.veld) {
    wijzig((s) => {
      const sj = s.sjablonen[el.dataset.sj];
      if (!sj) return;
      const waarde = {
        titel: () => el.value.trim() || sj.titel,
        deadline: () => M.deadlineUitSleutel(el.value),
        aan: () => el.checked,
      }[el.dataset.veld]();
      M.zet(s, 'sjablonen', { ...sj, [el.dataset.veld]: waarde });
    });
  } else if (el.dataset.instelling) {
    wijzig((s) => {
      s.instellingen = { ...s.instellingen, [el.dataset.instelling]: el.checked, upd: Date.now() };
    });
  } else if (el.id === 'backup-in' && el.files[0]) {
    el.files[0]
      .text()
      .then((tekst) => {
        voegSamen(JSON.parse(tekst));
        alert('Back-up ingeladen.');
      })
      .catch(() => alert('Dit bestand kon niet gelezen worden.'));
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'f-sync') return;
  e.preventDefault();
  const w = formWaarden(e.target);
  zetSyncCfg(w.url, w.token);
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
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => el.classList.add('sleept'));
});

document.addEventListener('dragend', (e) => {
  e.target.closest?.('[data-sleep]')?.classList.remove('sleept');
  markeerZone(null);
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
    if (soort === 'taak' && s.taken[id]) M.zet(s, 'taken', { ...s.taken[id], werkdag: doel });
    if (soort === 'les' && s.lessen[id]) M.zet(s, 'lessen', { ...s.lessen[id], datum: doel });
  });
});

// ---------- start ----------

abonneer(render);
window.addEventListener('hashchange', route);
mobiel.addEventListener('change', render);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render(); // de datum van vandaag kan veranderd zijn
    sync();
  }
});
setInterval(() => document.visibilityState === 'visible' && sync(), 10 * 60 * 1000);

route();
sync();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
