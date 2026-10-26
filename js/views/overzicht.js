// Saga – overzicht (raster op de computer, lijst op de gsm) en het bakje.

import * as M from '../model.js';
import { esc, ui, mobiel, WEEK, toonTaak, toonLes, toonOpdracht } from '../ui.js';
import { anker, bakje, dagKort, snelInvoerHtml, groepen, groepKaart, klasLabel, lesKaart, lesVan, opNaam, sorteerLessen, voortgang, klassenNaam } from '../weergave.js';

// Alles per dag opzoeken, één keer per keer tekenen.
function indexeer(s) {
  const lessen = {};
  const taken = {};
  const deadlines = {};
  const eindes = {};
  const indienen = {};
  for (const l of M.lijst(s, 'lessen')) if (l.datum && toonLes(l)) (lessen[l.datum] ||= []).push(l);
  for (const o of M.lijst(s, 'opdrachten')) {
    if (!o.deadline || !toonOpdracht(o)) continue;
    const v = voortgang(M.takenVanOpdracht(s, o.id));
    if (!(v.totaal && v.klaar === v.totaal)) (eindes[o.deadline] ||= []).push(o);
  }
  for (const t of M.lijst(s, 'taken')) {
    if (!toonTaak(s, t)) continue;
    const wd = M.werkdagVan(s, t);
    if (wd) (taken[wd] ||= []).push(t);
    if (!t.klaar && M.isLeerlingTaak(t)) (indienen[t.indien] ||= []).push(t);
    else if (!t.klaar && !t.lesId && !t.deadline?.eind) {
      const dl = M.deadlineVan(s, t);
      // blokken van één opgesplitste taak: maar één vlaggetje
      const dubbel = t.deelGroep && (deadlines[dl] || []).some((x) => x.deelGroep === t.deelGroep);
      if (dl && dl !== wd && !dubbel) (deadlines[dl] ||= []).push(t);
    }
  }
  return { lessen, taken, deadlines, eindes, indienen };
}

function afwezigLabel(s, a) {
  return M.isVakantie(a) ? `🏖 ${a.reden || 'Vakantie'}` : `🚫 ${klassenNaam(s, a.klasIds)}${a.reden ? `: ${a.reden}` : ''}`;
}

// "1 november", en bij januari met het jaar: "1 januari 2027"
function eersteVanMaand(datum) {
  const m = Number(datum.slice(5, 7));
  return `1 ${M.MAANDNAMEN_LANG[m - 1]}${m === 1 ? ' ' + datum.slice(0, 4) : ''}`;
}

function dagBlok(s, idx, datum, v, raster) {
  const werk = M.isWerkdag(s, datum);
  const weekend = [0, 6].includes(M.weekdag(datum));
  const lessen = (idx.lessen[datum] || []).sort(sorteerLessen(s));
  const taken = (idx.taken[datum] || []).filter((t) => s.instellingen.toonKlaar || !t.klaar);
  const dls = idx.deadlines[datum] || [];
  const eindes = idx.eindes[datum] || [];
  const indienen = idx.indienen[datum] || [];
  // #sw: enkel de werkdag-rand, geen blokje. Verborgen afspraken tellen wel nog als werkdag.
  const afspraken = ui.verbergAfspraken ? [] : M.afsprakenOp(s, datum).filter((a) => !a.werk);
  // geschatte tijd van wat er nog gepland staat (vanaf vandaag, los van het filter)
  const last = datum >= v ? M.dagLast(s, datum) : null;
  const afw = M.afwezighedenOp(s, datum).filter((a) => !ui.filter.klasId || M.isVakantie(a) || a.klasIds.includes(ui.filter.klasId));
  const vakantie = afw.some(M.isVakantie);
  const klassen = [
    'dag',
    datum === v && 'vandaag',
    datum < v && 'voorbij',
    werk && 'werkdag',
    weekend && 'weekend',
    vakantie && 'vakantie',
    datum.endsWith('-01') && 'eerste',
  ].filter(Boolean);
  return `<section class="${klassen.join(' ')}" data-drop="${datum}">
    <header class="dag-kop">
      <span class="dag-datum">${raster ? (datum.endsWith('-01') ? eersteVanMaand(datum) : dagKort(datum)) : M.kortDatum(datum)}</span>
      ${werk ? `<span class="label-werk" title="werkdag">${raster ? '' : 'werk'}</span>` : ''}
      ${
        last?.ms
          ? `<span class="last ${last.vol ? 'vol' : ''}" title="Geschat, op basis van je timer${last.vol ? ` – meer dan ${M.duurKort(last.grens)} op ${werk ? 'een werkdag' : 'deze dag'}` : ''}">± ${M.duurKort(last.ms)}</span>`
          : ''
      }
      <button class="dag-plus" data-actie="dag" data-datum="${datum}" aria-label="Acties voor ${M.kortDatum(datum)}">+</button>
    </header>
    ${afw.map((a) => `<div class="afwezig ${M.isVakantie(a) ? 'vak' : ''}" role="button" tabindex="0" data-actie="afwezigheid" data-id="${a.id}" title="${esc(afwezigLabel(s, a))}">${esc(afwezigLabel(s, a))}</div>`).join('')}
    ${afspraken.map((a) => `<div class="afspraak" title="${esc(a.agenda ? `${a.titel} (${a.agenda})` : a.titel)}">${esc(a.titel)}</div>`).join('')}
    ${lessen.map((l) => lesKaart(s, l, false, ui.filter.lessen)).join('')}
    ${groepen(s, taken).map((g) => groepKaart(s, g)).join('')}
    ${vlaggen(s, eindes, indienen, dls)}
  </section>`;
}

// Deadlines staan altijd onderaan de dag: einddeadlines van opdrachten, indiendagen
// van taken voor leerlingen, en deadlines van to do's en stukken.
function vlaggen(s, eindes, indienen, dls) {
  if (!eindes.length && !indienen.length && !dls.length) return '';
  const regel = (klas, actie, id, tekst, tip = tekst) =>
    `<div class="deadline ${klas}" role="button" tabindex="0" data-actie="${actie}" data-id="${id}" title="${esc(tip)}">${tekst}</div>`;
  return `<div class="deadlines">
    ${eindes.map((o) => regel(`einde ${M.opdrachtDomein(o)}`, 'opdracht', o.id, `⚑ ${esc(o.titel)}`)).join('')}
    ${indienen
      .map((t) => {
        const les = lesVan(s, t);
        const wie = les ? klasLabel(s, les) : klassenNaam(s, t.klasIds);
        return regel('indien', 'taak', t.id, `⚑ Indienen: ${esc(t.titel)}${wie ? ` · ${esc(wie)}` : ''}`);
      })
      .join('')}
    ${dls
      .map((t) => {
        const a = anker(s, t);
        return regel(M.domeinVan(t) === 'opleiding' ? 'opl' : '', 'taak', t.id, `⚑ ${esc(t.titel)}${a.label ? ` · ${esc(a.label)}` : ''}`);
      })
      .join('')}
  </div>`;
}

// Filter: domein (alles, school, opleiding), één klas, en "enkel lessen".
export function filterKnoppen(s) {
  const f = ui.filter;
  const opties = [
    ['alles', 'Alles'],
    ['school', 'School'],
    ['opleiding', '🎓 Opleiding'],
  ];
  const klassen = M.lijst(s, 'klassen').sort(opNaam);
  return `<div class="filters">
    <div class="filter" role="group" aria-label="Toon">${opties
      .map(([d, label]) => {
        const aan = f.domein === d && !f.klasId;
        return `<button class="${aan ? 'aan' : ''}" data-actie="filter" data-domein="${d}" aria-pressed="${aan}">${label}</button>`;
      })
      .join('')}</div>
    ${
      klassen.length
        ? `<select class="filter-klas ${f.klasId ? 'aan' : ''}" data-filter-klas aria-label="Klas">
            <option value="">Alle klassen</option>
            ${klassen.map((k) => `<option value="${k.id}" ${k.id === f.klasId ? 'selected' : ''}>${esc(k.naam)}</option>`).join('')}
          </select>`
        : ''
    }
    <details class="weergave-menu" ${ui.weergaveOpen ? 'open' : ''}>
      <summary class="filter-lessen ${f.lessen || ui.verbergAfspraken ? 'aan' : ''}">Weergave ▾</summary>
      <div class="weergave-pop">
        <label class="check"><input type="checkbox" data-weergave="lessen" ${f.lessen ? 'checked' : ''}><span>Enkel lessen<small>met hun voorbereiding en taken</small></span></label>
        <label class="check"><input type="checkbox" data-lokaal="verbergAfspraken" ${ui.verbergAfspraken ? 'checked' : ''}><span>Afspraken verbergen<small>op dit toestel, bv. bij projecteren</small></span></label>
      </div>
    </details>
    ${filterActief(s)}
  </div>`;
}

// Staat er een filter aan dat iets verbergt? Dan zie je dat, met een kruisje om het weg te doen.
function filterActief(s) {
  const f = ui.filter;
  const delen = [];
  if (f.klasId) delen.push(esc(s.klassen[f.klasId]?.naam || 'klas'));
  else if (f.domein !== 'alles') delen.push(f.domein === 'school' ? 'school' : 'opleiding');
  if (f.lessen) delen.push('enkel lessen');
  if (ui.verbergAfspraken) delen.push('zonder afspraken');
  if (!delen.length) return '';
  return `<button class="filter-actief" data-actie="filter-wis" title="Alles weer tonen">Filter: ${delen.join(' · ')} ✕</button>`;
}

export const bakjeVoorFilter = (s) => bakje(s, (t) => toonTaak(s, t));

export function bakjeInhoud(s) {
  const b = bakjeVoorFilter(s);
  const lessen = M.lijst(s, 'lessen')
    .filter((l) => !l.datum && toonLes(l))
    .sort(sorteerLessen(s));
  const kaarten = (lijst) => groepen(s, lijst).map((g) => groepKaart(s, g)).join('');
  const opl = b.opleiding
    .map(
      (g) =>
        `<h4 class="kop-vak" style="--klas:${g.vak?.kleur || 'var(--fuchsia)'}">${esc(g.vak?.naam || 'Overig')}</h4>${kaarten(g.taken)}${
          g.meer ? `<a class="hint meer-link" href="#/opleiding">+ ${g.meer} later →</a>` : ''
        }`
    )
    .join('');
  return `<div class="bakje-kop">
      <h2>Nog in te plannen</h2>
      <div class="knoppen-rij">
        <button class="knop klein" data-actie="nieuwe-taak">+ to do</button>
        ${mobiel.matches ? '' : '<button class="knop klein verberg" data-actie="bakje-verberg" title="Bakje verbergen" aria-label="Bakje verbergen">‹</button>'}
      </div>
    </div>
    ${snelInvoerHtml('', 'Snel noteren… (N)')}
    ${
      b.liggen.length
        ? `<div class="liggen-kop"><h3 class="kop-oranje">Bleef liggen</h3><button class="knop klein" data-actie="herplan" title="Verdelen over je komende vrije dagen">Alles herplannen</button></div>${kaarten(b.liggen)}`
        : ''
    }
    ${b.school.length ? `<h3>School</h3>${kaarten(b.school)}` : ''}
    ${opl ? `<h3 class="kop-opl">🎓 Opleiding</h3>${opl}` : ''}
    ${!b.aantal && !ui.filter.lessen ? '<p class="leeg">Alles staat ingepland. 🌿</p>' : ''}
    ${
      b.later
        ? `<p class="hint">Nog ${b.later} voor later (meer dan 2 weken weg): zie <a href="#/klassen">School</a> en <a href="#/opleiding">Opleiding</a>.</p>`
        : ''
    }
    ${lessen.length ? `<details class="zonder-datum"><summary>Lessen zonder datum (${lessen.length})</summary>${lessen.map((l) => lesKaart(s, l)).join('')}</details>` : ''}
    <p class="hint">${mobiel.matches ? 'Tik op een blokje om het naar een dag te verplaatsen.' : 'Sleep blokjes naar een dag, of terug naar hier.'}</p>`;
}

function periodeNav(s) {
  return `<div class="periode-nav">
    <button class="knop klein" data-actie="naar-vandaag">Vandaag</button>
    ${filterKnoppen(s)}
  </div>`;
}

// Bovenaan: eerdere weken bijladen. Onderaan: vanzelf meer weken bij het scrollen
// (de knop is er voor als dat niet lukt).
function eerderKnop() {
  return ui.wekenTerug < M.WEKEN_TERUG_MAX
    ? `<div class="weken-meer boven"><button class="knop klein" data-actie="eerdere-weken">↑ Eerdere weken</button></div>`
    : '';
}

function meerKnop() {
  return ui.wekenVooruit < M.WEKEN_MAX
    ? `<div class="weken-meer" data-meer-weken><button class="knop klein" data-actie="meer-weken">Meer weken</button></div>`
    : '<p class="hint weken-meer">Einde van het overzicht (een jaar vooruit).</p>';
}

export function viewRaster(s) {
  const v = M.vandaag();
  const { dagen } = M.venster(v, ui.wekenTerug, ui.wekenVooruit);
  const idx = indexeer(s);
  const zb = ui.zijbalk;
  const aantal = bakjeVoorFilter(s).aantal;
  return `<div class="overzicht ${zb.verborgen ? 'zonder-bakje' : ''}" style="--zijbalk:${zb.breedte}px">
    ${
      zb.verborgen
        ? `<button class="bakje-open" data-actie="bakje-toon" data-drop="bakje" title="Bakje tonen">Nog in te plannen${aantal ? ` (${aantal})` : ''}</button>`
        : `<aside class="bakje zijbalk" data-drop="bakje" data-scroll="bakje">${bakjeInhoud(s)}</aside><div class="sleepgreep" data-greep title="Sleep om het bakje breder of smaller te maken"></div>`
    }
    <div class="raster-wrap">
      <div class="raster-top">
        ${periodeNav(s)}
        <div class="raster-kop">${WEEK.map((d) => `<div>${M.DAGNAMEN[d]}</div>`).join('')}</div>
      </div>
      ${eerderKnop()}
      <div class="raster">${dagen.map((d) => dagBlok(s, idx, d, v, true)).join('')}</div>
      ${meerKnop()}
    </div>
  </div>`;
}

export function viewLijst(s) {
  const v = M.vandaag();
  const { dagen } = M.venster(v, ui.wekenTerug, ui.wekenVooruit);
  const idx = indexeer(s);
  const liggen = bakjeVoorFilter(s).liggen.length;
  // een kop bij elke nieuwe maand, zodat je weet waar je bent tijdens het scrollen
  const maandKop = (d, i) => (i === 0 || d.endsWith('-01') ? `<h2 class="maand-kop">${M.maandNaam(d)}</h2>` : '');
  return `<div class="lijst">
    ${periodeNav(s)}
    ${liggen ? `<a class="melding" href="#/vandaag">${liggen} ${liggen === 1 ? 'blokje bleef' : 'blokjes bleven'} liggen →</a>` : ''}
    ${eerderKnop()}
    ${dagen.map((d, i) => maandKop(d, i) + dagBlok(s, idx, d, v, false)).join('')}
    ${meerKnop()}
  </div>`;
}

export function viewBakje(s) {
  return `<div class="pagina bakje"><div class="bakje-filter">${filterKnoppen(s)}</div>${bakjeInhoud(s)}</div>`;
}
