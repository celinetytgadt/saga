// Saga – dialogen: taak, les, opdracht, klas, … openen en bewaren.

import * as M from './model.js';
import { getState, wijzig, wijzigOngedaan } from './store.js';
import { $, esc, ui, mobiel, WEEK, bewaarLokaal, melding } from './ui.js';
import {
  blokkenHtml, klasLabel, lesVan, opNaam, sorteerLessen, sorteerTaken, taakTitel, takenLijst, timerHtml, totaalTijd, vergelijkDatum, voortgang,
} from './weergave.js';

export const dlg = $('#dlg');

// Een wijziging met een melding "Ongedaan maken" in plaats van een bevestigingsvraag.
export function metOngedaan(tekst, f) {
  const { resultaat, ongedaan } = wijzigOngedaan(f);
  melding(tekst, { ongedaan });
  return resultaat;
}

function dialoog(html, init, { terug = null, herteken = null } = {}) {
  ui.terug = terug;
  ui.herteken = herteken;
  dlg.innerHTML = `<div class="dlg-in">${html}</div>`;
  if (!dlg.open) dlg.showModal();
  init?.(dlg);
  const eerste = dlg.querySelector('[autofocus]');
  if (eerste && !mobiel.matches) eerste.focus();
}

export function sluit() {
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

export function formWaarden(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function regels(tekst) {
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
  const onderwerpen = M.lijst(s, 'onderwerpen').sort(opNaam);
  const optie = (waarde, tekst) => `<option value="${waarde}" ${waarde === gekozen ? 'selected' : ''}>${tekst}</option>`;
  return [
    optie('los:school', '— losse taak · school —'),
    optie('los:opleiding', '— losse taak · opleiding —'),
    onderwerpen.length
      ? `<optgroup label="School · onderwerpen">${onderwerpen.map((o) => optie('ond:' + o.id, esc(o.naam))).join('')}</optgroup>`
      : '',
    lessen.length
      ? `<optgroup label="School · lessen">${lessen
          .map((l) => optie('les:' + l.id, `${esc(klasLabel(s, l))} · ${esc(l.titel)}${l.datum ? ` (${M.kortDatum(l.datum)})` : ''}`))
          .join('')}</optgroup>`
      : '',
    ...['school', 'opleiding'].map((domein) => {
      const lijst = opdrachten.filter((o) => M.opdrachtDomein(o) === domein);
      if (!lijst.length) return '';
      const pet = domein === 'opleiding' ? '🎓 ' : '';
      return `<optgroup label="${domein === 'school' ? 'School' : 'Opleiding'} · opdrachten">${lijst
        .map((o) => optie('opd:' + o.id, `${pet}${esc(o.titel)}${o.deadline ? ` (${M.kortDatum(o.deadline)})` : ''}`))
        .join('')}</optgroup>`;
    }),
  ].join('');
}

// Enkel een losse schooltaak (eventueel met onderwerp) krijgt zelf klassen.
const voorKlas = (bij) => !bij.lesId && !bij.opdrachtId && bij.domein === 'school';

function leesHoortBij(waarde) {
  const [soort, id] = waarde.split(':');
  return {
    lesId: soort === 'les' ? id : null,
    opdrachtId: soort === 'opd' ? id : null,
    onderwerpId: soort === 'ond' ? id : null,
    domein: soort === 'los' ? id : soort === 'opd' ? M.opdrachtDomein(getState().opdrachten[id]) : 'school',
  };
}

export function openTaak(id, voorinvulling = {}, terug = null) {
  const s = getState();
  const t = id
    ? s.taken[id]
    : { titel: '', lesId: null, opdrachtId: null, werkdag: null, deadline: null, vanaf: null, klaar: false, notitie: '', ...voorinvulling };
  if (!t || t.del) return;
  if (!id && !voorinvulling.deadline) {
    if (t.lesId) t.deadline = { rel: -1 };
    if (t.opdrachtId) t.deadline = { eind: true };
  }
  if (!id && !t.lesId && !t.opdrachtId && !t.domein && ui.filter.domein === 'opleiding') t.domein = 'opleiding';
  const ond = M.onderwerpVan(s, t);
  const hoort = t.lesId ? 'les:' + t.lesId : t.opdrachtId ? 'opd:' + t.opdrachtId : ond ? 'ond:' + ond.id : 'los:' + M.domeinVan(t);
  const sleutel = M.deadlineSleutel(t.deadline);
  const vanaf = M.vanafVan(s, t);
  const basis = M.werkdagVan(s, t) || M.vandaag();
  const les = lesVan(s, t);

  dialoog(
    `<h2>${id ? (t.hoofd ? esc(taakTitel(s, t)) : t.opdrachtId ? 'Stuk van opdracht' : 'Taak') : t.opdrachtId ? 'Nieuw stuk' : 'Nieuwe taak'}</h2>
    ${
      id
        ? `<div class="snel" aria-label="Verplaats naar">
        <span class="snel-label">Verplaats naar</span>
        <button class="chip" data-zet="${M.vandaag()}">Vandaag</button>
        <button class="chip" data-zet="${M.plusDagen(M.vandaag(), 1)}">Morgen</button>
        <button class="chip" data-zet="${M.plusDagen(basis, 7)}">+1 week</button>
        <button class="chip" data-zet="">${t.hoofd ? 'Standaard (vóór de les)' : 'Bakje'}</button>
      </div>`
        : ''
    }
    ${
      id && t.deelVan
        ? `<div class="blokken-wrap">${blokkenHtml(s, t)}</div>`
        : id && t.lesId
          ? `<div class="splits"><span>Te groot voor één blok? Opsplitsen in</span> ${[2, 3, 4, 5].map((n) => `<button type="button" class="chip" data-splits="${n}">${n}</button>`).join('')} <span>blokken</span></div>`
          : id && !t.opdrachtId
            ? `<div class="splits"><span>Te groot voor één keer?</span> <button type="button" class="chip" data-stukken>Opdelen in stukken</button></div>`
            : ''
    }
    ${id ? `<div class="timer-wrap">${timerHtml(t)}</div>` : ''}
    <form id="f-taak" class="formulier">
      ${
        t.hoofd
          ? `<input type="hidden" name="titel" value="${esc(t.titel)}"><input type="hidden" name="hoort" value="${hoort}">
             <p class="hint">Taak van de les ${esc(klasLabel(s, les))} · ${esc(les.titel)}${les.datum ? ` (${M.kortDatum(les.datum)})` : ''}.</p>`
          : `<label>Wat<input name="titel" required value="${esc(t.titel)}" ${id ? '' : 'autofocus'}></label>
             <label>Hoort bij<select name="hoort">${hoortBijOpties(s, hoort)}</select></label>
             <div class="voor-klas">${klasChips(s, t.klasIds || [], 'Voor klas(sen) <small>(optioneel; verschijnt dan ook bij de klas)</small>')}</div>`
      }
      <label>Werkdag <small>(wanneer ik eraan werk; leeg = ${t.hoofd ? 'standaard, vóór de les' : 'bakje'})</small><input type="date" name="werkdag" value="${t.werkdag || ''}"></label>
      <div class="rij">
        <label>Klaar tegen<select name="deadlineSoort">${deadlineOpties(sleutel, { eind: true })}</select></label>
        <label class="dl-datum">Datum<input type="date" name="deadlineDatum" value="${t.deadline?.datum || ''}"></label>
      </div>
      <p class="hint" id="dl-uitleg"></p>
      <label>Kan pas vanaf <small>(optioneel, bv. na indienen)</small><input type="date" name="vanaf" value="${vanaf || ''}"></label>
      <label>Notitie<textarea name="notitie" rows="2">${esc(t.notitie)}</textarea></label>
      <label class="check"><input type="checkbox" name="klaar" ${t.klaar ? 'checked' : ''}> Klaar</label>
      <div class="knoppen">
        ${id && !t.hoofd ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-taak', d);
      d.querySelectorAll('[data-splits]').forEach((b) =>
        b.addEventListener('click', () => {
          const aantal = Number(b.dataset.splits);
          metOngedaan(`Opgesplitst in ${aantal} blokken; de nieuwe blokken staan in het bakje`, (st) => M.splitsTaak(st, id, aantal));
          sluit();
        })
      );
      // Een losse taak wordt een opdracht met stukken; daarna voeg je zelf de stukken toe.
      $('[data-stukken]', d)?.addEventListener('click', () => {
        let opd = null;
        wijzig((st) => (opd = M.maakOpdrachtVanTaak(st, id)));
        if (opd) openOpdracht(opd.id);
      });
      const bijwerken = () => {
        const bij = leesHoortBij(f.hoort.value);
        for (const o of f.deadlineSoort.options) {
          if (o.value.startsWith('rel:')) o.disabled = !bij.lesId;
          if (o.value === 'eind') o.disabled = !bij.opdrachtId;
        }
        if (f.deadlineSoort.selectedOptions[0]?.disabled) f.deadlineSoort.value = bij.opdrachtId ? 'eind' : 'geen';
        const vk = f.querySelector('.voor-klas');
        if (vk) vk.hidden = !voorKlas(bij);
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

      const bewaar = (wijzigingen) => wijzig((st) => M.bewaarTaak(st, id, wijzigingen, t));

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = formWaarden(f);
        let nieuweVanaf = w.vanaf ? { datum: w.vanaf } : null;
        if (w.vanaf && t.vanaf && w.vanaf === vanaf) nieuweVanaf = t.vanaf; // ongewijzigd: behoud koppeling
        const bij = leesHoortBij(w.hoort);
        bewaar({
          titel: w.titel.trim(),
          ...bij,
          klasIds: voorKlas(bij) ? new FormData(f).getAll('klas') : undefined,
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
          wijzig((st) => M.zetWerkdag(st, id, b.dataset.zet || null));
          sluit();
        })
      );
      $('[data-sluit]', d).addEventListener('click', sluit);
      $('[data-weg]', d)?.addEventListener('click', () => {
        metOngedaan('Taak verwijderd', (st) => M.wis(st, 'taken', id));
        sluit();
      });
    },
    {
      terug,
      herteken: id
        ? () => {
            const st = getState();
            const huidig = st.taken[id];
            if (!huidig || huidig.del) return;
            const wrap = dlg.querySelector('.timer-wrap');
            if (wrap && !wrap.querySelector('.tijd-form')) wrap.innerHTML = timerHtml(huidig);
            const blokken = dlg.querySelector('.blokken-wrap');
            if (blokken && huidig.deelGroep) blokken.innerHTML = blokkenHtml(st, huidig);
          }
        : null,
    }
  );
}

function lesTakenHtml(s, lesId) {
  const les = s.lessen[lesId];
  const taken = M.takenVanLes(s, lesId).sort((a, b) => !!b.hoofd - !!a.hoofd || (a.deelNr || 0) - (b.deelNr || 0) || sorteerTaken(s)(a, b));
  const tijd = totaalTijd(taken);
  return `<h3>Taak${tijd && taken.length > 1 ? ` · ⏱ ${M.duurTekst(tijd)} samen` : ''}</h3>
    ${takenLijst(s, taken, `data-terug-les="${lesId}"`) || '<p class="leeg">Nog geen taak bij deze les.</p>'}
    <div class="chips">
      <button type="button" class="chip" data-actie="nieuwe-taak" data-les="${lesId}">+ extra taak</button>
      ${les?.datum ? `<button type="button" class="chip" data-actie="verbeteren" data-les="${lesId}">+ verbeteren</button>` : ''}
    </div>`;
}

// Knoppen om klassen aan te vinken.
function klasKnoppen(s, gekozen) {
  return M.lijst(s, 'klassen')
    .sort(opNaam)
    .map(
      (k) =>
        `<label class="dagknop-check klaskeuze" style="--klas:${k.kleur}"><input type="checkbox" name="klas" value="${k.id}" ${gekozen.includes(k.id) ? 'checked' : ''}><span>${esc(k.naam)}</span></label>`
    )
    .join('');
}

// Optionele klaskeuze (losse schooltaak, schoolopdracht, afwezigheid).
function klasChips(s, gekozen, legende) {
  const knoppen = klasKnoppen(s, gekozen);
  return knoppen ? `<fieldset><legend>${legende}</legend><div class="dagknoppen">${knoppen}</div></fieldset>` : '';
}

// Klassen van een les (een les kan bij meerdere klassen horen), of een nieuwe klas.
function klasKeuze(s, gekozen) {
  const knoppen = klasKnoppen(s, gekozen);
  return `<fieldset><legend>Klas(sen)</legend>
    ${knoppen ? `<div class="dagknoppen">${knoppen}</div>` : ''}
    <label class="klein-veld">${knoppen ? 'of een nieuwe klas' : 'Nieuwe klas'}<input name="nieuweKlas" placeholder="bv. BKH4"></label>
    <p class="hint fout" id="klas-fout" hidden>Kies minstens één klas.</p>
  </fieldset>`;
}

// Bij een les: naar de pagina van de klas, en de reeks één lesmoment opschuiven.
function reeksHtml(s, les) {
  const klassen = M.klassenVanLes(les)
    .map((id) => s.klassen[id])
    .filter((k) => k && !k.del);
  if (!klassen.length) return '';
  const metRooster = klassen.find((k) => (k.rooster || []).length);
  const later = metRooster && les.datum && M.reeksPlan(s, les.id, metRooster.id, 1);
  const vroeger = metRooster && les.datum && M.reeksPlan(s, les.id, metRooster.id, -1);
  return `<div class="reeks-wrap">
    ${
      les.datum && metRooster
        ? `<h3>Reeks van ${esc(metRooster.naam)} opschuiven <small>(deze en alle volgende lessen, volgens het lesrooster)</small></h3>
      <div class="chips">
        ${vroeger ? `<button type="button" class="chip" data-actie="reeks" data-les="${les.id}" data-klas="${metRooster.id}" data-r="-1">‹ één lesmoment vroeger</button>` : ''}
        ${later ? `<button type="button" class="chip" data-actie="reeks" data-les="${les.id}" data-klas="${metRooster.id}" data-r="1">één lesmoment later ›</button>` : ''}
      </div>`
        : les.datum
          ? '<p class="hint">Stel de lesdagen van de klas in om de reeks te kunnen opschuiven.</p>'
          : ''
    }
    <div class="chips">${klassen.map((k) => `<a class="chip" href="#/klas/${k.id}" data-sluit-dlg>Naar ${esc(k.naam)} →</a>`).join('')}</div>
  </div>`;
}

export function openLes(id, voorinvulling = {}) {
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
          : `<p class="hint">Saga maakt bij de les één taak met dezelfde naam, op de dag vóór de les (of vroeger als dat een werkdag is). Die kun je daarna verschuiven.</p>`
      }
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>${id ? 'Sluiten' : 'Annuleren'}</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>
    ${id ? `<div class="taken-wrap">${lesTakenHtml(s, id)}</div>${reeksHtml(s, l)}` : ''}`,
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
          M.bewaarLes(st, id, { klasIds, titel: fd.get('titel').trim(), datum: fd.get('datum') || null });
        });
        sluitHelemaal();
      });
      $('[data-sluit]', d).addEventListener('click', sluitHelemaal);
      $('[data-weg]', d)?.addEventListener('click', () => {
        metOngedaan('Les verwijderd', (st) => M.verwijderLes(st, id));
        sluitHelemaal();
      });
    },
    {
      herteken: id
        ? () => {
            const wrap = dlg.querySelector('.taken-wrap');
            if (wrap) wrap.innerHTML = lesTakenHtml(getState(), id);
            const reeks = dlg.querySelector('.reeks-wrap');
            const les = getState().lessen[id];
            if (reeks && les && !les.del) reeks.outerHTML = reeksHtml(getState(), les);
          }
        : null,
    }
  );
}

export function openVerbeteren(lesId) {
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
            soort: 'verbeteren',
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
  const tijd = totaalTijd(taken);
  return `<h3>Stukken ${vg.totaal ? `· ${vg.klaar}/${vg.totaal} klaar` : ''}${tijd ? ` · ⏱ ${M.duurTekst(tijd)}` : ''}</h3>
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

function onderwerpOpties(s, gekozen) {
  return M.lijst(s, 'onderwerpen')
    .sort(opNaam)
    .map((o) => `<option value="${o.id}" ${o.id === gekozen ? 'selected' : ''}>${esc(o.naam)}</option>`)
    .join('');
}

// Opdracht met stukken: bij de opleiding (per opleidingsonderdeel) of bij school (per onderwerp).
export function openOpdracht(id, voorinvulling = {}) {
  const s = getState();
  const vakken = M.lijst(s, 'vakken');
  const o = id
    ? s.opdrachten[id]
    : voorinvulling.domein === 'school'
      ? { domein: 'school', onderwerpId: voorinvulling.onderwerpId || '', klasIds: voorinvulling.klasId ? [voorinvulling.klasId] : [], titel: '', deadline: '' }
      : { vakId: voorinvulling.vakId || ui.laatsteVak || vakken[0]?.id || '', titel: '', deadline: '' };
  if (!o || o.del) return;
  const school = M.opdrachtDomein(o) === 'school';
  const groepen = school ? M.lijst(s, 'onderwerpen') : vakken;
  dialoog(
    `<h2>${school ? (id ? 'Opdracht' : 'Nieuwe opdracht') : id ? '🎓 Opdracht' : '🎓 Nieuwe opdracht'}</h2>
    <form id="f-opd" class="formulier">
      <label>${school ? 'Onderwerp' : 'Opleidingsonderdeel'}<select name="groep">
        <option value="">— geen —</option>${school ? onderwerpOpties(s, o.onderwerpId) : vakOpties(s, o.vakId)}
        <option value="__nieuw" ${groepen.length || voorinvulling.klasId ? '' : 'selected'}>+ nieuw ${school ? 'onderwerp' : 'onderdeel'}…</option>
      </select></label>
      <label class="nieuw-vak">Naam nieuw ${school ? 'onderwerp' : 'onderdeel'}<input name="nieuweGroep" placeholder="${school ? 'bv. Stage' : 'bv. Didactiek 2'}"></label>
      <label>Opdracht<input name="titel" required value="${esc(o.titel)}" placeholder="${school ? 'bv. Stageverslag' : 'bv. Portfolio stage'}" ${id ? '' : 'autofocus'}></label>
      <label>Einddeadline${school ? ' <small>(optioneel)</small>' : ''}<input type="date" name="deadline" ${school ? '' : 'required'} value="${o.deadline || ''}"></label>
      ${school ? klasChips(s, o.klasIds || [], 'Voor klas(sen) <small>(optioneel)</small>') : ''}
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
        const nieuw = f.groep.value === '__nieuw';
        f.querySelector('.nieuw-vak').hidden = !nieuw;
        f.nieuweGroep.required = nieuw;
      };
      f.groep.addEventListener('change', toonNieuw);
      toonNieuw();

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = formWaarden(f);
        wijzig((st) => {
          const collectie = school ? 'onderwerpen' : 'vakken';
          const kleuren = school ? M.KLASKLEUREN : M.VAKKLEUREN;
          let groep = w.groep || null;
          if (groep === '__nieuw') {
            groep = M.zet(st, collectie, {
              id: M.nieuwId(),
              naam: w.nieuweGroep.trim(),
              kleur: kleuren[M.lijst(st, collectie).length % kleuren.length],
            }).id;
          }
          if (!school) ui.laatsteVak = groep;
          const opd = M.zet(st, 'opdrachten', {
            ...(id ? st.opdrachten[id] : {}),
            id: id || M.nieuwId(),
            ...(school ? { domein: 'school', onderwerpId: groep, vakId: null, klasIds: new FormData(f).getAll('klas') } : { vakId: groep }),
            titel: w.titel.trim(),
            deadline: w.deadline || null,
            volg: id ? st.opdrachten[id].volg : M.volgendeOpdrachtVolg(st),
          });
          if (!id && w.stukken) {
            M.maakStukken(st, opd.id, regels(w.stukken));
            if (w.verdeel) M.pasVerdelingToe(st, M.verdeelOpdracht(st, opd.id));
          }
        });
        sluitHelemaal();
      });
      $('[data-sluit]', d).addEventListener('click', sluitHelemaal);
      $('[data-weg]', d)?.addEventListener('click', () => {
        metOngedaan('Opdracht verwijderd', (st) => M.verwijderOpdracht(st, id));
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

export function openStukkenPlakken(opdrachtId) {
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

export function openVak(id) {
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
        metOngedaan('Opleidingsonderdeel verwijderd', (st) => M.verwijderVak(st, id));
        sluit();
      });
    }
  );
}

export function openOnderwerp(id) {
  const s = getState();
  const o = id ? s.onderwerpen[id] : { naam: '', kleur: M.KLASKLEUREN[M.lijst(s, 'onderwerpen').length % M.KLASKLEUREN.length] };
  dialoog(
    `<h2>${id ? 'Onderwerp bewerken' : 'Nieuw onderwerp'}</h2>
    <form id="f-ond" class="formulier">
      <label>Naam<input name="naam" required value="${esc(o.naam)}" placeholder="bv. Stage, Vergaderingen" autofocus></label>
      ${kleurKeuze(M.KLASKLEUREN, o.kleur)}
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-ond', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        wijzig((st) =>
          M.zet(st, 'onderwerpen', { ...(id ? st.onderwerpen[id] : {}), id: id || M.nieuwId(), naam: fd.get('naam').trim(), kleur: fd.get('kleur') || o.kleur })
        );
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
      $('[data-weg]', d)?.addEventListener('click', () => {
        metOngedaan('Onderwerp verwijderd', (st) => M.verwijderOnderwerp(st, id));
        sluit();
      });
    }
  );
}

export function openDag(datum) {
  const s = getState();
  const werk = M.isWerkdag(s, datum);
  const standaard = s.instellingen.werkdagen.includes(M.weekdag(datum));
  const sw = M.afsprakenOp(s, datum).some((a) => a.werk);
  const uitleg = sw && werk ? 'Werkdag (#sw in je agenda).' : werk === standaard ? (werk ? 'Vaste werkdag.' : '') : werk ? 'Extra werkdag (manueel aangeduid).' : 'Werkdag, hier uitgezet.';
  dialoog(
    `<h2>${M.kortDatum(datum)}</h2>
    <div class="menu">
      <button class="knop" data-actie="nieuwe-taak" data-datum="${datum}">+ taak op deze dag</button>
      <button class="knop" data-actie="nieuwe-les" data-datum="${datum}">+ les op deze dag</button>
      <button class="knop" data-actie="afwezigheid" data-datum="${datum}">+ vakantie of afwezigheid vanaf deze dag</button>
      <button class="knop" data-werk>${werk ? 'Geen werkdag maken' : 'Extra werkdag maken'}</button>
    </div>
    <p class="hint">${uitleg}</p>`,
    (d) => {
      $('[data-werk]', d).addEventListener('click', () => {
        wijzig((st) => M.wisselWerkdag(st, datum));
        sluit();
      });
    }
  );
}

export function openNieuw() {
  dialoog(
    `<h2>Nieuw</h2>
    <div class="menu">
      <button class="knop" data-actie="nieuwe-taak">✏️ Taak <small>losse taak of bij een les/opdracht</small></button>
      <button class="knop" data-actie="nieuwe-les">🏫 Les <small>school</small></button>
      <button class="knop" data-actie="nieuwe-opdracht" data-domein="school">📋 Opdracht <small>school, met stukken</small></button>
      <button class="knop" data-actie="nieuwe-opdracht" data-domein="opleiding">🎓 Opdracht <small>opleiding, met stukken</small></button>
      <button class="knop" data-actie="afwezigheid">🏖 Vakantie of afwezigheid</button>
    </div>`
  );
}

// Vakantie (alle klassen) of afwezigheid van één of meer klassen.
export function openAfwezigheid(id, voorinvulling = {}) {
  const s = getState();
  const a = id ? s.afwezigheden?.[id] : { reden: '', van: voorinvulling.datum || M.vandaag(), tot: voorinvulling.datum || M.vandaag(), klasIds: [] };
  if (!a || a.del) return;
  const vakantie = M.isVakantie(a);
  dialoog(
    `<h2>${id ? (vakantie ? 'Vakantie' : 'Afwezigheid') : 'Vakantie of afwezigheid'}</h2>
    <form id="f-afw" class="formulier">
      <label>Wat<input name="reden" required value="${esc(a.reden)}" placeholder="bv. Herfstvakantie, Uitstap Brussel, Stage" ${id ? '' : 'autofocus'}></label>
      <div class="rij">
        <label>Van<input type="date" name="van" required value="${a.van || ''}"></label>
        <label>Tot en met<input type="date" name="tot" required value="${a.tot || a.van || ''}"></label>
      </div>
      <fieldset><legend>Voor wie</legend>
        <label class="check"><input type="radio" name="wie" value="alle" ${vakantie ? 'checked' : ''}> Alle klassen (vakantie, studiedag voor leerlingen)</label>
        <label class="check"><input type="radio" name="wie" value="klassen" ${vakantie ? '' : 'checked'}> Enkel deze klassen:</label>
        <div class="dagknoppen afw-klassen">${klasKnoppen(s, a.klasIds || [])}</div>
      </fieldset>
      <p class="hint fout" id="afw-fout" hidden></p>
      <div class="knoppen">
        ${id ? `<button type="button" class="knop gevaar" data-weg>Verwijderen</button>` : ''}
        <span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Opslaan</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-afw', d);
      const wie = () => {
        const alle = f.wie.value === 'alle';
        f.querySelector('.afw-klassen').classList.toggle('uit', alle);
        if (!alle && f.tot.value < f.van.value) f.tot.value = f.van.value;
      };
      f.addEventListener('change', (e) => {
        if (e.target.name === 'klas' && e.target.checked) f.wie.value = 'klassen';
        if (e.target.name === 'van' && (!f.tot.value || f.tot.value < f.van.value)) f.tot.value = f.van.value;
        wie();
      });
      wie();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const klasIds = fd.get('wie') === 'alle' ? [] : fd.getAll('klas');
        const fout = $('#afw-fout', d);
        fout.hidden = true;
        if (fd.get('wie') !== 'alle' && !klasIds.length) {
          fout.textContent = 'Kies minstens één klas, of kies "Alle klassen".';
          return (fout.hidden = false);
        }
        if (fd.get('tot') < fd.get('van')) {
          fout.textContent = '"Tot en met" ligt vóór "Van".';
          return (fout.hidden = false);
        }
        wijzig((st) => {
          st.afwezigheden ||= {};
          M.zet(st, 'afwezigheden', { ...(id ? st.afwezigheden[id] : {}), id: id || M.nieuwId(), reden: fd.get('reden').trim(), van: fd.get('van'), tot: fd.get('tot'), klasIds });
        });
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
      $('[data-weg]', d)?.addEventListener('click', () => {
        metOngedaan(`${a.reden || 'Afwezigheid'} verwijderd`, (st) => M.wis(st, 'afwezigheden', id));
        sluit();
      });
    }
  );
}

export function openKlas(id) {
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
        metOngedaan('Klas verwijderd', (st) => M.verwijderKlas(st, id));
        sluit();
      });
    }
  );
}

export function openPlakken(klasId) {
  const s = getState();
  const k = s.klassen[klasId];
  dialoog(
    `<h2>Lessen plakken · ${esc(k.naam)}</h2>
    <form id="f-plak" class="formulier">
      <label>Eén les per regel, in volgorde<textarea name="lijst" rows="8" placeholder="Documentenstroom&#10;Aankoopfactuur basis&#10;Aankoopfactuur met korting" autofocus></textarea></label>
      <p class="hint">De lessen krijgen nog geen datum en komen bij "Lessen zonder datum". Hun taak verschijnt zodra de les een datum heeft. Krijgt een les samen met een andere klas, dan vink je die klas daarna aan bij de les.</p>
      <div class="knoppen"><span class="vul"></span>
        <button type="button" class="knop" data-sluit>Annuleren</button>
        <button class="knop primair">Toevoegen</button>
      </div>
    </form>`,
    (d) => {
      const f = $('#f-plak', d);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        wijzig((st) => {
          let volg = M.volgendeVolg(st, klasId);
          for (const titel of regels(f.lijst.value)) {
            M.zet(st, 'lessen', { id: M.nieuwId(), klasIds: [klasId], titel, datum: null, volg: volg++ });
          }
          M.zorgHoofdtaken(st);
        });
        sluit();
      });
      $('[data-sluit]', d).addEventListener('click', sluit);
    }
  );
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
