// Saga – schermen en interactie.

import * as M from './model.js';
import { getState, abonneer, wijzig, getSync, zetSyncCfg, sync, vernieuwAgenda, voegSamen } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const mobiel = matchMedia('(max-width: 760px)');
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // ma → zo
const GRIJS = '#8a96a8';
const VIEWS = ['dagen', 'bakje', 'klassen', 'opleiding', 'instellingen'];

function lokaal(sleutel, standaard) {
  try {
    return JSON.parse(localStorage.getItem(sleutel)) ?? standaard;
  } catch {
    return standaard;
  }
}

function bewaarLokaal(sleutel, waarde) {
  try {
    localStorage.setItem(sleutel, JSON.stringify(waarde));
  } catch {
    // niet erg: enkel een voorkeur op dit toestel
  }
}

const ui = {
  view: 'dagen',
  maandOffset: 0,
  naarVandaag: true, // na het tekenen naar vandaag scrollen (gsm)
  filter: lokaal('saga.filter', 'alles'), // alles | school | opleiding
  laatsteKlassen: lokaal('saga.laatsteKlassen', []),
  laatsteVak: null,
  tekst: lokaal('saga.tekst', 'normaal'), // klein | normaal | groot
  terug: null, // wat er na het sluiten van een dialoog opnieuw moet openen
  herteken: null, // stukje van de open dialoog dat mee moet vernieuwen
};

// ---------- hulpjes ----------

function klassenVan(s, les) {
  return M.klassenVanLes(les)
    .map((id) => s.klassen[id])
    .filter((k) => k && !k.del);
}

function klasLabel(s, les) {
  return M.groepNaam(klassenVan(s, les).map((k) => k.naam)) || '?';
}

function klasStijl(s, les) {
  const k = klassenVan(s, les);
  const een = k[0]?.kleur || GRIJS;
  return `--klas:${een};--klas2:${(k[1] || k[0])?.kleur || een}`;
}

function vakVan(s, opd) {
  const v = opd && opd.vakId && s.vakken[opd.vakId];
  return v && !v.del ? v : null;
}

function lesVan(s, taak) {
  const l = taak.lesId && s.lessen[taak.lesId];
  return l && !l.del ? l : null;
}

function opdrachtVan(s, taak) {
  const o = taak.opdrachtId && s.opdrachten[taak.opdrachtId];
  return o && !o.del ? o : null;
}

// Waar hoort een taak bij: kleur en een korte omschrijving.
function anker(s, taak) {
  const les = lesVan(s, taak);
  if (les) return { kleur: klassenVan(s, les)[0]?.kleur || GRIJS, label: klasLabel(s, les), titel: les.titel };
  const opd = opdrachtVan(s, taak);
  if (opd) {
    const vak = vakVan(s, opd);
    return { kleur: vak?.kleur || 'var(--fuchsia)', label: vak?.naam || 'Opleiding', titel: opd.titel };
  }
  return { kleur: M.domeinVan(taak) === 'opleiding' ? 'var(--fuchsia)' : 'var(--rand-sterk)', label: '', titel: '' };
}

const toonTaak = (t) => ui.filter === 'alles' || M.domeinVan(t) === ui.filter;
const toonSchool = () => ui.filter !== 'opleiding';
const toonOpleiding = () => ui.filter !== 'school';

function vergelijkDatum(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

const sorteerTaken = (s) => (a, b) =>
  a.klaar - b.klaar ||
  vergelijkDatum(M.deadlineVan(s, a), M.deadlineVan(s, b)) ||
  (a.volg || 0) - (b.volg || 0) ||
  a.titel.localeCompare(b.titel);

const sorteerLessen = (s) => (a, b) => klasLabel(s, a).localeCompare(klasLabel(s, b)) || (a.volg || 0) - (b.volg || 0);

const opNaam = (a, b) => a.naam.localeCompare(b.naam);

function sjablonenGesorteerd(s) {
  return M.lijst(s, 'sjablonen').sort((a, b) => (a.volg || 0) - (b.volg || 0));
}

// Taken die in het bakje horen: geen werkdag, en (als ze bij een les horen) de les heeft een datum.
function inTePlannen(s) {
  return M.lijst(s, 'taken').filter((t) => {
    if (t.klaar || t.werkdag) return false;
    if (t.opdrachtId) return !!opdrachtVan(s, t);
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

function nogDagen(datum) {
  const n = M.verschilDagen(M.vandaag(), datum);
  if (n < 0) return 'voorbij';
  if (n === 0) return 'vandaag';
  if (n === 1) return 'morgen';
  return `nog ${n} d`;
}

function voortgang(taken) {
  const klaar = taken.filter((t) => t.klaar).length;
  return { klaar, totaal: taken.length, pct: taken.length ? Math.round((100 * klaar) / taken.length) : 0 };
}

// ---------- bouwstenen ----------

function taakKaart(s, t) {
  const w = M.waarschuwing(s, t);
  const a = anker(s, t);
  const opl = M.domeinVan(t) === 'opleiding';
  const dl = M.deadlineVan(s, t);
  const sub = [];
  if (a.label) sub.push(`<b>${esc(a.label)}</b> ${esc(a.titel)}`);
  else if (opl) sub.push('<b>Opleiding</b>');
  if (dl && !t.klaar && !t.lesId) sub.push(`⚑ ${M.kortDatum(dl)}`);
  if (w) sub.push(`<span class="reden">${esc(w.reden)}</span>`);
  return `<div class="taak ${opl ? 'opl' : ''} ${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}" draggable="true" data-sleep="taak:${t.id}" style="--klas:${a.kleur}">
    <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
    <div class="taak-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">
      <span class="titel">${opl ? '<span class="pet" aria-label="Opleiding">🎓</span> ' : ''}${esc(t.titel)}</span>${sub.length ? `<span class="sub">${sub.join(' · ')}</span>` : ''}
    </div>
  </div>`;
}

function lesKaart(s, l) {
  const taken = M.takenVanLes(s, l.id);
  const v = voortgang(taken);
  const samen = klassenVan(s, l).length > 1;
  const teller = v.totaal ? `<span class="teller ${v.klaar === v.totaal ? 'af' : ''}">${v.klaar}/${v.totaal}</span>` : '';
  return `<div class="les ${samen ? 'samen' : ''}" role="button" tabindex="0" draggable="true" data-sleep="les:${l.id}" data-actie="les" data-id="${l.id}" style="${klasStijl(s, l)}">
    <span class="les-boven"><span class="les-klas">${esc(klasLabel(s, l))}</span>${teller}</span><span class="les-titel">${esc(l.titel)}</span>
  </div>`;
}

// Taken bundelen per les of opdracht, zodat je eerst ziet waarvoor het is.
// Volgorde: lessen (op datum), dan opdrachten (zoals ingegeven), dan losse taken.
function groepen(s, taken) {
  const map = new Map();
  for (const t of taken) {
    const les = lesVan(s, t);
    const opd = !les && opdrachtVan(s, t);
    const sleutel = les ? 'les:' + les.id : opd ? 'opd:' + opd.id : 'los:' + t.id;
    if (!map.has(sleutel)) map.set(sleutel, { sleutel, les, opd, taken: [] });
    map.get(sleutel).taken.push(t);
  }
  const rang = (g) => (g.les ? 0 : g.opd ? 1 : 2);
  const lijst = [...map.values()].sort(
    (a, b) =>
      rang(a) - rang(b) ||
      (a.les && b.les ? vergelijkDatum(a.les.datum, b.les.datum) || sorteerLessen(s)(a.les, b.les) : 0) ||
      (a.opd && b.opd ? M.volgordeOpdracht(a.opd, b.opd) : 0) ||
      (!a.les && !a.opd ? sorteerTaken(s)(a.taken[0], b.taken[0]) : 0)
  );
  for (const g of lijst) g.taken.sort((a, b) => a.klaar - b.klaar || (a.volg || 0) - (b.volg || 0) || vergelijkDatum(M.deadlineVan(s, a), M.deadlineVan(s, b)));
  return lijst;
}

function groepKaart(s, g, inDag) {
  if (!g.les && !g.opd) return taakKaart(s, g.taken[0]);
  const opl = !!g.opd;
  let kop, kleur;
  if (g.les) {
    kleur = klassenVan(s, g.les)[0]?.kleur || GRIJS;
    kop = `<div class="groep-kop" role="button" tabindex="0" data-actie="les" data-id="${g.les.id}">
      <span class="groep-naam"><b>${esc(klasLabel(s, g.les))}</b> ${esc(g.les.titel)}</span>
      ${g.les.datum ? `<span class="groep-info">les ${M.kortDatum(g.les.datum)}</span>` : ''}
    </div>`;
  } else {
    const vak = vakVan(s, g.opd);
    kleur = vak?.kleur || 'var(--fuchsia)';
    kop = `<div class="groep-kop" role="button" tabindex="0" data-actie="opdracht" data-id="${g.opd.id}">
      <span class="groep-naam">🎓 <b>${esc(g.opd.titel)}</b></span>
      <span class="groep-info">${vak ? esc(vak.naam) + ' · ' : ''}${g.opd.deadline ? `<span class="vlag opl">⚑ ${M.kortDatum(g.opd.deadline)}</span>` : ''}</span>
    </div>`;
  }
  const rijen = g.taken
    .map((t) => {
      const w = M.waarschuwing(s, t);
      const eigen = !t.lesId && t.deadline?.datum && !t.klaar ? ` <span class="rij-dl vlag ${t.opdrachtId ? 'opl' : ''}">⚑ ${M.kortDatum(t.deadline.datum)}</span>` : '';
      return `<div class="rij-taak ${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}" draggable="true" data-sleep="taak:${t.id}">
        <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
        <div class="rij-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">${esc(t.titel)}${eigen}${w ? `<span class="reden">${esc(w.reden)}</span>` : ''}</div>
      </div>`;
    })
    .join('');
  return `<div class="groep ${opl ? 'opl' : ''}" style="--klas:${kleur}">${kop}${rijen}</div>`;
}

function indexeer(s) {
  const lessen = {};
  const taken = {};
  const deadlines = {};
  const eindes = {};
  if (toonSchool()) for (const l of M.lijst(s, 'lessen')) if (l.datum) (lessen[l.datum] ||= []).push(l);
  if (toonOpleiding())
    for (const o of M.lijst(s, 'opdrachten')) {
      const v = voortgang(M.takenVanOpdracht(s, o.id));
      if (o.deadline && !(v.totaal && v.klaar === v.totaal)) (eindes[o.deadline] ||= []).push(o);
    }
  for (const t of M.lijst(s, 'taken')) {
    if (!toonTaak(t)) continue;
    if (t.werkdag) (taken[t.werkdag] ||= []).push(t);
    if (!t.klaar && !t.lesId && !t.deadline?.eind) {
      const dl = M.deadlineVan(s, t);
      if (dl && dl !== t.werkdag) (deadlines[dl] ||= []).push(t);
    }
  }
  return { lessen, taken, deadlines, eindes };
}

function dagBlok(s, idx, datum, v, raster, buiten = false) {
  const werk = M.isWerkdag(s, datum);
  const weekend = [0, 6].includes(M.weekdag(datum));
  const lessen = (idx.lessen[datum] || []).sort(sorteerLessen(s));
  const taken = (idx.taken[datum] || []).filter((t) => s.instellingen.toonKlaar || !t.klaar);
  const dls = idx.deadlines[datum] || [];
  const eindes = idx.eindes[datum] || [];
  const afspraken = M.afsprakenOp(s, datum);
  const klassen = [
    'dag',
    datum === v && 'vandaag',
    datum < v && 'voorbij',
    werk && 'werkdag',
    weekend && 'weekend',
    datum.endsWith('-01') && 'eerste',
    buiten && 'buiten',
  ].filter(Boolean);
  return `<section class="${klassen.join(' ')}" data-drop="${datum}">
    <header class="dag-kop">
      <span class="dag-datum">${raster ? dagKort(datum) : M.kortDatum(datum)}</span>
      ${werk ? `<span class="label-werk" title="werkdag">${raster ? '' : 'werk'}</span>` : ''}
      <button class="dag-plus" data-actie="dag" data-datum="${datum}" aria-label="Acties voor ${M.kortDatum(datum)}">+</button>
    </header>
    ${afspraken
      .map((a) => `<div class="afspraak ${a.werk ? 'werk' : ''}" title="${esc(a.titel)}">${a.tijd ? `<span class="tijd">${a.tijd}</span> ` : ''}${esc(a.titel)}</div>`)
      .join('')}
    ${eindes
      .map(
        (o) =>
          `<div class="einde" role="button" tabindex="0" data-actie="opdracht" data-id="${o.id}">⚑ ${esc(o.titel)}</div>`
      )
      .join('')}
    ${lessen.map((l) => lesKaart(s, l)).join('')}
    ${groepen(s, taken).map((g) => groepKaart(s, g, true)).join('')}
    ${
      dls.length
        ? `<div class="deadlines">${dls
            .map((t) => {
              const a = anker(s, t);
              return `<div class="deadline ${M.domeinVan(t) === 'opleiding' ? 'opl' : ''}" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">⚑ ${esc(t.titel)}${a.label ? ` · ${esc(a.label)}` : ''}</div>`;
            })
            .join('')}</div>`
        : ''
    }
  </section>`;
}

function filterKnoppen() {
  const opties = [
    ['alles', 'Alles'],
    ['school', 'School'],
    ['opleiding', '🎓 Opleiding'],
  ];
  return `<div class="filter" role="group" aria-label="Toon">${opties
    .map(([f, label]) => `<button class="${ui.filter === f ? 'aan' : ''}" data-actie="filter" data-f="${f}" aria-pressed="${ui.filter === f}">${label}</button>`)
    .join('')}</div>`;
}

function bakjeInhoud(s) {
  const v = M.vandaag();
  const liggen = blijvenLiggen(s, v).filter(toonTaak).sort(sorteerTaken(s));
  const open = inTePlannen(s).filter(toonTaak).sort(sorteerTaken(s));
  const school = open.filter((t) => M.domeinVan(t) === 'school');
  const opl = open.filter((t) => M.domeinVan(t) === 'opleiding');
  const lessen = toonSchool()
    ? M.lijst(s, 'lessen')
        .filter((l) => !l.datum)
        .sort(sorteerLessen(s))
    : [];
  const kaarten = (lijst) => groepen(s, lijst).map((g) => groepKaart(s, g, false)).join('');
  return `<div class="bakje-kop">
      <h2>Nog in te plannen</h2>
      <button class="knop klein" data-actie="nieuwe-taak">+ taak</button>
    </div>
    ${liggen.length ? `<h3 class="kop-rood">Blijven liggen</h3>${kaarten(liggen)}` : ''}
    ${school.length ? `${ui.filter === 'alles' || liggen.length ? '<h3>School</h3>' : ''}${kaarten(school)}` : ''}
    ${opl.length ? `${ui.filter === 'alles' || liggen.length ? '<h3 class="kop-opl">🎓 Opleiding</h3>' : ''}${kaarten(opl)}` : ''}
    ${!liggen.length && !open.length ? '<p class="leeg">Alles staat ingepland. 🌿</p>' : ''}
    ${lessen.length ? `<h3>Lessen zonder datum</h3>${lessen.map((l) => lesKaart(s, l)).join('')}` : ''}
    <p class="hint">${mobiel.matches ? 'Tik op een taak om ze naar een dag te verplaatsen.' : 'Sleep blokjes naar een dag, of terug naar hier.'}</p>`;
}

// ---------- schermen ----------

function periodeNav(eerste) {
  return `<div class="periode-nav">
    <button class="knop klein" data-actie="maand" data-d="-1" aria-label="Vorige maand">‹</button>
    <button class="knop klein" data-actie="maand" data-d="0">Vandaag</button>
    <button class="knop klein" data-actie="maand" data-d="1" aria-label="Volgende maand">›</button>
    <span class="periode">${M.maandNaam(eerste)}</span>
    ${filterKnoppen()}
  </div>`;
}

function viewRaster(s) {
  const v = M.vandaag();
  const eerste = M.eersteVanMaand(v, ui.maandOffset);
  const laatste = M.laatsteVanMaand(eerste);
  const dagen = M.maandRaster(eerste);
  const idx = indexeer(s);
  return `<div class="overzicht">
    <aside class="bakje zijbalk" data-drop="bakje" data-scroll="bakje">${bakjeInhoud(s)}</aside>
    <div class="raster-wrap">
      ${periodeNav(eerste)}
      <div class="raster-kop">${WEEK.map((d) => `<div>${M.DAGNAMEN[d]}</div>`).join('')}</div>
      <div class="raster">${dagen.map((d) => dagBlok(s, idx, d, v, true, d < eerste || d > laatste)).join('')}</div>
    </div>
  </div>`;
}

function viewLijst(s) {
  const v = M.vandaag();
  const eerste = M.eersteVanMaand(v, ui.maandOffset);
  const laatste = M.laatsteVanMaand(eerste);
  const dagen = [];
  for (let d = eerste; d <= laatste; d = M.plusDagen(d, 1)) dagen.push(d);
  const idx = indexeer(s);
  const liggen = blijvenLiggen(s, v).filter(toonTaak).length;
  return `<div class="lijst">
    ${periodeNav(eerste)}
    ${liggen ? `<a class="melding" href="#/bakje">${liggen} ${liggen === 1 ? 'taak blijft' : 'taken blijven'} liggen →</a>` : ''}
    ${dagen.map((d) => dagBlok(s, idx, d, v, false)).join('')}
  </div>`;
}

function viewBakje(s) {
  return `<div class="pagina bakje"><div class="bakje-filter">${filterKnoppen()}</div>${bakjeInhoud(s)}</div>`;
}

function klasKaart(s, k) {
  const v = M.vandaag();
  const lessen = M.lessenVanKlas(s, k.id);
  const grens = M.plusDagen(v, -14);
  const oud = lessen.filter((l) => l.datum && l.datum < grens);
  const rest = lessen.filter((l) => !(l.datum && l.datum < grens));
  const regel = (l) => {
    const vg = voortgang(M.takenVanLes(s, l.id));
    const andere = klassenVan(s, l).filter((x) => x.id !== k.id);
    return `<li><div class="lesregel" role="button" tabindex="0" data-actie="les" data-id="${l.id}">
      <span class="lesregel-datum">${l.datum ? M.kortDatum(l.datum) : '—'}</span>
      <span class="lesregel-titel">${esc(l.titel)}${andere.length ? ` <small>+ ${esc(andere.map((x) => x.naam).join(', '))}</small>` : ''}</span>
      ${vg.totaal ? `<span class="teller ${vg.klaar === vg.totaal ? 'af' : ''}">${vg.klaar}/${vg.totaal}</span>` : ''}
    </div></li>`;
  };
  return `<section class="kaart groep-kaart" style="--klas:${k.kleur}">
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
  const klassen = M.lijst(s, 'klassen').sort(opNaam);
  return `<div class="pagina">
    <div class="pagina-kop"><h1>School</h1><button class="knop primair" data-actie="klas-bewerk">+ klas</button></div>
    ${klassen.length ? `<div class="groepen">${klassen.map((k) => klasKaart(s, k)).join('')}</div>` : '<p class="leeg">Nog geen klassen. Voeg je eerste klas toe, bv. BKH4.</p>'}
  </div>`;
}

function opdrachtRegel(s, o) {
  const vg = voortgang(M.takenVanOpdracht(s, o.id));
  const n = o.deadline ? M.verschilDagen(M.vandaag(), o.deadline) : null;
  const dringend = n !== null && n <= 7 && vg.klaar < vg.totaal;
  return `<li><div class="opdrachtregel" role="button" tabindex="0" data-actie="opdracht" data-id="${o.id}">
    <div class="or-boven">
      <span class="or-titel">${esc(o.titel)}</span>
      ${o.deadline ? `<span class="or-dl ${dringend ? 'dringend' : ''}">⚑ ${M.kortDatum(o.deadline)} · ${nogDagen(o.deadline)}</span>` : ''}
    </div>
    <div class="or-onder">
      <div class="voortgang" aria-hidden="true"><span style="width:${vg.pct}%"></span></div>
      <span class="teller ${vg.totaal && vg.klaar === vg.totaal ? 'af' : ''}">${vg.totaal ? `${vg.klaar}/${vg.totaal} stukken` : 'nog geen stukken'}</span>
    </div>
  </div></li>`;
}

function vakKaart(s, vak) {
  const opdrachten = M.opdrachtenVanVak(s, vak?.id || null);
  const v = M.vandaag();
  const afgerond = (o) => {
    const vg = voortgang(M.takenVanOpdracht(s, o.id));
    return o.deadline && o.deadline < v && vg.klaar === vg.totaal;
  };
  const oud = opdrachten.filter(afgerond);
  const rest = opdrachten.filter((o) => !afgerond(o));
  return `<section class="kaart groep-kaart opl" style="--klas:${vak?.kleur || 'var(--fuchsia)'}">
    <header>
      <span class="bol"></span><h2>${vak ? esc(vak.naam) : 'Zonder opleidingsonderdeel'}</h2>
      ${vak ? `<button class="knop klein" data-actie="vak-bewerk" data-id="${vak.id}">Bewerken</button>` : ''}
    </header>
    ${rest.length ? `<ol class="lessen-lijst">${rest.map((o) => opdrachtRegel(s, o)).join('')}</ol>` : '<p class="leeg">Geen lopende opdrachten.</p>'}
    ${oud.length ? `<details><summary>Afgerond (${oud.length})</summary><ol class="lessen-lijst">${oud.map((o) => opdrachtRegel(s, o)).join('')}</ol></details>` : ''}
    ${vak ? `<div class="knoppen"><button class="knop klein" data-actie="nieuwe-opdracht" data-vak="${vak.id}">+ opdracht</button></div>` : ''}
  </section>`;
}

function viewOpleiding(s) {
  const vakken = M.lijst(s, 'vakken').sort(opNaam);
  const zonder = M.opdrachtenVanVak(s, null);
  return `<div class="pagina">
    <div class="pagina-kop"><h1>🎓 Opleiding</h1>
      <div class="knoppen-rij">
        <button class="knop" data-actie="vak-bewerk">+ onderdeel</button>
        <button class="knop primair" data-actie="nieuwe-opdracht">+ opdracht</button>
      </div>
    </div>
    ${
      vakken.length || zonder.length
        ? `<div class="groepen">${vakken.map((v) => vakKaart(s, v)).join('')}${zonder.length ? vakKaart(s, null) : ''}</div>`
        : '<p class="leeg">Nog niets voor je opleiding. Voeg een opleidingsonderdeel toe, en daarna je opdrachten.</p>'
    }
  </div>`;
}

function deadlineOpties(gekozen, { les = true, datum = true, eind = false } = {}) {
  const opties = [`<option value="geen" ${gekozen === 'geen' ? 'selected' : ''}>geen deadline</option>`];
  if (datum) opties.push(`<option value="datum" ${gekozen === 'datum' ? 'selected' : ''}>vaste datum</option>`);
  if (eind) opties.push(`<option value="eind" ${gekozen === 'eind' ? 'selected' : ''}>${M.EIND_KEUZE.label}</option>`);
  if (les)
    for (const k of M.DEADLINE_KEUZES)
      opties.push(`<option value="${k.sleutel}" ${gekozen === k.sleutel ? 'selected' : ''}>${k.label}</option>`);
  return opties.join('');
}

function agendaStatus(info) {
  if (!info) return '';
  const wanneer = new Date(info.tijd);
  const tijd = `${M.kortDatum(M.isoDatum(wanneer))} om ${wanneer.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
  if (info.fout) return `<p class="sync-tekst sync-fout">Agenda: ${esc(info.fout)} (${tijd}). Controleer de naam bovenaan in Code.gs (AGENDA_NAMEN).</p>`;
  return `<p class="sync-tekst">📅 Agenda ${esc(info.agendas.join(', '))} ingelezen op ${tijd}: ${info.aantal} ${info.aantal === 1 ? 'afspraak' : 'afspraken'} met #s of #sw.</p>`;
}

function viewInstellingen(s) {
  const sy = getSync();
  const statusTekst = {
    lokaal: 'Alleen op dit toestel. Vul hieronder de koppeling in om te synchroniseren.',
    wacht: 'Wacht op synchronisatie…',
    bezig: 'Bezig met synchroniseren…',
    ok: `✓ Gesynchroniseerd met Google Drive${sy.laatste ? ` om ${new Date(sy.laatste).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}.`,
    fout: `Synchroniseren mislukt: ${esc(sy.melding)}`,
  }[sy.status];
  return `<div class="pagina instellingen">
    <h1>Instellingen</h1>

    <section class="kaart">
      <h2>Vaste werkdagen</h2>
      <p class="hint">Op deze dagen sta ik op school. Lesvoorbereiding valt dan een dag vroeger, en stukken van opdrachten worden er niet op verdeeld. Een extra werkdag (studiedag, evaluatiedag) duid je aan via de + bij die dag.</p>
      <div class="dagknoppen">${WEEK.map(
        (d) =>
          `<button class="dagknop ${s.instellingen.werkdagen.includes(d) ? 'aan' : ''}" data-actie="werkdag" data-dag="${d}" aria-pressed="${s.instellingen.werkdagen.includes(d)}">${M.DAGNAMEN[d]}</button>`
      ).join('')}</div>
    </section>

    <section class="kaart">
      <h2>Standaardtaken bij een les</h2>
      <p class="hint">Worden voorgesteld bij elke nieuwe les. Aanpassen hier verandert niets aan taken die al bestaan.</p>
      <div class="sjablonen">${sjablonenGesorteerd(s)
        .map(
          (sj) => `<div class="sjabloon">
          <input aria-label="Naam" value="${esc(sj.titel)}" data-sj="${sj.id}" data-veld="titel">
          <select aria-label="Klaar tegen" data-sj="${sj.id}" data-veld="deadline">${deadlineOpties(M.deadlineSleutel(sj.deadline), { datum: false })}</select>
          <label class="check"><input type="checkbox" ${sj.aan ? 'checked' : ''} data-sj="${sj.id}" data-veld="aan"> standaard aangevinkt</label>
          <button class="knop klein gevaar" data-actie="sjabloon-weg" data-id="${sj.id}" aria-label="Verwijder ${esc(sj.titel)}">✕</button>
        </div>`
        )
        .join('')}</div>
      <button class="knop klein" data-actie="sjabloon-nieuw">+ standaardtaak</button>
    </section>

    <section class="kaart">
      <h2>Weergave</h2>
      <p class="hint">Tekstgrootte op dit toestel</p>
      <div class="dagknoppen">${[
        ['klein', 'Kleiner'],
        ['normaal', 'Normaal'],
        ['groot', 'Groter'],
      ]
        .map(([k, l]) => `<button class="dagknop ${ui.tekst === k ? 'aan' : ''}" data-actie="tekst" data-k="${k}" aria-pressed="${ui.tekst === k}">${l}</button>`)
        .join('')}</div>
      <p></p>
      <label class="check"><input type="checkbox" data-instelling="toonKlaar" ${s.instellingen.toonKlaar ? 'checked' : ''}> Afgevinkte taken blijven zichtbaar in het overzicht</label>
    </section>

    <section class="kaart">
      <h2>Synchronisatie</h2>
      <p class="sync-tekst sync-${sy.status}">${statusTekst}</p>
      <form id="f-sync" class="formulier">
        <label>Adres van de Apps Script-webapp<input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(sy.url)}"></label>
        <label>Geheime sleutel<input name="token" type="password" autocomplete="off" value="${esc(sy.token)}"></label>
        <div class="knoppen">
          <button class="knop primair">Opslaan en synchroniseren</button>
          ${sy.url ? '<button type="button" class="knop" data-actie="agenda">Agenda nu vernieuwen</button>' : ''}
        </div>
      </form>
      ${agendaStatus(sy.agenda)}
      <p class="hint">Agenda: afspraken met <b>#s</b> in de titel of beschrijving verschijnen in Saga, met <b>#sw</b> tellen ze ook als werkdag. Ze worden elke nacht ingelezen.</p>
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

// Wat er na een wijziging opnieuw getekend wordt. Tijdens het slepen wachten we,
// anders verdwijnt het blokje onder je muis.
function opWijziging(soort) {
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

function render() {
  const s = getState();
  // scrollposities bewaren, zodat de lijsten niet terug naar boven springen
  const scroll = [...document.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollTop]);
  let view = ui.view;
  if (view === 'bakje' && !mobiel.matches) view = 'dagen';
  const html = {
    dagen: () => (mobiel.matches ? viewLijst(s) : viewRaster(s)),
    bakje: () => viewBakje(s),
    klassen: () => viewKlassen(s),
    opleiding: () => viewOpleiding(s),
    instellingen: () => viewInstellingen(s),
  }[view]();
  $('#app').innerHTML = html;
  document.body.dataset.view = view;
  for (const [naam, top] of scroll) {
    const el = $(`[data-scroll="${naam}"]`);
    if (el) el.scrollTop = top;
  }

  for (const a of document.querySelectorAll('[data-nav]')) {
    a.classList.toggle('actief', a.dataset.nav === view);
  }
  const aantal = inTePlannen(s).length + blijvenLiggen(s).length;
  const badge = $('#bakje-teller');
  badge.textContent = aantal;
  badge.hidden = !aantal;

  tekenStatus();

  if ($('#dlg').open && ui.herteken) ui.herteken();

  if (ui.naarVandaag && view === 'dagen') {
    ui.naarVandaag = false;
    const el = mobiel.matches && $('.dag.vandaag');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - $('.balk').offsetHeight - 8);
  }
}

function route() {
  const v = location.hash.replace('#/', '');
  ui.view = VIEWS.includes(v) ? v : 'dagen';
  ui.naarVandaag = true;
  window.scrollTo(0, 0);
  render();
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

// Enkel sluiten bij een klik die óók buiten het venster begon. Wie tekst selecteert
// en de muis buiten het venster loslaat, verliest zo zijn invoer niet.
let begonBuiten = false;
dlg.addEventListener('pointerdown', (e) => {
  begonBuiten = e.target === dlg;
});
dlg.addEventListener('click', (e) => {
  if (e.target === dlg && begonBuiten) sluit();
  begonBuiten = false;
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

function regels(tekst) {
  return tekst
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

function hoortBijOpties(s, gekozen) {
  const grens = M.plusDagen(M.vandaag(), -30);
  const lessen = M.lijst(s, 'lessen')
    .filter((l) => 'les:' + l.id === gekozen || !l.datum || l.datum >= grens)
    .sort((a, b) => vergelijkDatum(a.datum, b.datum) || sorteerLessen(s)(a, b));
  const opdrachten = M.lijst(s, 'opdrachten')
    .filter((o) => 'opd:' + o.id === gekozen || !o.deadline || o.deadline >= grens)
    .sort((a, b) => vergelijkDatum(a.deadline, b.deadline));
  const optie = (waarde, tekst) => `<option value="${waarde}" ${waarde === gekozen ? 'selected' : ''}>${tekst}</option>`;
  return [
    optie('los:school', '— losse taak · school —'),
    optie('los:opleiding', '— losse taak · opleiding —'),
    lessen.length
      ? `<optgroup label="School · lessen">${lessen
          .map((l) => optie('les:' + l.id, `${esc(klasLabel(s, l))} · ${esc(l.titel)}${l.datum ? ` (${M.kortDatum(l.datum)})` : ''}`))
          .join('')}</optgroup>`
      : '',
    opdrachten.length
      ? `<optgroup label="Opleiding · opdrachten">${opdrachten
          .map((o) => optie('opd:' + o.id, `🎓 ${esc(o.titel)}${o.deadline ? ` (${M.kortDatum(o.deadline)})` : ''}`))
          .join('')}</optgroup>`
      : '',
  ].join('');
}

function leesHoortBij(waarde) {
  const [soort, id] = waarde.split(':');
  return {
    lesId: soort === 'les' ? id : null,
    opdrachtId: soort === 'opd' ? id : null,
    domein: soort === 'los' ? id : soort === 'opd' ? 'opleiding' : 'school',
  };
}

function openTaak(id, voorinvulling = {}, terug = null) {
  const s = getState();
  const t = id
    ? s.taken[id]
    : { titel: '', lesId: null, opdrachtId: null, werkdag: null, deadline: null, vanaf: null, klaar: false, notitie: '', ...voorinvulling };
  if (!t || t.del) return;
  if (!id && !voorinvulling.deadline) {
    if (t.lesId) t.deadline = { rel: -1 };
    if (t.opdrachtId) t.deadline = { eind: true };
  }
  if (!id && !t.lesId && !t.opdrachtId && !t.domein && ui.filter === 'opleiding') t.domein = 'opleiding';
  const hoort = t.lesId ? 'les:' + t.lesId : t.opdrachtId ? 'opd:' + t.opdrachtId : 'los:' + M.domeinVan(t);
  const sleutel = M.deadlineSleutel(t.deadline);
  const vanaf = M.vanafVan(s, t);
  const basis = t.werkdag || M.vandaag();

  dialoog(
    `<h2>${id ? (t.opdrachtId ? 'Stuk van opdracht' : 'Taak') : t.opdrachtId ? 'Nieuw stuk' : 'Nieuwe taak'}</h2>
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
      <label>Hoort bij<select name="hoort">${hoortBijOpties(s, hoort)}</select></label>
      <label>Werkdag <small>(wanneer ik eraan werk; leeg = bakje)</small><input type="date" name="werkdag" value="${t.werkdag || ''}"></label>
      <div class="rij">
        <label>Klaar tegen<select name="deadlineSoort">${deadlineOpties(sleutel, { eind: true })}</select></label>
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
        const bij = leesHoortBij(f.hoort.value);
        for (const o of f.deadlineSoort.options) {
          if (o.value.startsWith('rel:')) o.disabled = !bij.lesId;
          if (o.value === 'eind') o.disabled = !bij.opdrachtId;
        }
        if (f.deadlineSoort.selectedOptions[0]?.disabled) f.deadlineSoort.value = bij.opdrachtId ? 'eind' : 'geen';
        f.querySelector('.dl-datum').hidden = f.deadlineSoort.value !== 'datum';
        const proef = { ...bij, deadline: M.deadlineUitSleutel(f.deadlineSoort.value, f.deadlineDatum.value) };
        const dl = M.deadlineVan(getState(), proef);
        const soort = f.deadlineSoort.value;
        $('#dl-uitleg', d).textContent = soort.startsWith('rel:')
          ? dl
            ? `→ ${M.kortDatum(dl)}; schuift mee als de les verschuift.`
            : '→ de les heeft nog geen datum.'
          : soort === 'eind' && dl
            ? `→ ${M.kortDatum(dl)}; volgt de einddeadline van de opdracht.`
            : '';
      };
      f.addEventListener('change', bijwerken);
      bijwerken();

      const bewaar = (wijzigingen) =>
        wijzig((st) => {
          const huidig = id ? st.taken[id] : null;
          const nieuw = { ...(huidig || t), id: id || M.nieuwId(), ...wijzigingen };
          if (nieuw.opdrachtId && (!huidig || huidig.opdrachtId !== nieuw.opdrachtId)) nieuw.volg = M.volgendStuk(st, nieuw.opdrachtId);
          M.zet(st, 'taken', nieuw);
        });

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = formWaarden(f);
        let nieuweVanaf = w.vanaf ? { datum: w.vanaf } : null;
        if (w.vanaf && t.vanaf && w.vanaf === vanaf) nieuweVanaf = t.vanaf; // ongewijzigd: behoud koppeling
        bewaar({
          titel: w.titel.trim(),
          ...leesHoortBij(w.hoort),
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
        if (!confirm(`"${t.titel}" verwijderen?`)) return;
        wijzig((st) => M.wis(st, 'taken', id));
        sluit();
      });
    },
    { terug }
  );
}

// Lijstje taken in een les- of opdrachtdialoog, met afvinken en openen.
function takenLijst(s, taken, terugAttr) {
  return taken.length
    ? `<ul class="les-taken">${taken
        .map((t) => {
          const w = M.waarschuwing(s, t);
          const dl = M.deadlineVan(s, t);
          const info = [t.werkdag ? `werk: ${M.kortDatum(t.werkdag)}` : 'in bakje', dl && !t.deadline?.eind ? `⚑ ${M.kortDatum(dl)}` : ''].filter(Boolean);
          return `<li class="${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}">
            <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
            <div class="taak-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}" ${terugAttr}>
              <span class="titel">${esc(t.titel)}</span><span class="sub">${info.join(' · ')}${w ? ` · <span class="reden">${esc(w.reden)}</span>` : ''}</span>
            </div>
          </li>`;
        })
        .join('')}</ul>`
    : '';
}

function lesTakenHtml(s, lesId) {
  const les = s.lessen[lesId];
  const taken = M.takenVanLes(s, lesId).sort(sorteerTaken(s));
  const titels = new Set(taken.map((t) => t.titel.toLowerCase()));
  const ontbrekend = sjablonenGesorteerd(s).filter((sj) => !titels.has(sj.titel.toLowerCase()));
  return `<h3>Taken</h3>
    ${takenLijst(s, taken, `data-terug-les="${lesId}"`) || '<p class="leeg">Nog geen taken bij deze les.</p>'}
    <div class="chips">
      ${ontbrekend.map((sj) => `<button type="button" class="chip" data-actie="sjabloon-bij-les" data-les="${lesId}" data-sj="${sj.id}">+ ${esc(sj.titel)}</button>`).join('')}
      <button type="button" class="chip" data-actie="nieuwe-taak" data-les="${lesId}">+ eigen taak</button>
      ${les?.datum ? `<button type="button" class="chip" data-actie="verbeteren" data-les="${lesId}">+ verbeteren</button>` : ''}
    </div>`;
}

// Knoppen om klassen te kiezen (een les kan bij meerdere klassen horen).
function klasKeuze(s, gekozen) {
  const klassen = M.lijst(s, 'klassen').sort(opNaam);
  return `<fieldset><legend>Klas(sen)</legend>
    ${
      klassen.length
        ? `<div class="dagknoppen">${klassen
            .map(
              (k) =>
                `<label class="dagknop-check klaskeuze" style="--klas:${k.kleur}"><input type="checkbox" name="klas" value="${k.id}" ${gekozen.includes(k.id) ? 'checked' : ''}><span>${esc(k.naam)}</span></label>`
            )
            .join('')}</div>`
        : ''
    }
    <label class="klein-veld">${klassen.length ? 'of een nieuwe klas' : 'Nieuwe klas'}<input name="nieuweKlas" placeholder="bv. BKH4"></label>
    <p class="hint fout" id="klas-fout" hidden>Kies minstens één klas.</p>
  </fieldset>`;
}

function openLes(id, voorinvulling = {}) {
  const s = getState();
  const bestaand = (ids) => ids.filter((k) => s.klassen[k] && !s.klassen[k].del);
  const l = id
    ? s.lessen[id]
    : {
        klasIds: voorinvulling.klasId ? [voorinvulling.klasId] : bestaand(ui.laatsteKlassen),
        titel: '',
        datum: voorinvulling.datum || null,
      };
  if (!l || l.del) return;
  const gekozen = M.klassenVanLes(l);

  dialoog(
    `<h2>${id ? 'Les' : 'Nieuwe les'}</h2>
    <form id="f-les" class="formulier">
      ${klasKeuze(s, gekozen)}
      ${id && gekozen.length > 1 ? '<p class="hint">Geef je deze les maar aan één klas? Vink de andere klas uit; de taken blijven bij deze les.</p>' : ''}
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
    ${id ? `<div class="taken-wrap">${lesTakenHtml(s, id)}</div>` : ''}`,
    (d) => {
      const f = $('#f-les', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const klasIds = fd.getAll('klas');
        const nieuweKlas = (fd.get('nieuweKlas') || '').trim();
        if (!klasIds.length && !nieuweKlas) {
          $('#klas-fout', d).hidden = false;
          return;
        }
        wijzig((st) => {
          if (nieuweKlas) {
            const k = M.zet(st, 'klassen', {
              id: M.nieuwId(),
              naam: nieuweKlas,
              kleur: M.KLASKLEUREN[M.lijst(st, 'klassen').length % M.KLASKLEUREN.length],
              rooster: [],
            });
            klasIds.push(k.id);
          }
          ui.laatsteKlassen = klasIds;
          bewaarLokaal('saga.laatsteKlassen', klasIds);
          const huidig = id ? st.lessen[id] : null;
          const les = M.zet(st, 'lessen', {
            ...(huidig || {}),
            id: id || M.nieuwId(),
            klasId: undefined,
            klasIds,
            titel: fd.get('titel').trim(),
            datum: fd.get('datum') || null,
            volg: huidig?.volg ?? M.volgendeVolg(st, klasIds[0]),
          });
          if (!id) M.maakStandaardTaken(st, les, fd.getAll('sj'));
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
            const wrap = dlg.querySelector('.taken-wrap');
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
  const klasIds = M.klassenVanLes(les);
  const indien = les.datum || M.vandaag();
  dialoog(
    `<h2>Verbeteren</h2>
    <p class="hint">${esc(klasLabel(s, les))} · ${esc(les.titel)}</p>
    <form id="f-verb" class="formulier">
      <label>Wat<input name="titel" required value="Verbeteren ${esc(les.titel)}"></label>
      <label>Indienen door leerlingen<input type="date" name="indien" required value="${indien}"></label>
      <label>Verbeterd tegen <small>(voorstel: volgende les na indienen)</small><input type="date" name="deadline" required value="${M.volgendeLesNa(s, klasIds, indien)}"></label>
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
        if (!deadlineAangepast && f.indien.value) f.deadline.value = M.volgendeLesNa(getState(), klasIds, f.indien.value);
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

function opdrachtStukkenHtml(s, opdrachtId) {
  const opd = s.opdrachten[opdrachtId];
  const taken = M.takenVanOpdracht(s, opdrachtId);
  const vg = voortgang(taken);
  const teVerdelen = taken.filter((t) => !t.klaar && !t.werkdag).length;
  return `<h3>Stukken ${vg.totaal ? `· ${vg.klaar}/${vg.totaal} klaar` : ''}</h3>
    ${vg.totaal ? `<div class="voortgang groot" aria-hidden="true"><span style="width:${vg.pct}%"></span></div>` : ''}
    ${takenLijst(s, taken, `data-terug-opdracht="${opdrachtId}"`) || '<p class="leeg">Nog geen stukken. Deel de opdracht op in behapbare stappen.</p>'}
    <div class="chips">
      <button type="button" class="chip" data-actie="nieuwe-taak" data-opdracht="${opdrachtId}">+ stuk</button>
      <button type="button" class="chip" data-actie="stukken-plakken" data-opdracht="${opdrachtId}">Lijst plakken</button>
      ${teVerdelen && opd?.deadline ? `<button type="button" class="chip" data-actie="verdeel" data-opdracht="${opdrachtId}">Verdeel ${teVerdelen} over de komende weken</button>` : ''}
    </div>`;
}

function vakOpties(s, gekozen) {
  return M.lijst(s, 'vakken')
    .sort(opNaam)
    .map((v) => `<option value="${v.id}" ${v.id === gekozen ? 'selected' : ''}>${esc(v.naam)}</option>`)
    .join('');
}

function openOpdracht(id, voorinvulling = {}) {
  const s = getState();
  const vakken = M.lijst(s, 'vakken');
  const o = id ? s.opdrachten[id] : { vakId: voorinvulling.vakId || ui.laatsteVak || vakken[0]?.id || '', titel: '', deadline: '' };
  if (!o || o.del) return;
  dialoog(
    `<h2>${id ? '🎓 Opdracht' : '🎓 Nieuwe opdracht'}</h2>
    <form id="f-opd" class="formulier">
      <label>Opleidingsonderdeel<select name="vakId">
        <option value="">— geen —</option>${vakOpties(s, o.vakId)}
        <option value="__nieuw" ${vakken.length ? '' : 'selected'}>+ nieuw onderdeel…</option>
      </select></label>
      <label class="nieuw-vak">Naam nieuw onderdeel<input name="nieuwVak" placeholder="bv. Didactiek 2"></label>
      <label>Opdracht<input name="titel" required value="${esc(o.titel)}" placeholder="bv. Portfolio stage" ${id ? '' : 'autofocus'}></label>
      <label>Einddeadline<input type="date" name="deadline" required value="${o.deadline || ''}"></label>
      ${
        id
          ? ''
          : `<label>Stukken <small>(één per regel, mag ook later)</small><textarea name="stukken" rows="5" placeholder="Opdracht lezen en plannen&#10;Literatuur zoeken&#10;Hoofdstuk 1 schrijven&#10;Nalezen en indienen"></textarea></label>
             <label class="check"><input type="checkbox" name="verdeel" checked> Stukken meteen verdelen over de komende weken</label>`
      }
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>${id ? 'Sluiten' : 'Annuleren'}</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>
    ${id ? `<div class="taken-wrap">${opdrachtStukkenHtml(s, id)}</div>` : ''}`,
    (d) => {
      const f = $('#f-opd', d);
      const toonNieuw = () => {
        const nieuw = f.vakId.value === '__nieuw';
        f.querySelector('.nieuw-vak').hidden = !nieuw;
        f.nieuwVak.required = nieuw;
      };
      f.vakId.addEventListener('change', toonNieuw);
      toonNieuw();

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = formWaarden(f);
        wijzig((st) => {
          let vakId = w.vakId || null;
          if (vakId === '__nieuw') {
            vakId = M.zet(st, 'vakken', {
              id: M.nieuwId(),
              naam: w.nieuwVak.trim(),
              kleur: M.VAKKLEUREN[M.lijst(st, 'vakken').length % M.VAKKLEUREN.length],
            }).id;
          }
          ui.laatsteVak = vakId;
          const opd = M.zet(st, 'opdrachten', {
            ...(id ? st.opdrachten[id] : {}),
            id: id || M.nieuwId(),
            vakId,
            titel: w.titel.trim(),
            deadline: w.deadline,
            volg: id ? st.opdrachten[id].volg : M.volgendeOpdrachtVolg(st),
          });
          if (!id && w.stukken) {
            M.maakStukken(st, opd.id, regels(w.stukken));
            if (w.verdeel) for (const p of M.verdeelOpdracht(st, opd.id)) M.zet(st, 'taken', { ...p.taak, werkdag: p.datum });
          }
        });
        sluitHelemaal();
      });
      $('[data-sluit]', d).addEventListener('click', sluitHelemaal);
      $('[data-weg]', d)?.addEventListener('click', () => {
        const n = M.takenVanOpdracht(getState(), id).length;
        if (!confirm(`Opdracht "${o.titel}"${n ? ` en ${n} stukken` : ''} verwijderen?`)) return;
        wijzig((st) => M.verwijderOpdracht(st, id));
        sluitHelemaal();
      });
    },
    {
      herteken: id
        ? () => {
            const wrap = dlg.querySelector('.taken-wrap');
            if (wrap) wrap.innerHTML = opdrachtStukkenHtml(getState(), id);
          }
        : null,
    }
  );
}

function openStukkenPlakken(opdrachtId) {
  const opd = getState().opdrachten[opdrachtId];
  dialoog(
    `<h2>Stukken toevoegen</h2>
    <p class="hint">🎓 ${esc(opd.titel)}</p>
    <form id="f-stuk" class="formulier">
      <label>Eén stuk per regel, in volgorde<textarea name="lijst" rows="7" autofocus></textarea></label>
      <div class="knoppen"><span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Toevoegen</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-stuk', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        wijzig((st) => M.maakStukken(st, opdrachtId, regels(f.lijst.value)));
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
    },
    { terug: () => openOpdracht(opdrachtId) }
  );
}

function kleurKeuze(kleuren, huidig) {
  return `<fieldset><legend>Kleur</legend><div class="kleuren">${kleuren
    .map((c) => `<label class="kleur" style="--c:${c}"><input type="radio" name="kleur" value="${c}" ${c === huidig ? 'checked' : ''}><span></span></label>`)
    .join('')}</div></fieldset>`;
}

function openVak(id) {
  const s = getState();
  const v = id ? s.vakken[id] : { naam: '', kleur: M.VAKKLEUREN[M.lijst(s, 'vakken').length % M.VAKKLEUREN.length] };
  dialoog(
    `<h2>${id ? 'Opleidingsonderdeel bewerken' : 'Nieuw opleidingsonderdeel'}</h2>
    <form id="f-vak" class="formulier">
      <label>Naam<input name="naam" required value="${esc(v.naam)}" placeholder="bv. Didactiek 2" autofocus></label>
      ${kleurKeuze(M.VAKKLEUREN, v.kleur)}
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-vak', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        wijzig((st) =>
          M.zet(st, 'vakken', { ...(id ? st.vakken[id] : {}), id: id || M.nieuwId(), naam: fd.get('naam').trim(), kleur: fd.get('kleur') || v.kleur })
        );
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
      $('[data-weg]', d)?.addEventListener('click', () => {
        const n = M.opdrachtenVanVak(getState(), id).length;
        if (!confirm(`"${v.naam}"${n ? ` met ${n} opdrachten en hun stukken` : ''} verwijderen?`)) return;
        wijzig((st) => M.verwijderVak(st, id));
        sluit();
      });
    }
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

function openNieuw() {
  dialoog(
    `<h2>Nieuw</h2>
    <div class="menu">
      <button class="knop" data-actie="nieuwe-taak">✏️ Taak <small>losse taak of bij een les/opdracht</small></button>
      <button class="knop" data-actie="nieuwe-les">🏫 Les <small>school</small></button>
      <button class="knop" data-actie="nieuwe-opdracht">🎓 Opdracht <small>opleiding</small></button>
    </div>`
  );
}

function openKlas(id) {
  const s = getState();
  const k = id ? s.klassen[id] : { naam: '', kleur: M.KLASKLEUREN[M.lijst(s, 'klassen').length % M.KLASKLEUREN.length], rooster: [] };
  const kleuren = M.KLASKLEUREN.includes(k.kleur) ? M.KLASKLEUREN : [k.kleur, ...M.KLASKLEUREN];
  dialoog(
    `<h2>${id ? 'Klas bewerken' : 'Nieuwe klas'}</h2>
    <form id="f-klas" class="formulier">
      <label>Naam<input name="naam" required value="${esc(k.naam)}" placeholder="bv. BKH4" autofocus></label>
      ${kleurKeuze(kleuren, k.kleur)}
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
        if (!confirm(`Klas "${k.naam}" verwijderen?${n ? ` Lessen die enkel bij deze klas horen verdwijnen mee, met hun taken.` : ''}`)) return;
        wijzig((st) => M.verwijderKlas(st, id));
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
      <p class="hint">De lessen krijgen nog geen datum en komen bij "Lessen zonder datum". Hun taken verschijnen pas in het bakje zodra de les een datum heeft. Krijgt een les samen met een andere klas, dan vink je die klas daarna aan bij de les.</p>
      <div class="knoppen"><span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Toevoegen</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-plak', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const metSj = f.sj.checked;
        wijzig((st) => {
          const sjIds = sjablonenGesorteerd(st)
            .filter((sj) => sj.aan)
            .map((sj) => sj.id);
          let volg = M.volgendeVolg(st, klasId);
          for (const titel of regels(f.lijst.value)) {
            const les = M.zet(st, 'lessen', { id: M.nieuwId(), klasIds: [klasId], titel, datum: null, volg: volg++ });
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
  nieuw() {
    openNieuw();
  },
  'nieuwe-taak'(el) {
    const lesId = el.dataset.les || null;
    const opdrachtId = el.dataset.opdracht || null;
    const terug = lesId ? () => openLes(lesId) : opdrachtId ? () => openOpdracht(opdrachtId) : null;
    openTaak(null, { werkdag: el.dataset.datum || null, lesId, opdrachtId }, terug);
  },
  'nieuwe-les'(el) {
    openLes(null, { datum: el.dataset.datum || null, klasId: el.dataset.klas || null });
  },
  'nieuwe-opdracht'(el) {
    openOpdracht(null, { vakId: el.dataset.vak || null });
  },
  verbeteren(el) {
    openVerbeteren(el.dataset.les);
  },
  'sjabloon-bij-les'(el) {
    wijzig((s) => M.maakStandaardTaken(s, s.lessen[el.dataset.les], [el.dataset.sj]));
  },
  'stukken-plakken'(el) {
    openStukkenPlakken(el.dataset.opdracht);
  },
  verdeel(el) {
    const id = el.dataset.opdracht;
    const plan = M.verdeelOpdracht(getState(), id);
    if (!plan.length) return;
    const laatste = plan.map((p) => p.datum).sort().at(-1);
    if (!confirm(`${plan.length} ${plan.length === 1 ? 'stuk' : 'stukken'} verdelen over je vrije dagen tot ${M.kortDatum(laatste)}? Je kunt ze daarna nog verschuiven.`)) return;
    wijzig((s) => {
      for (const p of plan) M.zet(s, 'taken', { ...s.taken[p.taak.id], werkdag: p.datum });
    });
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
  filter(el) {
    ui.filter = el.dataset.f;
    bewaarLokaal('saga.filter', ui.filter);
    render();
  },
  maand(el) {
    const d = Number(el.dataset.d);
    ui.maandOffset = d === 0 ? 0 : ui.maandOffset + d;
    ui.naarVandaag = d === 0;
    render();
    if (d !== 0) window.scrollTo(0, 0);
  },
  'klas-bewerk'(el) {
    openKlas(el.dataset.id || null);
  },
  'vak-bewerk'(el) {
    openVak(el.dataset.id || null);
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
    if (soort === 'taak' && s.taken[id]) M.zet(s, 'taken', { ...s.taken[id], werkdag: doel });
    if (soort === 'les' && s.lessen[id]) M.zet(s, 'lessen', { ...s.lessen[id], datum: doel });
  });
});

// ---------- start ----------

function zetTekst() {
  document.documentElement.dataset.tekst = ui.tekst;
}
zetTekst();

abonneer(opWijziging);
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
