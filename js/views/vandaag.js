// Saga – Vandaag, in drie kolommen (op de gsm onder elkaar):
// 1. Belangrijk: afspraken; ⚑ deadline vandaag of morgen (of al voorbij), bovenaan zodat
//    je het zeker ziet; de weekblokken van deze week (lesvoorbereiding en verbeteren per
//    groep, met hun timer); daaronder een blok per onderwerp (to do's met een deadline
//    binnen een week of gepland vandaag);
// 2. Magjes: wat bleef liggen en wat in het bakje zit, per onderwerp;
// 3. Gedaan: wat je vandaag afvinkte, en daaronder waaraan je vandaag werkte zonder het
//    af te ronden ("aan gewerkt": timer, of de knop in het taakvenster).
// Een taak staat in maar één kolom: wat bij Belangrijk staat, staat niet bij de magjes.

import * as M from '../model.js';
import { esc, GRIJS, ui } from '../ui.js';
import { anker, bakje, opdrachtStijl, snelInvoerHtml, sorteerTaken, taakTitel, tijdLabel, voortgang } from '../weergave.js';

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
    <span class="moetje-tekst"><span class="magje-titel">${esc(a.titel)}</span>${a.agenda ? ` <small class="afspraak-agenda">${esc(a.agenda)}</small>` : ''}</span>
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
    dl && !t.hoofd && (dl === v ? '<span class="vlag">⚑ vandaag</span>' : dl === M.plusDagen(v, 1) ? '<span class="vlag">⚑ morgen</span>' : `⚑ ${M.kortDatum(dl)}`),
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

// Aan gewerkt maar nog open: rustig, zonder knoppen. Afvinken kan nog; tik opent de taak.
function gewerktRij(s, t) {
  const a = anker(s, t);
  const sub = [a.label && esc(a.label), tijdLabel(t)].filter(Boolean);
  return `<div class="magje gewerkt ${M.domeinVan(t) === 'opleiding' ? 'opl' : ''}" style="--klas:${a.kleur}">${vink(t)}
    <span class="moetje-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}"><span class="magje-titel">${esc(taakTitel(s, t))}</span><small><span class="gewerkt-label">½ aan gewerkt</span>${
      sub.length ? ' · ' + sub.join(' · ') : ''
    }</small></span>
  </div>`;
}

// Opdracht met einddeadline vandaag of morgen (nog niet alle stukken klaar).
function opdrachtRij(s, o, v) {
  const st = opdrachtStijl(s, o);
  const vg = voortgang(M.takenVanOpdracht(s, o.id));
  return `<div class="magje ${st.opl ? 'opl' : ''}" style="--klas:${st.kleur}"><span class="vlag-bol">⚑</span>
    <span class="moetje-tekst" role="button" tabindex="0" data-actie="opdracht" data-id="${o.id}"><span class="magje-titel">${esc(o.titel)}</span><small>${st.naam ? esc(st.naam) + ' · ' : ''}einddeadline ${o.deadline === v ? 'vandaag' : 'morgen'} · ${vg.klaar}/${vg.totaal} stukken</small></span>
  </div>`;
}

// Blok waarin een taak staat: haar onderwerp of opleidingsonderdeel.
const ZONDER = 'Zonder onderwerp';
function groepVan(s, t) {
  const a = anker(s, t);
  if (M.domeinVan(t) === 'opleiding') return { sleutel: 'o:' + a.label, naam: a.label || 'Opleiding', kleur: a.kleur, rang: 2 };
  if (a.label) return { sleutel: 's:' + a.label, naam: a.label, kleur: a.kleur, rang: 1 };
  return { sleutel: '', naam: ZONDER, kleur: GRIJS, rang: 3 };
}

// Rijen per blok: onderwerpen, dan opleiding, zonder onderwerp achteraan.
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

// De weekblokken van deze week: per soort (lesvoorbereiding, verbeteren) een rij per
// groep, met de tijd van deze en vorige week en een timer. Afvinken = klaar voor deze week.
function weekblokken(s, v) {
  const groepen = M.weekgroepen(s);
  if (!groepen.length) return '';
  const vorige = M.plusDagen(v, -7);
  const soorten = M.WEEKSOORTEN.map((w) => {
    const rijen = groepen
      .map((g) => {
        const t = M.weekblok(s, g.id, w.sleutel, v);
        if (!t) return '';
        const vw = M.weekblok(s, g.id, w.sleutel, vorige);
        const sub = [
          t.gestart || t.tijd ? `${tijdLabel(t)} deze week` : 'nog niets deze week',
          vw && M.bestedeTijd(vw) ? `vorige week ${M.duurTekst(M.bestedeTijd(vw))}` : '',
        ].filter(Boolean);
        return `<div class="magje weekblok ${t.klaar ? 'klaar' : ''}" style="--klas:${g.kleur}">${vink(t)}
          <span class="moetje-tekst" role="button" tabindex="0" data-actie="taak" data-id="${t.id}"><span class="magje-titel">${esc(g.naam)}</span><small>${sub.join(' · ')}</small></span>
          <span class="magje-knoppen">${timerKnop(t)}</span>
        </div>`;
      })
      .join('');
    const totaal = groepen.reduce((n, g) => n + M.bestedeTijd(M.weekblok(s, g.id, w.sleutel, v) || {}), 0);
    return `<h3 class="kop-week">${w.label}${totaal ? ` <small>⏱ ${M.duurTekst(totaal)}</small>` : ''}</h3>${rijen}`;
  }).join('');
  return `<div class="deze-week">${soorten}<p class="hint">Elke maandag nieuwe blokjes; die van vorige week sluiten vanzelf af. Verloop per week: zie <a href="#/tijd">Tijd</a>.</p></div>`;
}

export function viewVandaag(s) {
  const v = M.vandaag();
  const morgen = M.plusDagen(v, 1);
  const week = M.plusDagen(v, 7);

  const gedaan = M.gedaanOp(s, v).sort((a, b) => (b.klaarOp || 0) - (a.klaarOp || 0));
  const gewerkt = M.gewerktOp(s, v).sort(sorteerTaken(s));
  // weekblokken staan apart; vroeger werk bij een les staat niet meer op de planning
  const open = M.lijst(s, 'taken').filter((t) => !t.klaar && !M.isWeekblok(t) && !M.isLesWerk(t));

  // ⚑ dringend, bovenaan in het rode vlak: deadline vandaag of morgen (of al voorbij)
  const dringend = open
    .filter((t) => {
      const dl = M.deadlineVan(s, t);
      return !!dl && dl <= morgen;
    })
    .sort((a, b) => M.deadlineVan(s, a).localeCompare(M.deadlineVan(s, b)) || sorteerTaken(s)(a, b));
  const eindes = M.lijst(s, 'opdrachten')
    .filter((o) => {
      if (!o.deadline || o.deadline < v || o.deadline > morgen) return false;
      const vg = voortgang(M.takenVanOpdracht(s, o.id));
      return !vg.totaal || vg.klaar < vg.totaal;
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const bovenaan = new Set(dringend.map((t) => t.id));
  // to do's met een deadline binnen een week, of gepland vandaag
  const binnenkort = open
    .filter((t) => {
      if (bovenaan.has(t.id)) return false;
      if (M.werkdagVan(s, t) === v) return true;
      const dl = M.deadlineVan(s, t);
      return !!dl && dl < week;
    })
    .sort(sorteerTaken(s));
  for (const t of binnenkort) bovenaan.add(t.id);
  const belangrijkHtml = blokken(s, binnenkort, (t) => magje(s, t, v, { zonderLabel: true }));

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
          dringend.length || eindes.length
            ? `<div class="deadline-vandaag"><h3 class="kop-vlag">⚑ Deadline vandaag of morgen</h3>${eindes.map((o) => opdrachtRij(s, o, v)).join('')}${dringend.map((t) => magje(s, t, v)).join('')}</div>`
            : ''
        }
        ${weekblokken(s, v)}
        ${belangrijkHtml}
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
        <h2 class="kop-groen">✓ Gedaan${gedaan.length + gewerkt.length ? ` (${gedaan.length + gewerkt.length})` : ''}</h2>
        ${rijen(gedaan)}
        ${gewerkt.length ? `<h3 class="kop-gewerkt">½ Aan gewerkt, nog niet af (${gewerkt.length})</h3>${gewerkt.map((t) => gewerktRij(s, t)).join('')}` : ''}
        ${
          gedaan.length + gewerkt.length
            ? ''
            : '<p class="leeg">Nog niets gedaan vandaag.</p><p class="hint">Werk je aan iets zonder het af te ronden? Start de timer, of tik in de taak op <b>½ Vandaag aan gewerkt</b>.</p>'
        }
      </section>
    </div>
  </div>`;
}
