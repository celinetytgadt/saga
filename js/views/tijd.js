// Saga – tijdsoverzicht (#/tijd): waar gaat mijn tijd naartoe?
// Haalt de volledige planning op (ook wat enkel nog op Drive staat).

import * as M from '../model.js';
import { esc, ui } from '../ui.js';

const PERIODES = [
  ['jaar', 'Dit schooljaar'],
  ['maand', 'Deze maand'],
  ['vorige', 'Vorige maand'],
  ['4w', 'Laatste 4 weken'],
];

export function periodeGrenzen(periode, v = M.vandaag()) {
  const eerste = v.slice(0, 8) + '01';
  if (periode === 'maand') return [eerste, v];
  if (periode === 'vorige') {
    const tot = M.plusDagen(eerste, -1);
    return [tot.slice(0, 8) + '01', tot];
  }
  if (periode === '4w') return [M.plusDagen(v, -27), v];
  const start = M.schooljaarStart(v);
  return [start, M.plusDagen(`${Number(start.slice(0, 4)) + 1}-09-01`, -1)];
}

const duur = (ms) => (ms ? M.duurTekst(ms) : '0 min');

const MAANDEN = (m) => `${M.MAANDNAMEN_LANG[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function balk(ms, max, kleur, titel) {
  const pct = max ? Math.max(1, Math.round((100 * ms) / max)) : 0;
  return `<div class="t-balk" title="${esc(titel)}"><span style="width:${pct}%;--c:${kleur || 'var(--rand-sterk)'}"></span></div>`;
}

export function viewTijd(s) {
  const t = ui.tijd;
  const [van, tot] = periodeGrenzen(t.periode);
  const knoppen = `<div class="filter" role="group" aria-label="Periode">${PERIODES.map(
    ([k, l]) => `<button class="${t.periode === k ? 'aan' : ''}" data-actie="tijd-periode" data-p="${k}" aria-pressed="${t.periode === k}">${l}</button>`
  ).join('')}</div>`;
  const kop = `<div class="pagina-kop"><h1>Tijd</h1><button class="knop klein" data-actie="tijd-laden">Vernieuwen</button></div>
    <div class="tijd-filter">${knoppen}<span class="zacht">${M.kortDatum(van)} – ${M.kortDatum(tot)}</span></div>`;
  if (t.bezig && !t.data) return `<div class="pagina">${kop}<p class="leeg">Je planning wordt opgehaald…</p></div>`;
  const data = t.data || s;
  const r = M.tijdRapport(data, van, tot);
  const melding = t.fout
    ? `<p class="hint fout">Kon de volledige planning niet ophalen: ${esc(t.fout)} Je ziet enkel wat op dit toestel staat (de laatste maand).</p>`
    : !t.volledig && t.data
      ? '<p class="hint">Zonder synchronisatie zie je enkel wat op dit toestel staat.</p>'
      : '';
  if (!r.totaal)
    return `<div class="pagina">${kop}${melding}<p class="leeg">Nog geen bestede tijd in deze periode. Start de timer bij een taak (▶ Start) om je tijd bij te houden.</p></div>`;

  const maxGroep = r.groepen[0]?.totaal || 0;
  const groepen = r.groepen
    .map((g) => {
      const soorten = Object.entries(M.SOORTEN)
        .filter(([k]) => g.soorten[k])
        .map(([k, l]) => `${l} ${M.duurTekst(g.soorten[k])}`)
        .join(' · ');
      const perLes = g.aantalLessen ? ` · gemiddeld ${M.duurTekst(g.perLes)} per les (${g.aantalLessen} ${g.aantalLessen === 1 ? 'les' : 'lessen'})` : '';
      const link = g.klasIds?.length === 1 ? `<a href="#/klas/${g.klasIds[0]}">${esc(g.naam)}</a>` : esc(g.naam);
      return `<li class="t-rij">
        <div class="t-label"><span class="bol" style="--klas:${g.kleur || 'var(--rand-sterk)'}"></span><b>${link}</b><span class="t-waarde">${M.duurTekst(g.totaal)}</span></div>
        ${balk(g.totaal, maxGroep, g.kleur, `${g.naam}: ${M.duurTekst(g.totaal)}`)}
        <div class="t-sub">${soorten}${perLes}</div>
      </li>`;
    })
    .join('');

  const maxMaand = Math.max(...r.maanden.map((m) => m.school + m.opleiding));
  const maanden = r.maanden
    .map(
      (m) => `<tr><th scope="row">${MAANDEN(m.maand)}</th><td>${m.school ? M.duurTekst(m.school) : '–'}</td><td>${m.opleiding ? M.duurTekst(m.opleiding) : '–'}</td>
        <td class="t-num"><b>${M.duurTekst(m.school + m.opleiding)}</b></td><td class="t-balk-cel">${balk(m.school + m.opleiding, maxMaand, 'var(--groen)', `${MAANDEN(m.maand)}: ${M.duurTekst(m.school + m.opleiding)}`)}</td></tr>`
    )
    .join('');

  const top = r.top
    .map(
      (i) => `<li class="t-top"><span class="bol" style="--klas:${i.kleur || 'var(--rand-sterk)'}"></span><span class="t-top-titel">${esc(i.titel)} <small>${esc(i.groep)} · ${M.kortDatum(i.datum)}</small></span><span class="t-waarde">${M.duurTekst(i.ms)}</span></li>`
    )
    .join('');

  return `<div class="pagina tijd-pagina">
    ${kop}
    ${melding}
    <div class="t-tegels">
      <div class="t-tegel"><span class="t-groot">${M.duurTekst(r.totaal)}</span><span class="zacht">in totaal</span></div>
      <div class="t-tegel"><span class="t-groot">${duur(r.school)}</span><span class="zacht">school</span></div>
      <div class="t-tegel"><span class="t-groot">${duur(r.opleiding)}</span><span class="zacht">🎓 opleiding</span></div>
    </div>
    <section class="kaart"><h2>Per klas, onderwerp en opleidingsonderdeel</h2><ol class="t-lijst">${groepen}</ol></section>
    <section class="kaart"><h2>Waar ging de meeste tijd naartoe</h2><ol class="t-lijst">${top}</ol>
      <p class="hint">Per les (voorbereiding en verbeteren samen), opdracht of losse taak.</p></section>
    <section class="kaart"><h2>Per maand</h2>
      <div class="t-tabel-wrap"><table class="t-tabel"><thead><tr><th>Maand</th><th>School</th><th>Opleiding</th><th class="t-num">Samen</th><th></th></tr></thead><tbody>${maanden}</tbody></table></div>
    </section>
    <p class="hint">Tijd telt op de dag waarop de taak gepland staat (anders haar deadline). Enkel tijd die je met de timer bijhield of zelf aanpaste, telt mee.</p>
  </div>`;
}
