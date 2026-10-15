// Saga – overzicht (raster op de computer, lijst op de gsm) en het bakje.

import * as M from '../model.js';
import { esc, ui, mobiel, WEEK, toonTaak, toonLes, toonOpdracht } from '../ui.js';
import { anker, blijvenLiggen, dagKort, groepen, groepKaart, inTePlannen, lesKaart, opNaam, sorteerLessen, sorteerTaken, voortgang, klassenNaam } from '../weergave.js';

// Alles per dag opzoeken, één keer per keer tekenen.
function indexeer(s) {
  const lessen = {};
  const taken = {};
  const deadlines = {};
  const eindes = {};
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
    if (!t.klaar && !t.lesId && !t.deadline?.eind) {
      const dl = M.deadlineVan(s, t);
      // blokken van één opgesplitste taak: maar één vlaggetje
      const dubbel = t.deelGroep && (deadlines[dl] || []).some((x) => x.deelGroep === t.deelGroep);
      if (dl && dl !== wd && !dubbel) (deadlines[dl] ||= []).push(t);
    }
  }
  return { lessen, taken, deadlines, eindes };
}

function afwezigLabel(s, a) {
  return M.isVakantie(a) ? `🏖 ${a.reden || 'Vakantie'}` : `🚫 ${klassenNaam(s, a.klasIds)}${a.reden ? `: ${a.reden}` : ''}`;
}

function dagBlok(s, idx, datum, v, raster) {
  const werk = M.isWerkdag(s, datum);
  const weekend = [0, 6].includes(M.weekdag(datum));
  const lessen = (idx.lessen[datum] || []).sort(sorteerLessen(s));
  const taken = (idx.taken[datum] || []).filter((t) => s.instellingen.toonKlaar || !t.klaar);
  const dls = idx.deadlines[datum] || [];
  const eindes = idx.eindes[datum] || [];
  // #sw: enkel de werkdag-rand, geen blokje. Verborgen afspraken tellen wel nog als werkdag.
  const afspraken = ui.verbergAfspraken ? [] : M.afsprakenOp(s, datum).filter((a) => !a.werk);
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
      <span class="dag-datum">${raster ? dagKort(datum) : M.kortDatum(datum)}</span>
      ${werk ? `<span class="label-werk" title="werkdag">${raster ? '' : 'werk'}</span>` : ''}
      <button class="dag-plus" data-actie="dag" data-datum="${datum}" aria-label="Acties voor ${M.kortDatum(datum)}">+</button>
    </header>
    ${afw.map((a) => `<div class="afwezig ${M.isVakantie(a) ? 'vak' : ''}" role="button" tabindex="0" data-actie="afwezigheid" data-id="${a.id}" title="${esc(afwezigLabel(s, a))}">${esc(afwezigLabel(s, a))}</div>`).join('')}
    ${afspraken.map((a) => `<div class="afspraak" title="${esc(a.titel)}">${esc(a.titel)}</div>`).join('')}
    ${eindes
      .map((o) => `<div class="einde ${M.opdrachtDomein(o)}" role="button" tabindex="0" data-actie="opdracht" data-id="${o.id}">⚑ ${esc(o.titel)}</div>`)
      .join('')}
    ${lessen.map((l) => lesKaart(s, l, false)).join('')}
    ${groepen(s, taken).map((g) => groepKaart(s, g)).join('')}
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
    <button class="filter-lessen ${f.lessen ? 'aan' : ''}" data-actie="filter-lessen" aria-pressed="${f.lessen}" title="Enkel de lessen, zonder taken en deadlines">Enkel lessen</button>
    <button class="filter-lessen ${ui.verbergAfspraken ? 'aan' : ''}" data-actie="afspraken-verbergen" aria-pressed="${ui.verbergAfspraken}" title="Persoonlijke afspraken uit je agenda verbergen op dit toestel (bv. als je je scherm projecteert)">Afspraken verbergen</button>
  </div>`;
}

export function bakjeInhoud(s) {
  const v = M.vandaag();
  const zien = (t) => toonTaak(s, t);
  const liggen = blijvenLiggen(s, v).filter(zien).sort(sorteerTaken(s));
  const open = inTePlannen(s).filter(zien).sort(sorteerTaken(s));
  const school = open.filter((t) => M.domeinVan(t) === 'school');
  const opl = open.filter((t) => M.domeinVan(t) === 'opleiding');
  const lessen = M.lijst(s, 'lessen')
    .filter((l) => !l.datum && toonLes(l))
    .sort(sorteerLessen(s));
  const koppen = ui.filter.domein === 'alles' && !ui.filter.klasId;
  const kaarten = (lijst) => groepen(s, lijst).map((g) => groepKaart(s, g)).join('');
  return `<div class="bakje-kop">
      <h2>Nog in te plannen</h2>
      <div class="knoppen-rij">
        <button class="knop klein" data-actie="nieuwe-taak">+ taak</button>
        ${mobiel.matches ? '' : '<button class="knop klein verberg" data-actie="bakje-verberg" title="Bakje verbergen" aria-label="Bakje verbergen">‹</button>'}
      </div>
    </div>
    ${liggen.length ? `<h3 class="kop-rood">Blijven liggen</h3>${kaarten(liggen)}` : ''}
    ${school.length ? `${koppen || liggen.length ? '<h3>School</h3>' : ''}${kaarten(school)}` : ''}
    ${opl.length ? `${koppen || liggen.length ? '<h3 class="kop-opl">🎓 Opleiding</h3>' : ''}${kaarten(opl)}` : ''}
    ${!liggen.length && !open.length && !ui.filter.lessen ? '<p class="leeg">Alles staat ingepland. 🌿</p>' : ''}
    ${lessen.length ? `<h3>Lessen zonder datum</h3>${lessen.map((l) => lesKaart(s, l)).join('')}` : ''}
    <p class="hint">${mobiel.matches ? 'Tik op een taak om ze naar een dag te verplaatsen.' : 'Sleep blokjes naar een dag, of terug naar hier.'}</p>`;
}

function periodeNav(s, van, tot) {
  return `<div class="periode-nav">
    <button class="knop klein" data-actie="venster" data-d="-1" aria-label="4 weken terug">‹</button>
    <button class="knop klein" data-actie="venster" data-d="0">Vandaag</button>
    <button class="knop klein" data-actie="venster" data-d="1" aria-label="4 weken verder">›</button>
    <span class="periode">${M.vensterNaam(van, tot)}</span>
    ${filterKnoppen(s)}
  </div>`;
}

export function viewRaster(s) {
  const v = M.vandaag();
  const { van, tot, dagen } = M.venster(v, ui.vensterOffset, true);
  const idx = indexeer(s);
  const zb = ui.zijbalk;
  const zien = (t) => toonTaak(s, t);
  const aantal = inTePlannen(s).filter(zien).length + blijvenLiggen(s, v).filter(zien).length;
  return `<div class="overzicht ${zb.verborgen ? 'zonder-bakje' : ''}" style="--zijbalk:${zb.breedte}px">
    ${
      zb.verborgen
        ? `<button class="bakje-open" data-actie="bakje-toon" data-drop="bakje" title="Bakje tonen">Nog in te plannen${aantal ? ` (${aantal})` : ''}</button>`
        : `<aside class="bakje zijbalk" data-drop="bakje" data-scroll="bakje">${bakjeInhoud(s)}</aside><div class="sleepgreep" data-greep title="Sleep om het bakje breder of smaller te maken"></div>`
    }
    <div class="raster-wrap">
      ${periodeNav(s, van, tot)}
      <div class="raster-kop">${WEEK.map((d) => `<div>${M.DAGNAMEN[d]}</div>`).join('')}</div>
      <div class="raster">${dagen.map((d) => dagBlok(s, idx, d, v, true)).join('')}</div>
    </div>
  </div>`;
}

export function viewLijst(s) {
  const v = M.vandaag();
  const { van, tot, dagen } = M.venster(v, ui.vensterOffset, false);
  const idx = indexeer(s);
  const liggen = blijvenLiggen(s, v).filter((t) => toonTaak(s, t)).length;
  return `<div class="lijst">
    ${periodeNav(s, van, tot)}
    ${liggen ? `<a class="melding" href="#/bakje">${liggen} ${liggen === 1 ? 'taak blijft' : 'taken blijven'} liggen →</a>` : ''}
    ${dagen.map((d) => dagBlok(s, idx, d, v, false)).join('')}
  </div>`;
}

export function viewBakje(s) {
  return `<div class="pagina bakje"><div class="bakje-filter">${filterKnoppen(s)}</div>${bakjeInhoud(s)}</div>`;
}
