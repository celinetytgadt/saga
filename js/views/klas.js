// Saga – pagina van één klas (#/klas/<id>): volgende les, open werk, lessenreeks.

import * as M from '../model.js';
import { esc } from '../ui.js';
import { opdrachtRegel, takenLijst, timerHtml, totaalTijd, voortgang } from '../weergave.js';
import { lesRegel, roosterTekst } from './school.js';

function volgendeLesKaart(s, k, les) {
  if (!les) return `<section class="kaart"><h2>Volgende les</h2><p class="leeg">Geen geplande les.</p></section>`;
  const taken = M.takenVanLes(s, les.id);
  const hoofd = taken.find((t) => t.hoofd);
  const vg = voortgang(taken);
  const w = M.lesWaarschuwing(s, les);
  const n = M.verschilDagen(M.vandaag(), les.datum);
  const wanneer = n === 0 ? 'vandaag' : n === 1 ? 'morgen' : `over ${n} dagen`;
  return `<section class="kaart volgende-les" style="--klas:${k.kleur}">
    <h2>Volgende les</h2>
    <div class="vl-kop" role="button" tabindex="0" data-actie="les" data-id="${les.id}">
      <span class="vl-titel">${esc(les.titel)}</span>
      <span class="vl-datum">${M.kortDatum(les.datum)} · ${wanneer}</span>
      ${w ? `<span class="reden">⚠ ${esc(w.reden)}</span>` : ''}
    </div>
    ${
      hoofd
        ? `<p class="hint">Voorbereiding: ${hoofd.klaar ? '✓ klaar' : `gepland op ${M.kortDatum(M.werkdagVan(s, hoofd) || les.datum)}`}${vg.totaal > 1 ? ` · ${vg.klaar}/${vg.totaal} taken klaar` : ''}</p>
           ${hoofd.klaar ? '' : `<div class="timer-wrap" data-taak="${hoofd.id}">${timerHtml(hoofd)}</div>`}`
        : ''
    }
    ${takenLijst(s, taken.filter((t) => !t.klaar && !t.hoofd), `data-terug-les="${les.id}"`)}
    <div class="chips">
      ${hoofd && !hoofd.klaar ? `<button type="button" class="chip" data-actie="vink" data-id="${hoofd.id}">✓ Voorbereiding klaar</button>` : ''}
      <button type="button" class="chip" data-actie="nieuwe-leerlingtaak" data-les="${les.id}">+ taak voor leerlingen</button>
    </div>
  </section>`;
}

function openWerkKaart(s, k) {
  const v = M.vandaag();
  const vanKlas = M.lijst(s, 'taken').filter((t) => !t.klaar && !t.opdrachtId && M.klassenVanTaak(s, t).includes(k.id));
  const verbeteren = vanKlas.filter((t) => M.isVerbeteren(t));
  const losse = vanKlas.filter((t) => !t.lesId && !M.isVerbeteren(t));
  const opdrachten = M.lijst(s, 'opdrachten')
    .filter((o) => (o.klasIds || []).includes(k.id))
    .filter((o) => {
      const vg = voortgang(M.takenVanOpdracht(s, o.id));
      return !(vg.totaal && vg.klaar === vg.totaal && (!o.deadline || o.deadline < v));
    })
    .sort(M.volgordeOpdracht);
  const wanneer = (t) => M.werkdagVan(s, t) || M.deadlineVan(s, t) || '9';
  const sorteer = (a, b) => (wanneer(a) < wanneer(b) ? -1 : 1);
  const leeg = !verbeteren.length && !losse.length && !opdrachten.length;
  return `<section class="kaart">
    <h2>Open werk</h2>
    ${leeg ? '<p class="leeg">Niets open voor deze klas. 🌿</p>' : ''}
    ${verbeteren.length ? `<h3>Taken: te verbeteren</h3>${takenLijst(s, verbeteren.sort(sorteer), '')}` : ''}
    ${opdrachten.length ? `<h3>To do's met stukken</h3><ol class="lessen-lijst">${opdrachten.map((o) => opdrachtRegel(s, o)).join('')}</ol>` : ''}
    ${losse.length ? `<h3>To do's</h3>${takenLijst(s, losse.sort(sorteer), '')}` : ''}
    <div class="knoppen">
      <button class="knop klein" data-actie="nieuwe-leerlingtaak" data-klas="${k.id}">+ taak voor leerlingen</button>
      <button class="knop klein" data-actie="nieuwe-taak" data-domein="school" data-klas="${k.id}">+ to do</button>
      <button class="knop klein" data-actie="nieuwe-opdracht" data-domein="school" data-klas="${k.id}">+ met stukken</button>
    </div>
  </section>`;
}

function tijdKaart(s, k, lessen) {
  const taken = lessen.flatMap((l) => M.takenVanLes(s, l.id));
  const voorb = taken.filter((t) => !M.isVerbeteren(t));
  const metTijd = new Set(voorb.filter((t) => M.bestedeTijd(t) > 0).map((t) => t.lesId)).size;
  const totaal = totaalTijd(taken);
  if (!totaal) return '';
  return `<section class="kaart">
    <h2>Tijd</h2>
    <p>⏱ <b>${M.duurTekst(totaal)}</b> aan de lessen van de laatste weken${metTijd ? ` · gemiddeld <b>${M.duurTekst(totaalTijd(voorb) / metTijd)}</b> voorbereiding per les` : ''}.</p>
    <p class="hint">Over het hele schooljaar: zie het <a href="#/tijd">tijdsoverzicht</a>.</p>
  </section>`;
}

export function viewKlas(s, id) {
  const k = s.klassen[id];
  if (!k || k.del) return `<div class="pagina"><p class="leeg">Deze klas bestaat niet (meer). <a href="#/klassen">Terug naar School</a></p></div>`;
  const v = M.vandaag();
  const lessen = M.lessenVanKlas(s, k.id);
  const voorbij = lessen.filter((l) => l.datum && l.datum < v);
  const komend = lessen.filter((l) => l.datum && l.datum >= v);
  const zonder = lessen.filter((l) => !l.datum);
  const plan = zonder.length ? M.planVolgensRooster(s, k.id) : [];
  return `<div class="pagina klas-pagina" style="--klas:${k.kleur}">
    <div class="pagina-kop">
      <h1><span class="bol"></span> ${esc(k.naam)}</h1>
      <div class="knoppen-rij">
        <button class="knop klein" data-actie="filter-klas" data-klas="${k.id}">Toon in overzicht</button>
        <button class="knop klein" data-actie="klas-bewerk" data-id="${k.id}">Bewerken</button>
      </div>
    </div>
    <p class="rooster-tekst">Lesdagen: ${roosterTekst(k)}</p>
    <div class="groepen">
      ${volgendeLesKaart(s, k, komend[0])}
      ${openWerkKaart(s, k)}
    </div>
    <section class="kaart groep-kaart reeks" style="--klas:${k.kleur}">
      <header><span class="bol"></span><h2>Lessenreeks</h2></header>
      ${voorbij.length ? `<details><summary>Voorbije lessen (${voorbij.length})</summary><ol class="lessen-lijst">${voorbij.map((l) => lesRegel(s, l, k.id)).join('')}</ol></details>` : ''}
      ${komend.length ? `<ol class="lessen-lijst">${komend.map((l) => lesRegel(s, l, k.id)).join('')}</ol>` : '<p class="leeg">Geen komende lessen.</p>'}
      ${
        zonder.length
          ? `<h3>Zonder datum (${zonder.length})</h3><ol class="lessen-lijst">${zonder.map((l) => lesRegel(s, l, k.id)).join('')}</ol>`
          : ''
      }
      <div class="knoppen">
        <button class="knop klein" data-actie="nieuwe-les" data-klas="${k.id}">+ les</button>
        <button class="knop klein" data-actie="lessen-plakken" data-klas="${k.id}">Lijst plakken</button>
        ${
          plan.length
            ? `<button class="knop klein primair" data-actie="rooster-plannen" data-klas="${k.id}">Inplannen volgens rooster (${plan.length})</button>`
            : zonder.length && !(k.rooster || []).length
              ? '<span class="hint">Stel de lesdagen in (Bewerken) om lessen automatisch in te plannen.</span>'
              : ''
        }
      </div>
      ${plan.length ? `<p class="hint">Voorstel: ${plan.map((p) => `${esc(p.les.titel)} → ${M.kortDatum(p.datum)}`).join(' · ')}. Vakanties en afwezigheden worden overgeslagen.</p>` : ''}
    </section>
    ${tijdKaart(s, k, lessen)}
  </div>`;
}
