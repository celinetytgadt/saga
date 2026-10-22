// Saga – bouwstenen van de schermen: kaarten, lijstjes, sorteren.

import * as M from './model.js';
import { esc, GRIJS } from './ui.js';

// ---------- hulpjes ----------

export function klassenVan(s, les) {
  return M.klassenVanLes(les)
    .map((id) => s.klassen[id])
    .filter((k) => k && !k.del);
}

// Naam voor een lijst klas-id's, bv. "BKH3-K2 + K3".
export function klassenNaam(s, ids) {
  return M.groepNaam((ids || []).map((id) => s.klassen[id]).filter((k) => k && !k.del).map((k) => k.naam));
}

export function klasLabel(s, les) {
  return M.groepNaam(klassenVan(s, les).map((k) => k.naam)) || '?';
}

export function klasStijl(s, les) {
  const k = klassenVan(s, les);
  const een = k[0]?.kleur || GRIJS;
  return `--klas:${een};--klas2:${(k[1] || k[0])?.kleur || een}`;
}

export function vakVan(s, opd) {
  const v = opd && opd.vakId && s.vakken[opd.vakId];
  return v && !v.del ? v : null;
}

export function onderwerpVanOpdracht(s, opd) {
  const o = opd && opd.onderwerpId && s.onderwerpen?.[opd.onderwerpId];
  return o && !o.del ? o : null;
}

// Kleur en groepsnaam van een opdracht: het opleidingsonderdeel of (school) het onderwerp.
export function opdrachtStijl(s, opd) {
  if (M.opdrachtDomein(opd) === 'school') {
    const o = onderwerpVanOpdracht(s, opd);
    return { kleur: o?.kleur || GRIJS, naam: o?.naam || '', opl: false };
  }
  const v = vakVan(s, opd);
  return { kleur: v?.kleur || 'var(--fuchsia)', naam: v?.naam || '', opl: true };
}

export function lesVan(s, taak) {
  const l = taak.lesId && s.lessen[taak.lesId];
  return l && !l.del ? l : null;
}

export function opdrachtVan(s, taak) {
  const o = taak.opdrachtId && s.opdrachten[taak.opdrachtId];
  return o && !o.del ? o : null;
}

// Waar hoort een taak bij: kleur en een korte omschrijving.
export function anker(s, taak) {
  const les = lesVan(s, taak);
  if (les) return { kleur: klassenVan(s, les)[0]?.kleur || GRIJS, label: klasLabel(s, les), titel: les.titel };
  const opd = opdrachtVan(s, taak);
  if (opd) {
    const st = opdrachtStijl(s, opd);
    return { kleur: st.kleur, label: st.naam || (st.opl ? 'Opleiding' : ''), titel: opd.titel };
  }
  const ond = M.onderwerpVan(s, taak);
  if (ond) return { kleur: ond.kleur, label: ond.naam, titel: '' };
  return { kleur: M.domeinVan(taak) === 'opleiding' ? 'var(--fuchsia)' : 'var(--rand-sterk)', label: '', titel: '' };
}


export function vergelijkDatum(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

export const sorteerTaken = (s) => (a, b) =>
  a.klaar - b.klaar ||
  vergelijkDatum(M.deadlineVan(s, a), M.deadlineVan(s, b)) ||
  (a.volg || 0) - (b.volg || 0) ||
  (a.titel || '').localeCompare(b.titel || '');

export const sorteerLessen = (s) => (a, b) => klasLabel(s, a).localeCompare(klasLabel(s, b)) || (a.volg || 0) - (b.volg || 0);

export const opNaam = (a, b) => a.naam.localeCompare(b.naam);

// Taken die in het bakje horen: geen werkdag, en (als ze bij een les horen) de les heeft een datum.
export function inTePlannen(s) {
  return M.lijst(s, 'taken').filter((t) => {
    if (t.klaar || M.werkdagVan(s, t)) return false;
    if (t.opdrachtId) return !!opdrachtVan(s, t);
    if (!t.lesId) return true;
    const l = lesVan(s, t);
    return l && l.datum;
  });
}

// Taken van een vroegere dag die nog niet klaar zijn. De voorbereiding van een les die
// al voorbij is, telt niet mee: die les is gegeven.
export function blijvenLiggen(s, v = M.vandaag()) {
  return M.lijst(s, 'taken').filter((t) => {
    const wd = !t.klaar && M.werkdagVan(s, t);
    if (!wd || wd >= v) return false;
    const les = !M.isVerbeteren(t) && lesVan(s, t);
    return !(les && les.datum && les.datum < v);
  });
}

// ---------- bakje ----------
// Het bakje toont enkel wat binnenkort speelt; de rest staat bij School en Opleiding.
// - blijven liggen: altijd;
// - bij een les: enkel voor lessen in de komende 2 weken;
// - verbeteren: enkel als het in de komende 2 weken moet gebeuren;
// - to do's: deadline binnen 2 weken, of zonder deadline;
// - opleiding: per opleidingsonderdeel de volgende 5.
export const BAKJE_DAGEN = 14;
export const OPL_PER_ONDERDEEL = 5;

function bakjeDatum(s, t) {
  if (M.isVerbeteren(t)) return M.vanafVan(s, t) || M.deadlineVan(s, t);
  const les = lesVan(s, t);
  if (les) return les.datum;
  return M.deadlineVan(s, t);
}

export function bakje(s, zien = () => true, v = M.vandaag()) {
  const grens = M.plusDagen(v, BAKJE_DAGEN);
  const liggen = blijvenLiggen(s, v).filter(zien).sort(sorteerTaken(s));
  const school = [];
  const perVak = new Map();
  let later = 0;
  for (const t of inTePlannen(s).filter(zien).sort(sorteerTaken(s))) {
    if (M.domeinVan(t) === 'opleiding') {
      const vak = vakVan(s, opdrachtVan(s, t));
      const sleutel = vak?.id || '';
      if (!perVak.has(sleutel)) perVak.set(sleutel, { vak, taken: [], meer: 0 });
      const g = perVak.get(sleutel);
      if (g.taken.length < OPL_PER_ONDERDEEL) g.taken.push(t);
      else g.meer++;
      continue;
    }
    const d = bakjeDatum(s, t);
    if (!d || d <= grens) school.push(t);
    else later++;
  }
  const opleiding = [...perVak.values()].sort((a, b) => (a.vak?.naam || '~').localeCompare(b.vak?.naam || '~'));
  later += opleiding.reduce((n, g) => n + g.meer, 0);
  const aantal = liggen.length + school.length + opleiding.reduce((n, g) => n + g.taken.length, 0);
  return { liggen, school, opleiding, later, aantal };
}

export function dagKort(datum) {
  const d = M.parseDatum(datum);
  return `${d.getDate()} ${M.MAANDNAMEN[d.getMonth()]}`;
}

export function nogDagen(datum) {
  const n = M.verschilDagen(M.vandaag(), datum);
  if (n < 0) return 'voorbij';
  if (n === 0) return 'vandaag';
  if (n === 1) return 'morgen';
  return `nog ${n} d`;
}

export function voortgang(taken) {
  const klaar = taken.filter((t) => t.klaar).length;
  return { klaar, totaal: taken.length, pct: taken.length ? Math.round((100 * klaar) / taken.length) : 0 };
}

// ---------- bouwstenen ----------

// Snel iets noteren: één regel = één to do in het bakje. Enter bewaart, een geplakte
// lijst wordt meerdere to do's. Sorteren (dag, onderwerp, deadline) kan later.
export function snelInvoerHtml(plaats = '', placeholder = 'Wat moet er nog gebeuren?') {
  return `<form class="snel-invoer ${plaats}" autocomplete="off">
    <textarea name="tekst" rows="1" placeholder="${placeholder}" aria-label="Snel een to do noteren" enterkeyhint="done"></textarea>
    <button class="knop primair klein" aria-label="Noteren">+</button>
  </form>`;
}

// Bestede tijd bij een taak: een lopende klok (tikt elke seconde mee) of het totaal.
export function tijdLabel(t) {
  if (t.gestart) return `<span class="tijd loopt" title="timer loopt">⏱ <span data-klok="${t.id}">${M.klokTekst(M.bestedeTijd(t))}</span></span>`;
  return t.tijd ? `<span class="tijd" title="bestede tijd">⏱ ${M.duurTekst(t.tijd)}</span>` : '';
}

export function totaalTijd(taken) {
  return taken.reduce((som, t) => som + M.bestedeTijd(t), 0);
}

// Timer in de taakdialoog: starten, pauzeren en later verder doen.
export function timerHtml(t) {
  const ms = M.bestedeTijd(t);
  const knop = t.gestart ? '❚❚ Pauzeren' : ms ? '▶ Verder doen' : '▶ Start';
  return `<div class="timer ${t.gestart ? 'loopt' : ''}">
    <span class="timer-klok" data-klok="${t.id}" aria-label="Bestede tijd">${M.klokTekst(ms)}</span>
    <button type="button" class="knop ${t.gestart ? '' : 'primair'}" data-actie="timer" data-id="${t.id}">${knop}</button>
    ${ms ? `<button type="button" class="chip" data-actie="tijd-aanpassen" data-id="${t.id}">Aanpassen</button>` : ''}
  </div>`;
}

// Bestede tijd zelf invullen (bv. timer vergeten stoppen), in het venster zelf.
export function tijdFormHtml(t) {
  const min = Math.floor(M.bestedeTijd(t) / 60000);
  return `<form class="timer tijd-form" data-id="${t.id}">
    <label>Bestede tijd <small>(45 = minuten, 1:30 = uren en minuten)</small>
      <input name="tijd" inputmode="decimal" autocomplete="off" value="${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}"></label>
    <div class="knoppen-rij"><button class="knop primair klein">Bewaren</button><button type="button" class="knop klein" data-actie="tijd-annuleer" data-id="${t.id}">Annuleren</button></div>
    <p class="hint fout" hidden>Dat kon Saga niet lezen. Typ bv. 45 of 1:30.</p>
  </form>`;
}

// Naam van een taak: de taak van een les heet zoals de les; blokken krijgen (2/3);
// een taak voor leerlingen staat op de planning als "Verbeteren CR: …".
export function taakTitel(s, t) {
  if (M.isLeerlingTaak(t)) return `Verbeteren CR: ${t.titel || '(zonder titel)'}`;
  const basis = t.titel || lesVan(s, t)?.titel || '(zonder titel)';
  return t.deelVan ? `${basis} (${t.deelNr}/${t.deelVan})` : basis;
}

// Taak bij een les: zelfde vorm als de les (één regel met de naam van de les),
// maar met een ingekleurde achtergrond en een vinkje.
export function lesTaakKaart(s, t) {
  const les = lesVan(s, t);
  const w = M.waarschuwing(s, t);
  const naam = taakTitel(s, t);
  const tijd = M.bestedeTijd(t);
  const tip = [klasLabel(s, les) + ' · ' + les.titel, w?.reden, tijd && `bestede tijd ${M.duurTekst(tijd)}`].filter(Boolean).join(' – ');
  return `<div class="lestaak ${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}" draggable="true" data-sleep="taak:${t.id}" style="${klasStijl(s, les)}" title="${esc(tip)}">
    <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
    <span class="les-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">${esc(naam)}</span>${t.gestart ? tijdLabel(t) : ''}${w ? '<span class="lestaak-let" aria-hidden="true">!</span>' : ''}
  </div>`;
}

export function taakKaart(s, t) {
  if (lesVan(s, t)) return lesTaakKaart(s, t);
  const w = M.waarschuwing(s, t);
  const a = anker(s, t);
  const opl = M.domeinVan(t) === 'opleiding';
  const dl = M.deadlineVan(s, t);
  const sub = [];
  if (a.label) sub.push(`<b>${esc(a.label)}</b> ${esc(a.titel)}`);
  else if (opl) sub.push('<b>Opleiding</b>');
  if (dl && !t.klaar && !t.lesId) sub.push(`⚑ ${M.kortDatum(dl)}`);
  if (t.gestart || t.tijd) sub.push(tijdLabel(t));
  if (w) sub.push(`<span class="reden">${esc(w.reden)}</span>`);
  return `<div class="taak ${opl ? 'opl' : ''} ${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}" draggable="true" data-sleep="taak:${t.id}" style="--klas:${a.kleur}">
    <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
    <div class="taak-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">
      <span class="titel">${opl ? '<span class="pet" aria-label="Opleiding">🎓</span> ' : ''}${esc(taakTitel(s, t))}</span>${sub.length ? `<span class="sub">${sub.join(' · ')}</span>` : ''}
    </div>
  </div>`;
}

// Wat bij een les hoort, in één regel per taak: de voorbereiding en de taken voor leerlingen.
function lesTakenRegels(s, l) {
  const taken = M.takenVanLes(s, l.id).filter((t) => !t.deelNr || t.deelNr === 1);
  if (!taken.length) return '';
  const regel = (t) => {
    const wd = M.werkdagVan(s, t);
    const naam = t.hoofd ? 'Voorbereiding' + (t.deelVan ? ` (${t.deelVan} blokken)` : '') : M.isLeerlingTaak(t) ? `📝 ${esc(t.titel)}` : esc(taakTitel(s, t));
    const wanneer = M.isLeerlingTaak(t) ? `indienen ${M.kortDatum(t.indien)}` : wd ? M.kortDatum(wd) : 'in bakje';
    return `<span class="les-sub ${t.klaar ? 'af' : ''}">${t.klaar ? '✓' : '○'} ${naam} <small>${wanneer}</small></span>`;
  };
  const volgorde = (t) => (t.hoofd ? 0 : M.isLeerlingTaak(t) ? 1 : 2);
  return `<span class="les-subs">${taken.sort((a, b) => volgorde(a) - volgorde(b)).map(regel).join('')}</span>`;
}

// In de kalender enkel het onderwerp: de kleurlijn toont de klas (volledige naam bij aanwijzen).
// `metTaken`: ook de voorbereiding en taken eronder (bij "Enkel lessen").
export function lesKaart(s, l, metKlas = true, metTaken = false) {
  const taken = M.takenVanLes(s, l.id);
  const v = voortgang(taken);
  const samen = klassenVan(s, l).length > 1;
  const teller = v.totaal && v.klaar === v.totaal ? '<span class="teller af" title="voorbereid">✓</span>' : '';
  const w = M.lesWaarschuwing(s, l);
  const tip = [`${klasLabel(s, l)} · ${l.titel}`, w && `⚠ ${w.reden}`].filter(Boolean).join(' – ');
  return `<div class="les ${samen ? 'samen' : ''} ${w ? 'oranje' : ''}" role="button" tabindex="0" draggable="true" data-sleep="les:${l.id}" data-actie="les" data-id="${l.id}" style="${klasStijl(s, l)}" title="${esc(tip)}">
    <span class="les-tekst">${metKlas ? `<b>${esc(klasLabel(s, l))}</b> ` : ''}${esc(l.titel)}</span>${w ? `<span class="lestaak-let" aria-label="${esc(w.reden)}">!</span>` : ''}${teller}
    ${metTaken ? lesTakenRegels(s, l) : ''}
  </div>`;
}

// Taken bundelen per opdracht, zodat je eerst ziet waarvoor het is. Een taak bij een les
// staat apart (ze ziet eruit als de les). Volgorde: lestaken (op lesdatum), dan
// opdrachten (zoals ingegeven), dan losse taken.
export function groepen(s, taken) {
  const map = new Map();
  for (const t of taken) {
    const les = lesVan(s, t);
    const opd = !les && opdrachtVan(s, t);
    const sleutel = opd ? 'opd:' + opd.id : 'taak:' + t.id;
    if (!map.has(sleutel)) map.set(sleutel, { sleutel, les, opd, taken: [] });
    map.get(sleutel).taken.push(t);
  }
  const rang = (g) => (g.les ? 0 : g.opd ? 1 : 2);
  const lijst = [...map.values()].sort(
    (a, b) =>
      rang(a) - rang(b) ||
      (a.les && b.les ? vergelijkDatum(a.les.datum, b.les.datum) || sorteerLessen(s)(a.les, b.les) || (a.taken[0].deelNr || 0) - (b.taken[0].deelNr || 0) : 0) ||
      (a.opd && b.opd ? M.volgordeOpdracht(a.opd, b.opd) : 0) ||
      (!a.les && !a.opd ? sorteerTaken(s)(a.taken[0], b.taken[0]) : 0)
  );
  for (const g of lijst) g.taken.sort((a, b) => a.klaar - b.klaar || (a.volg || 0) - (b.volg || 0) || vergelijkDatum(M.deadlineVan(s, a), M.deadlineVan(s, b)));
  return lijst;
}

export function groepKaart(s, g) {
  if (!g.opd) return taakKaart(s, g.taken[0]);
  const opl = M.opdrachtDomein(g.opd) === 'opleiding';
  const st = opdrachtStijl(s, g.opd);
  const kop = `<div class="groep-kop" role="button" tabindex="0" data-actie="opdracht" data-id="${g.opd.id}">
      <span class="groep-naam">${opl ? '🎓 ' : ''}<b>${esc(g.opd.titel)}</b></span>
      <span class="groep-info">${st.naam ? esc(st.naam) + (g.opd.deadline ? ' · ' : '') : ''}${g.opd.deadline ? `<span class="vlag ${opl ? 'opl' : ''}">⚑ ${M.kortDatum(g.opd.deadline)}</span>` : ''}</span>
    </div>`;
  const rijen = g.taken
    .map((t) => {
      const w = M.waarschuwing(s, t);
      const eigen = !t.lesId && t.deadline?.datum && !t.klaar ? ` <span class="rij-dl vlag ${M.domeinVan(t) === 'opleiding' ? 'opl' : ''}">⚑ ${M.kortDatum(t.deadline.datum)}</span>` : '';
      return `<div class="rij-taak ${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''}" draggable="true" data-sleep="taak:${t.id}">
        <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
        <div class="rij-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}">${esc(t.titel)}${eigen}${t.gestart ? ' ' + tijdLabel(t) : ''}${w ? `<span class="reden">${esc(w.reden)}</span>` : ''}</div>
      </div>`;
    })
    .join('');
  return `<div class="groep ${opl ? 'opl' : ''}" style="--klas:${st.kleur}">${kop}${rijen}</div>`;
}

// Opdrachten met stukken en losse taken in één kaart (onderwerp, klas of opleidingsonderdeel).
// Lopend werk bovenaan; afgewerkte opdrachten en afgevinkte taken ingeklapt.
export function werkKaart(s, { titel, kleur, opdrachten = [], taken = [], kop = '', onder = '', opl = false, leeg = 'Geen lopend werk.' }) {
  const v = M.vandaag();
  const afgerond = (o) => {
    const vg = voortgang(M.takenVanOpdracht(s, o.id));
    return vg.totaal > 0 && vg.klaar === vg.totaal && (!o.deadline || o.deadline < v);
  };
  const sorteer = (a, b) => vergelijkDatum(M.werkdagVan(s, a) || M.deadlineVan(s, a), M.werkdagVan(s, b) || M.deadlineVan(s, b));
  const opdrOpen = opdrachten.filter((o) => !afgerond(o));
  const opdrAf = opdrachten.filter(afgerond);
  const takenOpen = taken.filter((t) => !t.klaar).sort(sorteer);
  const takenAf = taken.filter((t) => t.klaar).sort((a, b) => (b.upd || 0) - (a.upd || 0));
  const tijd = totaalTijd([...taken, ...opdrachten.flatMap((o) => M.takenVanOpdracht(s, o.id))]);
  const lijsten = (opd, tk) =>
    `${opd.length ? `<ol class="lessen-lijst">${opd.map((o) => opdrachtRegel(s, o)).join('')}</ol>` : ''}${tk.length ? takenLijst(s, tk, '') : ''}`;
  const aantalAf = opdrAf.length + takenAf.length;
  return `<section class="kaart groep-kaart ${opl ? 'opl' : ''}" style="--klas:${kleur}">
    <header>
      <span class="bol"></span><h2>${titel}</h2>
      ${tijd ? `<span class="teller" title="bestede tijd">⏱ ${M.duurTekst(tijd)}</span>` : ''}
      ${kop}
    </header>
    ${opdrOpen.length || takenOpen.length ? lijsten(opdrOpen, takenOpen) : `<p class="leeg">${leeg}</p>`}
    ${aantalAf ? `<details><summary>Afgerond (${aantalAf})</summary>${lijsten(opdrAf, takenAf)}</details>` : ''}
    ${onder ? `<div class="knoppen">${onder}</div>` : ''}
  </section>`;
}

export function opdrachtRegel(s, o) {
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

// Alle blokken van een opgesplitste taak, zodat je ook een afgevinkt blok terugvindt.
export function blokkenHtml(s, t) {
  const blokken = M.blokkenVan(s, t.deelGroep).sort((a, b) => (a.deelNr || 0) - (b.deelNr || 0));
  return `<p class="hint">Blok ${t.deelNr} van ${t.deelVan}. Alle blokken:</p>${takenLijst(s, blokken, '', t.id)}`;
}

// Lijstje taken in een les- of opdrachtdialoog, met afvinken en openen.
export function takenLijst(s, taken, terugAttr, huidigId = null) {
  return taken.length ? `<ul class="les-taken">${taken.map((t) => taakRij(s, t, terugAttr, huidigId)).join('')}</ul>` : '';
}

export function taakRij(s, t, terugAttr = '', huidigId = null) {
  const w = M.waarschuwing(s, t);
  const dl = M.deadlineVan(s, t);
  const wd = M.werkdagVan(s, t);
  const info = [
    M.isLeerlingTaak(t) ? `indienen ${M.kortDatum(t.indien)}` : '',
    wd ? `${M.isLeerlingTaak(t) ? 'verbeteren' : 'gepland'}: ${M.kortDatum(wd)}${(t.hoofd || t.indien) && !t.werkdag ? ' (standaard)' : ''}` : 'in bakje',
    dl && !t.deadline?.eind && !t.lesId ? `⚑ ${M.kortDatum(dl)}` : '',
    tijdLabel(t),
  ].filter(Boolean);
  return `<li class="${w ? w.niveau : ''} ${t.klaar ? 'klaar' : ''} ${t.id === huidigId ? 'huidig' : ''}">
    <button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>
    <div class="taak-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}" ${terugAttr}>
      <span class="titel">${esc(taakTitel(s, t))}</span><span class="sub">${info.join(' · ')}${w ? ` · <span class="reden">${esc(w.reden)}</span>` : ''}</span>
    </div>
  </li>`;
}
