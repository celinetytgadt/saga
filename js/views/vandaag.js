// Saga – Vandaag, in drie kolommen (op de gsm onder elkaar):
// 1. Belangrijk: afspraken; ⚑ deadline vandaag (bovenaan, zodat je het zeker ziet);
//    daaronder een blok per klas (voorbereiding van de lessen van de volgende 2 werkdagen,
//    lopende verbeteringen, to do's met een deadline binnen een week of gepland vandaag)
//    en dan een blok per ander onderwerp (to do's met een deadline binnen een week of
//    gepland vandaag);
// 2. Magjes: wat bleef liggen en wat in het bakje zit, per klas of onderwerp;
// 3. Gedaan: wat je vandaag afvinkte.
// Een taak staat in maar één kolom: wat bij Belangrijk staat, staat niet bij de magjes.

import * as M from '../model.js';
import { esc, GRIJS, ui } from '../ui.js';
import { anker, bakje, klasLabel, klasStijl, lesVan, opdrachtStijl, snelInvoerHtml, sorteerLessen, sorteerTaken, taakTitel, tijdLabel, voortgang } from '../weergave.js';

// Kleine timerknop: starten, of pauzeren met de lopende klok erbij.
function timerKnop(t) {
  if (t.gestart) return `<button class="chip timer-chip loopt" data-actie="timer" data-id="${t.id}" aria-label="Timer pauzeren">❚❚ <span data-klok="${t.id}">${M.klokTekst(M.bestedeTijd(t))}</span></button>`;
  return `<button class="chip timer-chip" data-actie="timer" data-id="${t.id}">▶ ${M.bestedeTijd(t) ? 'Verder' : 'Start'}</button>`;
}

const vink = (t) =>
  `<button class="vink" data-actie="vink" data-id="${t.id}" aria-label="${t.klaar ? 'Markeer als niet klaar' : 'Markeer als klaar'}">${t.klaar ? '✓' : ''}</button>`;

// Afspraak uit de agenda (#s) op deze dag, met het uur als dat er is.
// Een afspraak over meerdere dagen: eerste dag vanaf het beginuur, laatste dag tot het einduur.
export function afspraakUur(a, v) {
  const eerste = a.datum === v;
  const laatste = (a.eindDatum || a.datum) === v;
  if (!a.tijd) return 'hele dag';
  if (eerste && laatste) return a.eindTijd && a.eindTijd !== a.tijd ? `${a.tijd}–${a.eindTijd}` : a.tijd;
  if (eerste) return `vanaf ${a.tijd}`;
  if (laatste && a.eindTijd) return `tot ${a.eindTijd}`;
  return 'hele dag';
}

function afspraakRij(a, v) {
  return `<div class="magje afspraak-rij"><span class="afspraak-uur">${afspraakUur(a, v)}</span>
    <span class="moetje-tekst"><span class="magje-titel">${esc(a.titel)}</span></span>
  </div>`;
}

// Voorbereiding van een les, in dezelfde opmaak als de andere rijen.
function voorbRij(s, t, les, v) {
  const wd = M.werkdagVan(s, t);
  const wanneer = !wd ? 'nog niet gepland' : wd === v ? 'gepland vandaag' : wd < v ? `bleef liggen (${M.kortDatum(wd)})` : `gepland ${M.kortDatum(wd)}`;
  const sub = [`<b>les ${M.kortDatum(les.datum)}</b>`, wanneer, tijdLabel(t)].filter(Boolean);
  return `<div class="magje" style="${klasStijl(s, les)}">${vink(t)}
    <span class="moetje-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}"><span class="magje-titel"><b>${esc(klasLabel(s, les))}</b> ${esc(les.titel)}${
      t.deelVan ? ` (${t.deelNr}/${t.deelVan})` : ''
    }</span><small>${sub.join(' · ')}</small></span>
    <span class="magje-knoppen">${timerKnop(t)}</span>
  </div>`;
}

// Een to do (of taak, stuk), met een knop om ze vandaag te doen en een timer.
// `zonderLabel`: het onderwerp staat al in de kop erboven.
function magje(s, t, v, { zonderLabel = false } = {}) {
  const a = anker(s, t);
  const dl = M.deadlineVan(s, t);
  const wd = M.werkdagVan(s, t);
  const label = zonderLabel ? a.titel && esc(a.titel) : a.label && `${esc(a.label)}${a.titel ? ` · ${esc(a.titel)}` : ''}`;
  const sub = [
    label,
    dl && !t.hoofd && (dl === v ? '<span class="vlag">⚑ vandaag</span>' : `⚑ ${M.kortDatum(dl)}`),
    wd && wd < v && `<span class="kop-oranje">bleef liggen (${M.kortDatum(wd)})</span>`,
    tijdLabel(t),
  ].filter(Boolean);
  const knop = t.klaar
    ? ''
    : `<span class="magje-knoppen">${wd !== v ? `<button class="chip" data-actie="plan-vandaag" data-id="${t.id}">Vandaag</button>` : ''}${timerKnop(t)}</span>`;
  return `<div class="magje ${M.domeinVan(t) === 'opleiding' ? 'opl' : ''} ${t.klaar ? 'klaar' : ''}" style="--klas:${a.kleur}">${vink(t)}
    <span class="moetje-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}"><span class="magje-titel">${esc(taakTitel(s, t))}</span>${
      sub.length && !t.klaar ? `<small>${sub.join(' · ')}</small>` : ''
    }</span>
    ${knop}
  </div>`;
}

// Verbeteren staat bij Belangrijk vanaf de dag na het indienen (of vroeger, als je het
// zelf vroeger plande) tot je het afvinkt: het is zelden op één dag klaar.
export function verbeterStart(s, t) {
  const vanaf = M.vanafVan(s, t);
  return [vanaf && M.plusDagen(vanaf, 1), M.werkdagVan(s, t)].filter(Boolean).sort()[0] || null;
}

function verbeterRij(s, t) {
  const a = anker(s, t);
  const ingediend = M.vanafVan(s, t);
  const dl = M.deadlineVan(s, t);
  const sub = [
    a.titel && esc(a.titel),
    ingediend && `ingediend ${M.kortDatum(ingediend)}`,
    dl && `⚑ ${M.kortDatum(dl)}`,
    tijdLabel(t),
  ].filter(Boolean);
  return `<div class="magje" style="--klas:${a.kleur}">${vink(t)}
    <span class="moetje-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}"><span class="magje-titel">${esc(taakTitel(s, t))}</span>${
      sub.length ? `<small>${sub.join(' · ')}</small>` : ''
    }</span>
    <span class="magje-knoppen">${timerKnop(t)}</span>
  </div>`;
}

// Opdracht met einddeadline vandaag (nog niet alle stukken klaar).
function opdrachtRij(s, o) {
  const st = opdrachtStijl(s, o);
  const vg = voortgang(M.takenVanOpdracht(s, o.id));
  return `<div class="magje ${st.opl ? 'opl' : ''}" style="--klas:${st.kleur}"><span class="vlag-bol">⚑</span>
    <span class="moetje-tekst" role="button" tabindex="0" data-actie="opdracht" data-id="${o.id}"><span class="magje-titel">${esc(o.titel)}</span><small>${st.naam ? esc(st.naam) + ' · ' : ''}einddeadline · ${vg.klaar}/${vg.totaal} stukken</small></span>
  </div>`;
}

// Blok waarin een taak staat: haar klas, anders haar onderwerp of opleidingsonderdeel.
const ZONDER = 'Zonder onderwerp';
function groepVan(s, t) {
  const klas = M.klassenVanTaak(s, t).map((id) => s.klassen[id]).find((k) => k && !k.del);
  if (klas) return { sleutel: 'k:' + klas.id, naam: klas.naam, kleur: klas.kleur, rang: 0 };
  const a = anker(s, t);
  if (M.domeinVan(t) === 'opleiding') return { sleutel: 'o:' + a.label, naam: a.label || 'Opleiding', kleur: a.kleur, rang: 2 };
  if (a.label) return { sleutel: 's:' + a.label, naam: a.label, kleur: a.kleur, rang: 1 };
  return { sleutel: '', naam: ZONDER, kleur: GRIJS, rang: 3 };
}

// Rijen per blok: klassen, dan onderwerpen, dan opleiding, zonder onderwerp achteraan.
function blokken(s, taken, rij) {
  const m = new Map();
  for (const t of taken) {
    const g = groepVan(s, t);
    if (!m.has(g.sleutel)) m.set(g.sleutel, { ...g, rijen: [] });
    m.get(g.sleutel).rijen.push(rij(t));
  }
  return [...m.values()]
    .sort((a, b) => a.rang - b.rang || a.naam.localeCompare(b.naam))
    .map((g) => `<h3 class="kop-blok" style="--klas:${g.kleur}">${esc(g.naam)}</h3>${g.rijen.join('')}`)
    .join('');
}

export function viewVandaag(s) {
  const v = M.vandaag();
  const week = M.plusDagen(v, 7);
  const werkdagen = M.volgendeWerkdagen(s, v, 2);
  const lessen = M.lijst(s, 'lessen')
    .filter((l) => werkdagen.includes(l.datum))
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : sorteerLessen(s)(a, b)));
  const voorb = lessen.flatMap((les) =>
    M.takenVanLes(s, les.id)
      .filter((t) => !t.klaar && !M.isVerbeteren(t) && (t.hoofd || t.deelGroep))
      .sort((a, b) => (a.deelNr || 0) - (b.deelNr || 0))
  );

  const gedaan = M.gedaanOp(s, v).sort((a, b) => (b.klaarOp || 0) - (a.klaarOp || 0));
  const open = M.lijst(s, 'taken').filter((t) => !t.klaar);
  // voorbereiding van een les: staat bij de lessen van de volgende werkdagen (of als je ze vandaag plande)
  const isVoorb = (t) => !!t.lesId && !M.isVerbeteren(t) && (t.hoofd || !!t.deelGroep);
  // taak bij een les die al gegeven is (geen verbeteren): telt niet meer
  const lesVoorbij = (t) => {
    const les = !M.isVerbeteren(t) && lesVan(s, t);
    return !!(les && les.datum && les.datum < v);
  };

  // ⚑ deadline vandaag, bovenaan
  const dlVandaag = open.filter((t) => !isVoorb(t) && !lesVoorbij(t) && M.deadlineVan(s, t) === v).sort(sorteerTaken(s));
  const eindes = M.lijst(s, 'opdrachten').filter((o) => {
    if (o.deadline !== v) return false;
    const vg = voortgang(M.takenVanOpdracht(s, o.id));
    return !vg.totaal || vg.klaar < vg.totaal;
  });
  const bovenaan = new Set(dlVandaag.map((t) => t.id));
  for (const t of voorb) bovenaan.add(t.id);
  const verbeteren = open
    .filter((t) => !bovenaan.has(t.id) && M.isVerbeteren(t) && (verbeterStart(s, t) || '9') <= v)
    .sort((a, b) => verbeterStart(s, a).localeCompare(verbeterStart(s, b)) || sorteerTaken(s)(a, b));
  for (const t of verbeteren) bovenaan.add(t.id);
  // to do's met een deadline binnen een week (of al voorbij), of gepland vandaag
  const binnenkort = open
    .filter((t) => {
      if (bovenaan.has(t.id) || M.isVerbeteren(t)) return false;
      if (M.werkdagVan(s, t) === v) return true;
      const dl = !isVoorb(t) && !lesVoorbij(t) && M.deadlineVan(s, t);
      return !!dl && dl < week;
    })
    .sort(sorteerTaken(s));
  for (const t of binnenkort) bovenaan.add(t.id);

  const rijBelangrijk = (t) => {
    const les = isVoorb(t) && lesVan(s, t);
    if (les) return voorbRij(s, t, les, v);
    return M.isVerbeteren(t) ? verbeterRij(s, t) : magje(s, t, v, { zonderLabel: true });
  };
  const belangrijkHtml = blokken(s, [...voorb, ...verbeteren, ...binnenkort], rijBelangrijk);

  const b = bakje(s, undefined, v);
  const zonder = (lijst) => lijst.filter((t) => !bovenaan.has(t.id));
  const liggen = zonder(b.liggen);
  const kiezen = zonder([...b.school, ...b.opleiding.flatMap((g) => g.taken)]);
  const magjesHtml = blokken(s, [...liggen, ...kiezen], (t) => magje(s, t, v, { zonderLabel: true }));
  const last = M.dagLast(s, v);
  // afspraken met #s (niet de #sw-werkdagen), tenzij verborgen op dit toestel; hele dag eerst, dan op uur
  const afspraken = ui.verbergAfspraken
    ? []
    : M.afsprakenOp(s, v)
        .filter((a) => !a.werk)
        .sort((a, b) => (afspraakUur(a, v) === 'hele dag' ? '' : a.tijd || '').localeCompare(afspraakUur(b, v) === 'hele dag' ? '' : b.tijd || ''));
  const rijen = (lijst) => lijst.map((t) => magje(s, t, v)).join('');

  const voorbTekst = !werkdagen.length
    ? 'Geen werkdagen in de komende 3 weken. Stel je vaste werkdagen in bij Instellingen.'
    : `Lessen voorbereiden voor ${werkdagen.map(M.kortDatum).join(' en ')}${voorb.length ? '' : lessen.length ? ': alles voorbereid 🌿' : ': geen lessen 🌿'}`;

  return `<div class="pagina vandaag-pagina">
    <div class="pagina-kop"><h1>Vandaag <small class="zacht">${M.kortDatum(v)}</small></h1>
      ${last.ms ? `<span class="last groot ${last.vol ? 'vol' : ''}" title="Geschatte tijd van wat vandaag nog gepland staat">± ${M.duurKort(last.ms)} gepland</span>` : ''}
    </div>
    ${snelInvoerHtml()}
    <div class="vandaag-kolommen">
      <section class="kaart compact belangrijk">
        <h2>Belangrijk</h2>
        ${afspraken.length ? `<h3>📅 Afspraken</h3>${afspraken.map((a) => afspraakRij(a, v)).join('')}` : ''}
        ${
          dlVandaag.length || eindes.length
            ? `<div class="deadline-vandaag"><h3 class="kop-vlag">⚑ Deadline vandaag</h3>${eindes.map((o) => opdrachtRij(s, o)).join('')}${rijen(dlVandaag)}</div>`
            : ''
        }
        <p class="hint">${voorbTekst}</p>
        ${belangrijkHtml || (dlVandaag.length || eindes.length ? '' : '<p class="leeg">Niets dringends deze week. Kies iets uit de magjes.</p>')}
      </section>

      <section class="kaart compact">
        <h2>Magjes</h2>
        ${
          liggen.length
            ? `<div class="liggen-kop"><span class="kop-oranje">${liggen.length} bleef liggen</span>
                <button class="knop klein" data-actie="herplan" data-ids="${liggen.map((t) => t.id).join(',')}">Alles herplannen</button></div>`
            : ''
        }
        ${magjesHtml || '<p class="leeg">Niets te kiezen: alles staat ingepland. 🌿</p>'}
        ${b.later ? `<p class="hint">Nog ${b.later} voor later: zie <a href="#/klassen">School</a> en <a href="#/opleiding">Opleiding</a>.</p>` : ''}
      </section>

      <section class="kaart compact gedaan-kaart">
        <h2 class="kop-groen">✓ Gedaan${gedaan.length ? ` (${gedaan.length})` : ''}</h2>
        ${gedaan.length ? rijen(gedaan) : '<p class="leeg">Nog niets afgevinkt vandaag.</p>'}
      </section>
    </div>
  </div>`;
}
