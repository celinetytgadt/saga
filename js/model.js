// Saga – datamodel en rekenregels (zonder DOM, zodat het te testen is).
//
// Datums zijn overal strings 'JJJJ-MM-DD' in lokale tijd.
// Elk object heeft een `upd` (tijdstempel van laatste wijziging) zodat twee
// toestellen hun gegevens kunnen samenvoegen. Verwijderen = `del: true`.

export const COLLECTIES = ['klassen', 'lessen', 'taken', 'sjablonen', 'dagen', 'vakken', 'opdrachten', 'afspraken', 'onderwerpen'];

export const DAGNAMEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
export const MAANDNAMEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const MAANDNAMEN_LANG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export const KLASKLEUREN = ['#123b78', '#5bbba4', '#2f8fcf', '#6f9a3a', '#8a5bb5', '#e0962a', '#3d7f86', '#5a6f9e', '#ef4f4e', '#c2577f', '#e27aa5'];
// Opleiding: warme tinten. School mag dezelfde kleuren gebruiken; het onderscheid zit in de stippelrand en 🎓.
export const VAKKLEUREN = ['#ef4f4e', '#c2577f', '#e0762a', '#a84c9e', '#d4504f', '#b8664a', '#e8b400', '#f2c94c', '#c99a1a'];

// Mogelijke deadlines van een taak bij een les.
export const DEADLINE_KEUZES = [
  { sleutel: 'rel:0', label: 'ochtend van de les', deadline: { rel: 0 } },
  { sleutel: 'rel:-1', label: 'dag vóór de les', deadline: { rel: -1 } },
  { sleutel: 'rel:-1w', label: 'dag vóór de les, niet op een werkdag', deadline: { rel: -1, nietOpWerkdag: true } },
  { sleutel: 'rel:-2', label: '2 dagen vóór de les', deadline: { rel: -2 } },
  { sleutel: 'rel:-7', label: '1 week vóór de les', deadline: { rel: -7 } },
];

// Deadline van een stuk van een opleidingsopdracht.
export const EIND_KEUZE = { sleutel: 'eind', label: 'einddeadline van de opdracht', deadline: { eind: true } };

// ---------- datums ----------

const pad = (n) => String(n).padStart(2, '0');

export function isoDatum(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDatum(s) {
  const [j, m, d] = s.split('-').map(Number);
  return new Date(j, m - 1, d);
}

export function vandaag() {
  return isoDatum(new Date());
}

export function plusDagen(s, n) {
  const d = parseDatum(s);
  d.setDate(d.getDate() + n);
  return isoDatum(d);
}

export function weekdag(s) {
  return parseDatum(s).getDay(); // 0 = zondag
}

export function verschilDagen(van, tot) {
  return Math.round((parseDatum(tot) - parseDatum(van)) / 86400000);
}

export function maandagVan(s) {
  return plusDagen(s, -((weekdag(s) + 6) % 7));
}

// Eerste dag van de maand van `s`, verschoven met `offset` maanden.
export function eersteVanMaand(s, offset = 0) {
  const d = parseDatum(s);
  return isoDatum(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}

export function laatsteVanMaand(eerste) {
  const d = parseDatum(eerste);
  return isoDatum(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

// Dagen van een maandkalender: van de maandag van de week van de 1e
// tot de zondag van de week van de laatste dag.
export function maandRaster(eerste) {
  const van = maandagVan(eerste);
  const tot = plusDagen(maandagVan(laatsteVanMaand(eerste)), 6);
  const dagen = [];
  for (let d = van; d <= tot; d = plusDagen(d, 1)) dagen.push(d);
  return dagen;
}

export function maandNaam(eerste) {
  const d = parseDatum(eerste);
  return `${MAANDNAMEN_LANG[d.getMonth()]} ${d.getFullYear()}`;
}

export function kortDatum(s) {
  const d = parseDatum(s);
  return `${DAGNAMEN[d.getDay()]} ${d.getDate()} ${MAANDNAMEN[d.getMonth()]}`;
}

// ---------- state ----------

export function nieuwId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function standaardSjablonen() {
  const sj = [
    { id: 'sj-voorb', titel: 'Lesvoorbereiding', deadline: { rel: -1, nietOpWerkdag: true } },
    { id: 'sj-cr', titel: 'CR-taak klaarzetten', deadline: { rel: -1 } },
    { id: 'sj-prints', titel: 'Prints', deadline: { rel: 0 } },
  ];
  return Object.fromEntries(sj.map((s, i) => [s.id, { ...s, aan: true, volg: i, upd: 0 }]));
}

export function leegeState() {
  return {
    klassen: {},
    lessen: {},
    taken: {},
    sjablonen: standaardSjablonen(),
    dagen: {},
    vakken: {},
    opdrachten: {},
    onderwerpen: {}, // groepeert losse schooltaken (bv. Stage, Vergaderingen)
    afspraken: {}, // komt uit Google Agenda (alleen-lezen, geschreven door het script)
    instellingen: { werkdagen: [2, 5], toonKlaar: false, upd: 0 },
  };
}

// Samenvoegen van twee versies: per object wint de recentste `upd`.
// Bij gelijke `upd` blijft de versie uit `a`. Elke sleutel behalve
// `instellingen` is een collectie, zodat nieuwe collecties vanzelf meegaan.
// (Dezelfde functie staat ook in apps-script/Code.gs.)
const isCollectie = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

export function merge(a, b) {
  a = a || {};
  b = b || {};
  const r = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'instellingen') continue;
    if (!isCollectie(a[k]) && !isCollectie(b[k])) {
      r[k] = a[k] !== undefined ? a[k] : b[k];
      continue;
    }
    r[k] = { ...(a[k] || {}) };
    for (const [id, v] of Object.entries(b[k] || {})) {
      const o = r[k][id];
      if (!o || (v.upd || 0) > (o.upd || 0)) r[k][id] = v;
    }
  }
  const ia = a.instellingen;
  const ib = b.instellingen;
  r.instellingen = !ia || (ib && (ib.upd || 0) > (ia.upd || 0)) ? ib : ia;
  return r;
}

export function zet(state, collectie, obj) {
  obj.upd = Date.now();
  state[collectie][obj.id] = obj;
  return obj;
}

export function wis(state, collectie, id) {
  state[collectie][id] = { id, del: true, upd: Date.now() };
}

export function lijst(state, collectie) {
  return Object.values(state[collectie] || {}).filter((o) => !o.del);
}

// ---------- werkdagen ----------

// Volgorde: manuele aanduiding > afspraak met #sw > vaste werkdagen.
export function isWerkdag(state, datum) {
  const m = state.dagen[datum];
  if (m && !m.del && typeof m.werkdag === 'boolean') return m.werkdag;
  if (afsprakenOp(state, datum).some((a) => a.werk)) return true;
  return state.instellingen.werkdagen.includes(weekdag(datum));
}

// ---------- agenda ----------

export function afsprakenOp(state, datum) {
  return lijst(state, 'afspraken')
    .filter((a) => a.datum <= datum && datum <= (a.eindDatum || a.datum))
    .sort((a, b) => (a.tijd || '') < (b.tijd || '') ? -1 : 1);
}

// ---------- deadlines ----------

function berekenRelatief(state, taak, spec) {
  if (!spec) return null;
  if (spec.datum) return spec.datum;
  if (spec.eind) {
    const opd = taak.opdrachtId && state.opdrachten[taak.opdrachtId];
    return opd && !opd.del ? opd.deadline || null : null;
  }
  if (typeof spec.rel !== 'number') return null;
  const les = taak.lesId && state.lessen[taak.lesId];
  if (!les || les.del || !les.datum) return null;
  let d = plusDagen(les.datum, spec.rel);
  if (spec.nietOpWerkdag) {
    for (let i = 0; i < 14 && isWerkdag(state, d); i++) d = plusDagen(d, -1);
  }
  return d;
}

export function deadlineVan(state, taak) {
  return berekenRelatief(state, taak, taak.deadline);
}

export function vanafVan(state, taak) {
  return berekenRelatief(state, taak, taak.vanaf);
}

export function deadlineSleutel(deadline) {
  if (!deadline) return 'geen';
  if (deadline.datum) return 'datum';
  if (deadline.eind) return 'eind';
  const k = DEADLINE_KEUZES.find(
    (k) => k.deadline.rel === deadline.rel && !!k.deadline.nietOpWerkdag === !!deadline.nietOpWerkdag
  );
  return k ? k.sleutel : 'rel:' + deadline.rel;
}

export function deadlineUitSleutel(sleutel, datum) {
  if (sleutel === 'datum') return datum ? { datum } : null;
  if (sleutel === 'eind') return { eind: true };
  const k = DEADLINE_KEUZES.find((k) => k.sleutel === sleutel);
  return k ? { ...k.deadline } : null;
}

export function deadlineLabel(deadline) {
  const k = [...DEADLINE_KEUZES, EIND_KEUZE].find((k) => k.sleutel === deadlineSleutel(deadline));
  return k ? k.label : '';
}

// Dag waarop een taak in de kalender staat. De taak van een les staat standaard
// op haar deadline (dag vóór de les, niet op een werkdag) tot je ze zelf verplaatst.
// Die standaarddag wordt vastgelegd (zie zorgHoofdtaken), zodat de taak niet vanzelf
// verschuift als er later een werkdag bijkomt; enkel een verplaatste les zet ze opnieuw.
export function werkdagVan(state, taak) {
  if (taak.werkdag) return taak.werkdag;
  return taak.hoofd ? standaardWerkdag(state, taak) : null;
}

export function standaardWerkdag(state, taak) {
  return deadlineVan(state, { ...taak, deadline: taak.deadline || HOOFD_DEADLINE });
}

// Werkdag van een taak zetten. Bij de taak van een les: een datum = zelf verplaatst;
// leeg = terug naar de standaarddag (vóór de les).
export function zetWerkdag(state, taakId, datum) {
  const t = state.taken[taakId];
  if (!t || t.del) return;
  if (t.hoofd) {
    zet(state, 'taken', datum ? { ...t, werkdag: datum, manueel: true } : { ...t, werkdag: standaardWerkdag(state, t), manueel: false });
  } else {
    zet(state, 'taken', { ...t, werkdag: datum || null });
  }
}

// Les naar een andere dag (of zonder datum). De taak van de les verhuist mee,
// tenzij je ze zelf al naar een andere dag verplaatst had.
export function verplaatsLes(state, lesId, datum) {
  const les = state.lessen[lesId];
  if (!les || les.del) return;
  zet(state, 'lessen', { ...les, datum: datum || null });
  const h = state.taken[hoofdId(lesId)];
  if (h && !h.del && !h.manueel) zet(state, 'taken', { ...h, werkdag: datum ? standaardWerkdag(state, h) : null });
}

// Waarschuwing voor een taak: { niveau: 'rood' | 'oranje', reden } of null.
export function waarschuwing(state, taak, vandaagDatum = vandaag()) {
  if (taak.klaar) return null;
  const dl = deadlineVan(state, taak);
  const va = vanafVan(state, taak);
  const wd = werkdagVan(state, taak);
  if (wd && dl && wd > dl) return { niveau: 'rood', reden: 'gepland ná de deadline' };
  if (wd && va && wd < va) return { niveau: 'rood', reden: `kan pas vanaf ${kortDatum(va)}` };
  if (dl && dl < vandaagDatum) return { niveau: 'rood', reden: 'deadline voorbij' };
  if (wd && wd < vandaagDatum) return { niveau: 'oranje', reden: 'blijven liggen' };
  if (!wd && dl && verschilDagen(vandaagDatum, dl) <= 3) return { niveau: 'oranje', reden: 'nog niet ingepland' };
  return null;
}

// Een opdracht met stukken hoort bij de opleiding, of bij school (`domein: 'school'`,
// gegroepeerd per onderwerp). Stukken dragen het domein van hun opdracht mee.
export function opdrachtDomein(opd) {
  return opd?.domein === 'school' ? 'school' : 'opleiding';
}

export function domeinVan(taak) {
  if (taak.opdrachtId) return taak.domein === 'school' ? 'school' : 'opleiding';
  if (taak.lesId) return 'school';
  return taak.domein || 'school';
}

// ---------- lessen ----------

// Een les kan bij meerdere klassen horen (bv. BKH3-K2 en BKH3-K3 samen).
// Oudere lessen hebben nog één `klasId`.
export function klassenVanLes(les) {
  if (les.klasIds && les.klasIds.length) return les.klasIds;
  return les.klasId ? [les.klasId] : [];
}

// "BKH3-K2" + "BKH3-K3" → "BKH3-K2 + K3"
export function groepNaam(namen) {
  if (namen.length < 2) return namen[0] || '';
  let p = namen[0];
  for (const n of namen) while (!n.startsWith(p)) p = p.slice(0, -1);
  const knip = Math.max(p.lastIndexOf('-'), p.lastIndexOf(' '));
  if (knip <= 0) return namen.join(' + ');
  return namen[0] + namen.slice(1).map((n) => ' + ' + n.slice(knip + 1)).join('');
}

export function lessenVanKlas(state, klasId) {
  return lijst(state, 'lessen')
    .filter((l) => klassenVanLes(l).includes(klasId))
    .sort((a, b) => {
      if (a.datum && b.datum && a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
      if (!!a.datum !== !!b.datum) return a.datum ? -1 : 1;
      return (a.volg || 0) - (b.volg || 0);
    });
}

export function volgendeVolg(state, klasId) {
  return Math.max(0, ...lessenVanKlas(state, klasId).map((l) => l.volg || 0)) + 1;
}

// Voorstel voor de verbeterdeadline: de eerste les van die klas(sen) na het indienen.
// Is er (nog) geen, dan de eerstvolgende lesdag volgens het lesrooster, anders +7 dagen.
export function volgendeLesNa(state, klasIds, datum) {
  klasIds = [].concat(klasIds);
  const kandidaten = klasIds
    .flatMap((k) => lessenVanKlas(state, k))
    .filter((l) => l.datum && l.datum > datum)
    .map((l) => l.datum)
    .sort();
  if (kandidaten.length) return kandidaten[0];
  const rooster = klasIds.flatMap((k) => state.klassen[k]?.rooster || []);
  for (let i = 1; i <= 7; i++) {
    const d = plusDagen(datum, i);
    if (rooster.includes(weekdag(d))) return d;
  }
  return plusDagen(datum, 7);
}

export function takenVanLes(state, lesId) {
  return lijst(state, 'taken').filter((t) => t.lesId === lesId);
}

// Haalt een klas uit alle lessen; lessen zonder klas verdwijnen (met hun taken).
export function verwijderKlas(state, klasId) {
  for (const l of lessenVanKlas(state, klasId)) {
    const rest = klassenVanLes(l).filter((k) => k !== klasId);
    if (rest.length) zet(state, 'lessen', { ...l, klasId: undefined, klasIds: rest });
    else verwijderLes(state, l.id);
  }
  wis(state, 'klassen', klasId);
}

// ---------- één taak per les ----------

export const HOOFD_DEADLINE = { rel: -1, nietOpWerkdag: true };
// Taken die vroeger automatisch bij elke les kwamen; ze gaan op in de ene lestaak.
// Ook de namen die je zelf aan die standaardtaken gaf (bv. "LVB") tellen mee.
const OUDE_STANDAARDTAKEN = ['lesvoorbereiding', 'lvb', 'cr-taak klaarzetten', 'prints'];

export const hoofdId = (lesId) => 'h-' + lesId;

function oudeStandaardTitels(state) {
  const titels = new Set(OUDE_STANDAARDTAKEN);
  for (const sj of Object.values(state.sjablonen || {})) if (sj.titel) titels.add(sj.titel.trim().toLowerCase());
  return titels;
}

function oudeTakenVanLes(state, lesId, titels) {
  return takenVanLes(state, lesId).filter(
    (t) => !t.hoofd && !t.deelGroep && titels.has((t.titel || '').trim().toLowerCase())
  );
}

// Is er nog opruimwerk: een les zonder taak, of oude standaardtaken naast de lestaak?
export function heeftOpruimwerk(state) {
  const titels = oudeStandaardTitels(state);
  if (groepenMetVerschillendeDeadline(state).length) return true;
  if (lijst(state, 'taken').some((t) => t.deelGroep && !t.lesId && !t.opdrachtId)) return true;
  return lijst(state, 'lessen').some((les) => {
    const h = state.taken[hoofdId(les.id)];
    if (!h) return true;
    if (h.del) return false;
    return oudeTakenVanLes(state, les.id, titels).length > 0 || (!h.werkdag && !!les.datum);
  });
}

// Zorgt dat elke les precies één (hoofd)taak heeft. Het id is vast ('h-' + les-id),
// zodat twee toestellen dezelfde taak maken. Oude standaardtaken van de les gaan erin op:
// hun werkdag (bij voorkeur die van de lesvoorbereiding) en "klaar" worden overgenomen.
// Geeft true als er iets veranderde.
export function zorgHoofdtaken(state) {
  const titels = oudeStandaardTitels(state);
  let veranderd = false;
  for (const les of lijst(state, 'lessen')) {
    const id = hoofdId(les.id);
    const h = state.taken[id];
    if (h && h.del) continue; // bewust verwijderd
    const oude = oudeTakenVanLes(state, les.id, titels);
    if (h && !oude.length && (h.werkdag || !les.datum)) continue;
    const voorkeur = (t) => ['lesvoorbereiding', 'lvb'].includes(t.titel.trim().toLowerCase());
    const metDag = oude.filter((t) => t.werkdag).sort((a, b) => voorkeur(b) - voorkeur(a))[0];
    const basis = h || {
      id,
      titel: '',
      lesId: les.id,
      hoofd: true,
      werkdag: null,
      deadline: { ...HOOFD_DEADLINE },
      vanaf: null,
      klaar: false,
      notitie: '',
    };
    // een zelf gekozen dag (van de lestaak of van een oude lesvoorbereiding) gaat voor op de standaarddag
    const werkdag = (basis.manueel && basis.werkdag) || metDag?.werkdag || basis.werkdag || null;
    const nieuw = {
      ...basis,
      werkdag,
      manueel: !!(basis.manueel || metDag),
      klaar: h ? h.klaar || (oude.length > 0 && oude.every((t) => t.klaar)) : oude.length > 0 && oude.every((t) => t.klaar),
    };
    // standaarddag vastleggen, zodat ze niet meer vanzelf verschuift
    if (!nieuw.werkdag && les.datum) nieuw.werkdag = standaardWerkdag(state, nieuw);
    zet(state, 'taken', nieuw);
    for (const t of oude) wis(state, 'taken', t.id);
    veranderd = true;
  }
  return veranderd;
}

// ---------- opgesplitste taken ----------

const zelfdeDeadline = (a, b) => JSON.stringify(a.deadline || null) === JSON.stringify(b.deadline || null);

export function blokkenVan(state, deelGroep) {
  return lijst(state, 'taken').filter((t) => t.deelGroep === deelGroep);
}

// De blokken van één opgesplitste taak delen één deadline. Na een wijziging
// aan één blok krijgen de andere blokken dezelfde deadline.
export function deelDeadline(state, taakId) {
  const t = state.taken[taakId];
  if (!t || t.del || !t.deelGroep) return;
  for (const b of blokkenVan(state, t.deelGroep)) {
    if (b.id !== t.id && !zelfdeDeadline(b, t)) zet(state, 'taken', { ...b, deadline: t.deadline ? { ...t.deadline } : null });
  }
}

// Ook het onderwerp (en domein) van een losse taak geldt voor alle blokken.
export function deelOnderwerp(state, taakId) {
  const t = state.taken[taakId];
  if (!t || t.del || !t.deelGroep) return;
  for (const b of blokkenVan(state, t.deelGroep)) {
    if (b.id !== t.id && ((b.onderwerpId || null) !== (t.onderwerpId || null) || b.domein !== t.domein))
      zet(state, 'taken', { ...b, onderwerpId: t.onderwerpId || null, domein: t.domein });
  }
}

// Opgesplitste taken waarvan de blokken (nog) verschillende deadlines hebben:
// de laatst gewijzigde deadline geldt voor alle blokken.
function groepenMetVerschillendeDeadline(state) {
  const groepen = {};
  for (const t of lijst(state, 'taken')) if (t.deelGroep) (groepen[t.deelGroep] ||= []).push(t);
  return Object.values(groepen).filter((g) => g.some((t) => !zelfdeDeadline(t, g[0])));
}

export function herstelDeelDeadlines(state) {
  const groepen = groepenMetVerschillendeDeadline(state);
  for (const g of groepen) deelDeadline(state, g.sort((a, b) => (b.upd || 0) - (a.upd || 0))[0].id);
  return groepen.length > 0;
}

// Een te grote taak opdelen in `aantal` blokken. Het origineel wordt blok 1,
// de andere blokken komen in het bakje (of bij een les zonder werkdag) om te verslepen.
export function splitsTaak(state, taakId, aantal) {
  const t = state.taken[taakId];
  if (!t || t.del || t.deelVan || aantal < 2) return [];
  const groep = t.id;
  zet(state, 'taken', { ...t, deelGroep: groep, deelNr: 1, deelVan: aantal });
  const nieuw = [];
  for (let i = 2; i <= aantal; i++) {
    nieuw.push(
      zet(state, 'taken', {
        ...t,
        id: nieuwId(),
        hoofd: false,
        titel: t.titel || (t.lesId && state.lessen[t.lesId]?.titel) || '',
        werkdag: null,
        klaar: false,
        tijd: 0,
        gestart: null,
        deelGroep: groep,
        deelNr: i,
        deelVan: aantal,
      })
    );
  }
  return nieuw;
}

// ---------- losse taken en onderwerpen ----------

// Taken die niet bij een les of opdracht horen, per domein (school of opleiding).
export function losseTaken(state, domein) {
  return lijst(state, 'taken').filter((t) => !t.lesId && !t.opdrachtId && domeinVan(t) === domein);
}

export function onderwerpVan(state, taak) {
  const o = taak.onderwerpId && state.onderwerpen?.[taak.onderwerpId];
  return o && !o.del && !taak.lesId && !taak.opdrachtId ? o : null;
}

// Losse schooltaken van een onderwerp; `null` = zonder (of met een verwijderd) onderwerp.
export function takenVanOnderwerp(state, onderwerpId) {
  return losseTaken(state, 'school').filter((t) => (onderwerpVan(state, t)?.id || null) === (onderwerpId || null));
}

// Schoolopdrachten (met stukken) van een onderwerp; `null` = zonder onderwerp.
export function opdrachtenVanOnderwerp(state, onderwerpId) {
  return lijst(state, 'opdrachten')
    .filter((o) => opdrachtDomein(o) === 'school')
    .filter((o) => {
      const ond = o.onderwerpId && state.onderwerpen?.[o.onderwerpId];
      return ((ond && !ond.del ? ond.id : null) || null) === (onderwerpId || null);
    })
    .sort(volgordeOpdracht);
}

// Een onderwerp verwijderen: de taken en opdrachten blijven, maar zonder onderwerp.
export function verwijderOnderwerp(state, onderwerpId) {
  for (const t of takenVanOnderwerp(state, onderwerpId)) zet(state, 'taken', { ...t, onderwerpId: null });
  for (const o of opdrachtenVanOnderwerp(state, onderwerpId)) zet(state, 'opdrachten', { ...o, onderwerpId: null });
  wis(state, 'onderwerpen', onderwerpId);
}

// Een losse taak opdelen in stukken: ze wordt een opdracht (zelfde naam, onderwerp en
// deadline) met de taak zelf als eerste stuk. Werkdag en bestede tijd blijven bij dat stuk.
export function maakOpdrachtVanTaak(state, taakId) {
  const t = state.taken[taakId];
  if (!t || t.del || t.lesId || t.opdrachtId) return null;
  const domein = domeinVan(t);
  const opd = zet(state, 'opdrachten', {
    id: nieuwId(),
    titel: t.titel,
    domein,
    vakId: null,
    onderwerpId: domein === 'school' ? onderwerpVan(state, t)?.id || null : null,
    deadline: deadlineVan(state, t),
    volg: volgendeOpdrachtVolg(state),
  });
  zet(state, 'taken', { ...t, opdrachtId: opd.id, onderwerpId: null, domein, deadline: { eind: true }, volg: 1 });
  return opd;
}

// Losse taken die vroeger in blokken opgesplitst werden, worden een opdracht met
// stukken ("Deel 1", "Deel 2", …). Het id is vast, zodat twee toestellen hetzelfde doen.
export function losseBlokkenNaarStukken(state) {
  const groepen = {};
  for (const t of lijst(state, 'taken')) if (t.deelGroep && !t.lesId && !t.opdrachtId) (groepen[t.deelGroep] ||= []).push(t);
  for (const [groep, blokken] of Object.entries(groepen)) {
    blokken.sort((a, b) => (a.deelNr || 0) - (b.deelNr || 0));
    const eerste = blokken[0];
    const domein = domeinVan(eerste);
    const id = 'g-' + groep;
    const bestaand = state.opdrachten[id];
    const opd =
      bestaand && !bestaand.del
        ? bestaand
        : zet(state, 'opdrachten', {
            id,
            titel: eerste.titel || '(zonder titel)',
            domein,
            vakId: null,
            onderwerpId: domein === 'school' ? onderwerpVan(state, eerste)?.id || null : null,
            deadline: deadlineVan(state, eerste),
            volg: volgendeOpdrachtVolg(state),
          });
    blokken.forEach((b, i) => {
      const { deelGroep, deelNr, deelVan, ...rest } = b;
      zet(state, 'taken', { ...rest, titel: `Deel ${deelNr || i + 1}`, opdrachtId: opd.id, onderwerpId: null, domein, deadline: { eind: true }, volg: deelNr || i + 1 });
    });
  }
  return Object.keys(groepen).length > 0;
}

// ---------- tijd bijhouden ----------

// Een taak houdt bij hoeveel tijd er al aan besteed is: `tijd` (ms van afgesloten
// periodes) en `gestart` (tijdstempel als de timer nu loopt, anders null).
// Pauzeren telt de lopende periode bij `tijd`; later verder doen telt verder op.
export function bestedeTijd(taak, nu = Date.now()) {
  return (taak.tijd || 0) + (taak.gestart ? Math.max(0, nu - taak.gestart) : 0);
}

export function lopendeTaak(state) {
  return lijst(state, 'taken').find((t) => t.gestart) || null;
}

// Er loopt maar één timer tegelijk: een andere taak starten pauzeert de lopende.
export function startTimer(state, taakId, nu = Date.now()) {
  const t = state.taken[taakId];
  if (!t || t.del || t.gestart) return;
  for (const andere of lijst(state, 'taken')) if (andere.gestart) stopTimer(state, andere.id, nu);
  zet(state, 'taken', { ...t, gestart: nu });
}

export function stopTimer(state, taakId, nu = Date.now()) {
  const t = state.taken[taakId];
  if (!t || t.del || !t.gestart) return;
  zet(state, 'taken', { ...t, tijd: bestedeTijd(t, nu), gestart: null });
}

// Bestede tijd zelf aanpassen (bv. timer vergeten stoppen). Een lopende timer loopt verder.
export function zetTijd(state, taakId, ms, nu = Date.now()) {
  const t = state.taken[taakId];
  if (!t || t.del) return;
  zet(state, 'taken', { ...t, tijd: Math.max(0, Math.round(ms)), gestart: t.gestart ? nu : null });
}

// Afvinken stopt de timer; terug openzetten laat de bestede tijd staan.
export function zetKlaar(state, taakId, klaar, nu = Date.now()) {
  if (klaar) stopTimer(state, taakId, nu);
  const t = state.taken[taakId];
  if (t && !t.del) zet(state, 'taken', { ...t, klaar });
}

// 1:05:09 of 4:09 (voor een lopende klok)
export function klokTekst(ms) {
  const sec = Math.floor(ms / 1000);
  const u = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return u ? `${u}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// 1u 05m, 25 min, < 1 min (voor een totaal)
export function duurTekst(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}u ${pad(min % 60)}m`;
}

// Ingegeven tijd lezen: "45" (minuten), "1:30" of "1u30" (uren en minuten). Ongeldig = null.
export function leesMinuten(tekst) {
  const s = String(tekst ?? '').trim().toLowerCase().replace(',', '.');
  let m = s.match(/^(\d+)\s*(?::|u)\s*(\d{0,2})\s*m?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:min|m)?$/);
  return m ? Number(m[1]) : null;
}

export function verwijderLes(state, lesId) {
  for (const t of takenVanLes(state, lesId)) wis(state, 'taken', t.id);
  wis(state, 'lessen', lesId);
}

// ---------- opleiding ----------

export function takenVanOpdracht(state, opdrachtId) {
  return lijst(state, 'taken')
    .filter((t) => t.opdrachtId === opdrachtId)
    .sort((a, b) => (a.volg || 0) - (b.volg || 0));
}

// Opdrachten in de volgorde waarin ze ingegeven zijn (`volg`, anders het id, dat met de tijd begint).
export function volgordeOpdracht(a, b) {
  return (a.volg || 0) - (b.volg || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function opdrachtenVanVak(state, vakId) {
  return lijst(state, 'opdrachten')
    .filter((o) => opdrachtDomein(o) === 'opleiding' && (o.vakId || null) === (vakId || null))
    .sort(volgordeOpdracht);
}

export function volgendeOpdrachtVolg(state) {
  return Math.max(0, ...lijst(state, 'opdrachten').map((o) => o.volg || 0)) + 1;
}

export function volgendStuk(state, opdrachtId) {
  return Math.max(0, ...takenVanOpdracht(state, opdrachtId).map((t) => t.volg || 0)) + 1;
}

export function maakStukken(state, opdrachtId, titels) {
  let volg = volgendStuk(state, opdrachtId);
  const domein = opdrachtDomein(state.opdrachten[opdrachtId]);
  return titels.map((titel) =>
    zet(state, 'taken', {
      id: nieuwId(),
      titel,
      opdrachtId,
      domein,
      werkdag: null,
      deadline: { eind: true },
      vanaf: null,
      klaar: false,
      notitie: '',
      volg: volg++,
    })
  );
}

export function verwijderOpdracht(state, opdrachtId) {
  for (const t of takenVanOpdracht(state, opdrachtId)) wis(state, 'taken', t.id);
  wis(state, 'opdrachten', opdrachtId);
}

export function verwijderVak(state, vakId) {
  for (const o of opdrachtenVanVak(state, vakId)) verwijderOpdracht(state, o.id);
  wis(state, 'vakken', vakId);
}

// Kiest `aantal` dagen tussen `van` en `tot` (inbegrepen), gelijkmatig gespreid
// over dagen die geen werkdag zijn, met de vroegste dag eerst.
export function verdeelDagen(state, aantal, van, tot) {
  if (!aantal || tot < van) return [];
  let dagen = [];
  for (let d = van; d <= tot; d = plusDagen(d, 1)) if (!isWerkdag(state, d)) dagen.push(d);
  if (!dagen.length) for (let d = van; d <= tot; d = plusDagen(d, 1)) dagen.push(d);
  return Array.from({ length: aantal }, (_, i) => dagen[Math.floor((i * dagen.length) / aantal)]);
}

// Voorstel om de nog niet ingeplande stukken van een opdracht te verdelen
// tussen morgen en de dag vóór de einddeadline. Geeft [{ taak, datum }].
export function verdeelOpdracht(state, opdrachtId, vandaagDatum = vandaag()) {
  const opd = state.opdrachten[opdrachtId];
  if (!opd || opd.del || !opd.deadline) return [];
  const stukken = takenVanOpdracht(state, opdrachtId).filter((t) => !t.klaar && !t.werkdag);
  const van = plusDagen(vandaagDatum, 1);
  let tot = plusDagen(opd.deadline, -1);
  if (tot < van) tot = opd.deadline < van ? van : opd.deadline;
  const dagen = verdeelDagen(state, stukken.length, van, tot);
  return stukken.map((taak, i) => {
    let datum = dagen[i];
    const eigen = deadlineVan(state, taak);
    if (eigen && datum > eigen) datum = eigen < van ? van : eigen;
    return { taak, datum };
  });
}
