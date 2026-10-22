// Saga – Vandaag: wat moet (de lessen van de volgende 2 werkdagen voorbereiden),
// wat staat er vandaag gepland, en waaruit kies ik zelf (het bakje).

import * as M from '../model.js';
import { esc } from '../ui.js';
import { anker, bakje, groepen, groepKaart, klasLabel, klasStijl, snelInvoerHtml, sorteerLessen, taakTitel, tijdLabel } from '../weergave.js';

// Kleine timerknop: starten, of pauzeren met de lopende klok erbij.
function timerKnop(t) {
  if (t.gestart) return `<button class="chip timer-chip loopt" data-actie="timer" data-id="${t.id}" aria-label="Timer pauzeren">❚❚ <span data-klok="${t.id}">${M.klokTekst(M.bestedeTijd(t))}</span></button>`;
  return `<button class="chip timer-chip" data-actie="timer" data-id="${t.id}">▶ ${M.bestedeTijd(t) ? 'Verder' : 'Start'}</button>`;
}

const vink = (t) =>
  `<button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>`;

// Eén les die voorbereid moet worden, met de voorbereiding (en haar blokken).
function moetje(s, les, v) {
  const voorb = M.takenVanLes(s, les.id)
    .filter((t) => !M.isVerbeteren(t) && (t.hoofd || t.deelGroep))
    .sort((a, b) => (a.deelNr || 0) - (b.deelNr || 0));
  const klaar = voorb.length > 0 && voorb.every((t) => t.klaar);
  const regels = voorb
    .filter((t) => !t.klaar)
    .map((t) => {
      const wd = M.werkdagVan(s, t);
      const wanneer = !wd ? 'in bakje' : wd === v ? 'vandaag' : wd < v ? `bleef liggen (${M.kortDatum(wd)})` : M.kortDatum(wd);
      return `<div class="moetje-taak ${t.klaar ? 'klaar' : ''}">${vink(t)}
        <span class="moetje-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">Voorbereiding${t.deelVan ? ` ${t.deelNr}/${t.deelVan}` : ''} <small>${wanneer}</small></span>
        ${timerKnop(t)}
      </div>`;
    })
    .join('');
  return `<div class="moetje ${klaar ? 'af' : ''}" style="${klasStijl(s, les)}">
    <div class="moetje-kop" role="button" tabindex="0" data-actie="les" data-id="${les.id}">
      <span><b>${esc(klasLabel(s, les))}</b> ${esc(les.titel)}</span>${klaar ? '<span class="teller af">✓ voorbereid</span>' : ''}
    </div>
    ${regels}
  </div>`;
}

// Een to do (of taak, stuk) om uit te kiezen, met een knop om ze vandaag te doen.
function magje(s, t, v) {
  const a = anker(s, t);
  const dl = M.deadlineVan(s, t);
  const wd = M.werkdagVan(s, t);
  const sub = [
    a.label && `${esc(a.label)}${a.titel ? ` · ${esc(a.titel)}` : ''}`,
    dl && !t.hoofd && `⚑ ${M.kortDatum(dl)}`,
    wd && wd < v && `bleef liggen (${M.kortDatum(wd)})`,
    tijdLabel(t),
  ].filter(Boolean);
  return `<div class="magje ${M.domeinVan(t) === 'opleiding' ? 'opl' : ''}" style="--klas:${a.kleur}">${vink(t)}
    <span class="moetje-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">${esc(taakTitel(s, t))}${sub.length ? `<small>${sub.join(' · ')}</small>` : ''}</span>
    <button class="chip" data-actie="plan-vandaag" data-id="${t.id}">Vandaag</button>
  </div>`;
}

export function viewVandaag(s) {
  const v = M.vandaag();
  const werkdagen = M.volgendeWerkdagen(s, v, 2);
  const lessen = M.lijst(s, 'lessen').filter((l) => werkdagen.includes(l.datum));
  const lesIds = new Set(lessen.map((l) => l.id));
  const moetjes = werkdagen
    .map((d) => {
      const op = lessen.filter((l) => l.datum === d).sort(sorteerLessen(s));
      return `<h3 class="dag-titel">${M.kortDatum(d)}</h3>${op.length ? op.map((l) => moetje(s, l, v)).join('') : '<p class="leeg">Geen lessen.</p>'}`;
    })
    .join('');

  // wat je zelf al op vandaag zette (zonder de voorbereidingen hierboven)
  const gepland = M.lijst(s, 'taken').filter((t) => !t.klaar && M.werkdagVan(s, t) === v && !(t.lesId && lesIds.has(t.lesId) && !M.isVerbeteren(t)));
  const b = bakje(s, undefined, v);
  const kiezen = [...b.school, ...b.opleiding.flatMap((g) => g.taken)];

  return `<div class="pagina vandaag-pagina">
    <div class="pagina-kop"><h1>Vandaag <small class="zacht">${M.kortDatum(v)}</small></h1></div>
    ${snelInvoerHtml()}

    <section class="kaart">
      <h2>Moet: voorbereiden</h2>
      ${
        werkdagen.length
          ? `<p class="hint">De lessen van je volgende ${werkdagen.length === 1 ? 'werkdag' : '2 werkdagen'}.</p>${moetjes}`
          : '<p class="leeg">Geen werkdagen in de komende 3 weken. Stel je vaste werkdagen in bij Instellingen.</p>'
      }
    </section>

    ${
      gepland.length
        ? `<section class="kaart"><h2>Gepland voor vandaag</h2>${groepen(s, gepland)
            .map((g) => groepKaart(s, g))
            .join('')}</section>`
        : ''
    }

    <section class="kaart">
      <h2>Mag: kies zelf</h2>
      ${
        b.liggen.length
          ? `<div class="liggen-kop"><h3 class="kop-oranje">Bleef liggen (${b.liggen.length})</h3>
              <button class="knop klein" data-actie="herplan">Alles herplannen</button></div>
              ${b.liggen.map((t) => magje(s, t, v)).join('')}`
          : ''
      }
      ${kiezen.length ? `${b.liggen.length ? '<h3>Nog in te plannen</h3>' : ''}${kiezen.map((t) => magje(s, t, v)).join('')}` : ''}
      ${!b.liggen.length && !kiezen.length ? '<p class="leeg">Niets te kiezen: alles staat ingepland. 🌿</p>' : ''}
      ${b.later ? `<p class="hint">Nog ${b.later} voor later: zie <a href="#/klassen">School</a> en <a href="#/opleiding">Opleiding</a>.</p>` : ''}
    </section>
  </div>`;
}
