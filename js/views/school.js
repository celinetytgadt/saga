// Saga – pagina School: klassen, en werk per onderwerp.

import * as M from '../model.js';
import { esc, WEEK, GRIJS } from '../ui.js';
import { klassenVan, opdrachtRegel, opNaam, takenLijst, voortgang, werkKaart } from '../weergave.js';

export function roosterTekst(k) {
  return (k.rooster || []).length
    ? WEEK.filter((d) => k.rooster.includes(d))
        .map((d) => M.DAGNAMEN[d])
        .join(', ')
    : '<span class="zacht">nog niet ingesteld</span>';
}

// Eén les in de lessenreeks van een klas: datum, onderwerp, andere klassen, voorbereiding.
export function lesRegel(s, l, klasId) {
  const taken = M.takenVanLes(s, l.id);
  const vg = voortgang(taken);
  const andere = klassenVan(s, l).filter((x) => x.id !== klasId);
  const w = M.lesWaarschuwing(s, l);
  const tijd = taken.reduce((som, t) => som + M.bestedeTijd(t), 0);
  return `<li><div class="lesregel ${w ? 'oranje' : ''}" role="button" tabindex="0" data-actie="les" data-id="${l.id}">
    <span class="lesregel-datum">${l.datum ? M.kortDatum(l.datum) : '—'}</span>
    <span class="lesregel-titel">${esc(l.titel)}${andere.length ? ` <small>+ ${esc(andere.map((x) => x.naam).join(', '))}</small>` : ''}${
      w ? ` <span class="reden">⚠ ${esc(w.reden)}</span>` : ''
    }</span>
    ${tijd ? `<span class="teller" title="bestede tijd">⏱ ${M.duurTekst(tijd)}</span>` : ''}
    ${vg.totaal ? `<span class="teller ${vg.klaar === vg.totaal ? 'af' : ''}" title="taken klaar">${vg.klaar}/${vg.totaal}</span>` : ''}
  </div></li>`;
}

// Kort overzicht per klas; alles over één klas staat op haar eigen pagina.
function klasKaart(s, k) {
  const v = M.vandaag();
  const lessen = M.lessenVanKlas(s, k.id);
  const komend = lessen.filter((l) => l.datum && l.datum >= v).slice(0, 4);
  const zonder = lessen.filter((l) => !l.datum).length;
  // to do's van de klas die niet bij een les horen (bv. een cursus schrijven)
  const todos = M.losseTaken(s, 'school')
    .filter((t) => !t.klaar && !M.isVerbeteren(t) && (t.klasIds || []).includes(k.id))
    .sort((a, b) => (M.werkdagVan(s, a) || M.deadlineVan(s, a) || '9').localeCompare(M.werkdagVan(s, b) || M.deadlineVan(s, b) || '9'));
  const opdrachten = M.lijst(s, 'opdrachten')
    .filter((o) => M.opdrachtDomein(o) === 'school' && (o.klasIds || []).includes(k.id))
    .filter((o) => {
      const vg = voortgang(M.takenVanOpdracht(s, o.id));
      return !(vg.totaal && vg.klaar === vg.totaal && (!o.deadline || o.deadline < v));
    })
    .sort(M.volgordeOpdracht);
  return `<section class="kaart groep-kaart" style="--klas:${k.kleur}">
    <header>
      <span class="bol"></span><h2><a class="kaart-link" href="#/klas/${k.id}">${esc(k.naam)}</a></h2>
      <button class="knop klein" data-actie="klas-bewerk" data-id="${k.id}">Bewerken</button>
    </header>
    <p class="rooster-tekst">Lesdagen: ${roosterTekst(k)}</p>
    ${komend.length ? `<ol class="lessen-lijst">${komend.map((l) => lesRegel(s, l, k.id)).join('')}</ol>` : '<p class="leeg">Geen komende lessen.</p>'}
    ${zonder ? `<p class="hint">${zonder} ${zonder === 1 ? 'les' : 'lessen'} zonder datum.</p>` : ''}
    ${
      todos.length || opdrachten.length
        ? `<h3>To do's</h3>${opdrachten.length ? `<ol class="lessen-lijst">${opdrachten.map((o) => opdrachtRegel(s, o)).join('')}</ol>` : ''}${takenLijst(s, todos, '')}`
        : ''
    }
    <div class="knoppen">
      <a class="knop klein primair" href="#/klas/${k.id}">Open ${esc(k.naam)} →</a>
      <button class="knop klein" data-actie="nieuwe-les" data-klas="${k.id}">+ les</button>
    </div>
  </section>`;
}

function onderwerpKaart(s, ond) {
  const data = ond ? `data-onderwerp="${ond.id}"` : '';
  return werkKaart(s, {
    titel: ond ? esc(ond.naam) : 'Zonder onderwerp',
    kleur: ond?.kleur || GRIJS,
    opdrachten: M.opdrachtenVanOnderwerp(s, ond?.id || null),
    taken: M.takenVanOnderwerp(s, ond?.id || null),
    kop: ond ? `<button class="knop klein" data-actie="onderwerp-bewerk" data-id="${ond.id}">Bewerken</button>` : '',
    onder: `<button class="knop klein" data-actie="nieuwe-taak" data-domein="school" ${data}>+ to do</button>
      <button class="knop klein" data-actie="nieuwe-opdracht" data-domein="school" ${data}>+ met stukken</button>`,
  });
}

export function viewKlassen(s) {
  const klassen = M.lijst(s, 'klassen').sort(opNaam);
  const onderwerpen = M.lijst(s, 'onderwerpen').sort(opNaam);
  const zonder = M.opdrachtenVanOnderwerp(s, null).length + M.takenVanOnderwerp(s, null).length;
  return `<div class="pagina">
    <div class="pagina-kop"><h1>School</h1><button class="knop primair" data-actie="klas-bewerk">+ klas</button></div>
    ${klassen.length ? `<div class="groepen">${klassen.map((k) => klasKaart(s, k)).join('')}</div>` : '<p class="leeg">Nog geen klassen. Voeg je eerste klas toe, bv. BKH4.</p>'}
    <div class="pagina-kop sectie-kop"><h1>To do's</h1>
      <div class="knoppen-rij">
        <button class="knop" data-actie="onderwerp-bewerk">+ onderwerp</button>
        <button class="knop primair" data-actie="nieuwe-taak" data-domein="school">+ to do</button>
      </div>
    </div>
    <p class="hint">Wat je moet regelen, per onderwerp (bv. Stage, Vergaderingen). Iets groters deel je op in stukken ("+ met stukken"). Hoort iets bij een klas, duid die klas dan aan: zonder onderwerp staat het dan enkel bij de klas, met een onderwerp ook hier. Taken voor leerlingen voeg je toe bij een les of op de pagina van de klas.</p>
    ${
      onderwerpen.length || zonder
        ? `<div class="groepen">${onderwerpen.map((o) => onderwerpKaart(s, o)).join('')}${zonder || !onderwerpen.length ? onderwerpKaart(s, null) : ''}</div>`
        : '<p class="leeg">Nog geen to do\'s.</p>'
    }
  </div>`;
}
