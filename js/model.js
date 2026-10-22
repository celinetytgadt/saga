// Saga – datamodel en rekenregels (zonder DOM, zodat het te testen is).
//
// Datums zijn overal strings 'JJJJ-MM-DD' in lokale tijd.
// Elk object heeft een `upd` (tijdstempel van laatste wijziging) zodat twee
// toestellen hun gegevens kunnen samenvoegen. Verwijderen = `del: true`.

export const COLLECTIES = ['klassen', 'lessen', 'taken', 'sjablonen', 'dagen', 'vakken', 'opdrachten', 'afspraken', 'onderwerpen', 'afwezigheden'];

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

// Overzicht: één doorlopende lijst van weken om naar beneden te scrollen.
// Bij het openen: vorige week, deze week en WEKEN_START weken vooruit; bij het scrollen
// komen er weken bij (tot WEKEN_MAX). Naar boven kan tot WEKEN_TERUG_MAX weken terug
// (ouder staat niet meer op het toestel, wel op Drive).
export const WEKEN_START = 4;
export const WEKEN_MAX = 52;
export const WEKEN_TERUG_MAX = 4;

// Dagen van de maandag `terug` weken vóór deze week tot de zondag `vooruit` weken na deze week.
export function venster(vandaagDatum, terug = 1, vooruit = WEKEN_START) {
  const maandag = maandagVan(vandaagDatum);
  const van = plusDagen(maandag, -7 * terug);
  const tot = plusDagen(maandag, 7 * vooruit + 6);
  const dagen = [];
  for (let d = van; d <= tot; d = plusDagen(d, 1)) dagen.push(d);
  return { van, tot, dagen };
}

// "november 2026"
export function maandNaam(s) {
  const d = parseDatum(s);
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
    afwezigheden: {}, // vakanties (alle klassen) en afwezigheden van één of meer klassen
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

// Verwijderen = enkel markeren: de gegevens (bv. de bestede tijd) blijven bewaard op Drive.
// Een lopende timer wordt eerst gestopt.
export function wis(state, collectie, id) {
  const oud = state[collectie][id] || {};
  const tijd = oud.gestart ? { tijd: bestedeTijd(oud), gestart: null } : {};
  state[collectie][id] = { ...oud, ...tijd, id, del: true, upd: Date.now() };
}

// ---------- tijdelijke index ----------
// Tijdens het tekenen verandert er niets aan de gegevens. `metCache` onthoudt dan
// opzoeklijsten (taken per les, afspraken per dag, …) zodat ze maar één keer berekend
// worden. Buiten `metCache` wordt alles telkens opnieuw berekend (veilig bij wijzigingen).
let cache = null;

export function metCache(f) {
  if (cache) return f();
  cache = new Map();
  try {
    return f();
  } finally {
    cache = null;
  }
}

function onthoud(naam, bron, bouw) {
  if (!cache || !bron) return bouw();
  let m = cache.get(naam);
  if (!m) cache.set(naam, (m = new WeakMap()));
  if (!m.has(bron)) m.set(bron, bouw());
  return m.get(bron);
}

function groepeer(lijstje, sleutel) {
  const m = new Map();
  for (const o of lijstje) {
    const k = sleutel(o);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(o);
  }
  return m;
}

export function lijst(state, collectie) {
  return onthoud('lijst', state[collectie], () => Object.values(state[collectie] || {}).filter((o) => !o.del)).slice();
}

// ---------- werkdagen ----------

// De eerstvolgende `aantal` werkdagen na `datum` (niet `datum` zelf), binnen 3 weken.
export function volgendeWerkdagen(state, datum, aantal = 2) {
  const r = [];
  for (let i = 1; i <= 21 && r.length < aantal; i++) {
    const d = plusDagen(datum, i);
    if (isWerkdag(state, d)) r.push(d);
  }
  return r;
}

// Volgorde: manuele aanduiding > afspraak met #sw > vaste werkdagen.
export function isWerkdag(state, datum) {
  const m = state.dagen[datum];
  if (m && !m.del && typeof m.werkdag === 'boolean') return m.werkdag;
  if (afsprakenOp(state, datum).some((a) => a.werk)) return true;
  return state.instellingen.werkdagen.includes(weekdag(datum));
}

// Een dag manueel werkdag maken of net niet. Komt het resultaat overeen met wat
// de dag zonder manuele aanduiding is (vaste werkdag of #sw), dan valt de aanduiding weg.
export function wisselWerkdag(state, datum) {
  const werk = isWerkdag(state, datum);
  const vanzelf = afsprakenOp(state, datum).some((a) => a.werk) || state.instellingen.werkdagen.includes(weekdag(datum));
  zet(state, 'dagen', { id: datum, werkdag: !werk === vanzelf ? null : !werk });
}

// ---------- agenda ----------

function afsprakenPerDag(state) {
  return onthoud('afsprakenPerDag', state.afspraken, () => {
    const m = new Map();
    const alle = lijst(state, 'afspraken').sort((a, b) => ((a.tijd || '') < (b.tijd || '') ? -1 : 1));
    for (const a of alle) {
      if (!a.datum) continue;
      const eind = a.eindDatum && a.eindDatum > a.datum ? a.eindDatum : a.datum;
      for (let d = a.datum, i = 0; d <= eind && i < 400; d = plusDagen(d, 1), i++) {
        if (!m.has(d)) m.set(d, []);
        m.get(d).push(a);
      }
    }
    return m;
  });
}

export function afsprakenOp(state, datum) {
  return (afsprakenPerDag(state).get(datum) || []).slice();
}

// ---------- vakanties en afwezigheden ----------
// Een afwezigheid zonder klassen (`klasIds` leeg) geldt voor alle klassen: een vakantie.

export function afwezighedenOp(state, datum) {
  return lijst(state, 'afwezigheden')
    .filter((a) => a.van && a.van <= datum && datum <= (a.tot || a.van))
    .sort((a, b) => (a.klasIds || []).length - (b.klasIds || []).length);
}

export const isVakantie = (afw) => !(afw.klasIds || []).length;

// Afwezigheid die geldt voor (minstens één van) deze klassen op die dag, of null.
export function klasAfwezig(state, datum, klasIds) {
  return afwezighedenOp(state, datum).find((a) => isVakantie(a) || a.klasIds.some((k) => klasIds.includes(k))) || null;
}

// Waarschuwing voor een les op een dag waarop de klas er niet is.
export function lesWaarschuwing(state, les) {
  if (!les.datum) return null;
  const a = klasAfwezig(state, les.datum, klassenVanLes(les));
  return a ? { niveau: 'oranje', reden: `${a.reden || (isVakantie(a) ? 'vakantie' : 'klas afwezig')}` } : null;
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
  if (taak.indien) return taak.indien;
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
  if (taak.indien) return verbeterDag(taak.indien);
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

// Een taak opslaan vanuit het taakvenster. `basis` is de nieuwe taak (zonder id) of
// wordt genegeerd als de taak al bestaat. Regelt ook: de standaarddag van een lestaak,
// de volgorde binnen een opdracht, de timer bij afvinken en de blokken van een opgesplitste taak.
export function bewaarTaak(state, id, wijzigingen, basis = {}) {
  const huidig = id ? state.taken[id] : null;
  const nieuw = { ...(huidig || basis), id: id || nieuwId(), ...wijzigingen };
  if (nieuw.hoofd && 'werkdag' in wijzigingen) {
    if (!nieuw.werkdag) Object.assign(nieuw, { werkdag: standaardWerkdag(state, nieuw), manueel: false });
    else if (nieuw.werkdag !== huidig?.werkdag) nieuw.manueel = true;
  }
  if (nieuw.opdrachtId && (!huidig || huidig.opdrachtId !== nieuw.opdrachtId)) nieuw.volg = volgendStuk(state, nieuw.opdrachtId);
  if (nieuw.lesId || nieuw.opdrachtId || nieuw.domein === 'opleiding') delete nieuw.klasIds;
  if (nieuw.klaar && nieuw.gestart) Object.assign(nieuw, { tijd: bestedeTijd(nieuw), gestart: null });
  zet(state, 'taken', nieuw);
  if (nieuw.deelGroep && 'deadline' in wijzigingen) deelDeadline(state, nieuw.id);
  if (nieuw.deelGroep && !nieuw.lesId && !nieuw.opdrachtId) deelOnderwerp(state, nieuw.id);
  return nieuw;
}

// Les naar een andere dag (of zonder datum). De taak van de les verhuist mee,
// tenzij je ze zelf al naar een andere dag verplaatst had.
export function verplaatsLes(state, lesId, datum) {
  const les = state.lessen[lesId];
  if (!les || les.del) return;
  zet(state, 'lessen', { ...les, datum: datum || null });
  const h = state.taken[hoofdId(lesId)];
  if (h && !h.del && !h.manueel) zet(state, 'taken', { ...h, werkdag: datum ? standaardWerkdag(state, h) : null });
  // de indiendag van een taak voor leerlingen schuift mee, tenzij je ze zelf koos
  if (datum)
    for (const t of takenVanLes(state, lesId))
      if (isLeerlingTaak(t) && !t.indienManueel && t.indien !== vrijdagVanaf(datum)) zet(state, 'taken', { ...t, indien: vrijdagVanaf(datum) });
}

// Waarschuwing voor een taak: { niveau: 'rood' | 'oranje', reden } of null.
export function waarschuwing(state, taak, vandaagDatum = vandaag()) {
  if (taak.klaar) return null;
  // de voorbereiding van een les die al gegeven is: geen waarschuwing meer
  const les = taak.hoofd && state.lessen[taak.lesId];
  if (les && les.datum && les.datum < vandaagDatum) return null;
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

const opLesdatum = (a, b) => {
  if (a.datum && b.datum && a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
  if (!!a.datum !== !!b.datum) return a.datum ? -1 : 1;
  return (a.volg || 0) - (b.volg || 0);
};

function lessenPerKlas(state) {
  return onthoud('lessenPerKlas', state.lessen, () => {
    const m = new Map();
    for (const l of lijst(state, 'lessen').sort(opLesdatum))
      for (const k of klassenVanLes(l)) {
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(l);
      }
    return m;
  });
}

export function lessenVanKlas(state, klasId) {
  return (lessenPerKlas(state).get(klasId) || []).slice();
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
  return (onthoud('takenPerLes', state.taken, () => groepeer(lijst(state, 'taken'), (t) => t.lesId || null)).get(lesId) || []).slice();
}

// Klassen waarvoor een taak is: via haar les, haar opdracht, of zelf aangeduid (losse schooltaak).
export function klassenVanTaak(state, t) {
  const les = t.lesId && state.lessen[t.lesId];
  if (les && !les.del) return klassenVanLes(les);
  const opd = t.opdrachtId && state.opdrachten[t.opdrachtId];
  if (opd && !opd.del) return opd.klasIds || [];
  return t.lesId || t.opdrachtId ? [] : t.klasIds || [];
}

// Verbeterwerk: taak bij een les die na het indienen komt.
export function isVerbeteren(t) {
  return t.soort === 'verbeteren' || (!t.hoofd && !!t.lesId && /^verbeter/i.test(t.titel || ''));
}

// ---------- taken voor leerlingen ----------
// Een taak die leerlingen maken en ik verbeter. Ze hoort (optioneel) bij een les en
// heeft een indiendag (`indien`), standaard de vrijdag van de lesweek. Het verbeteren
// staat vanzelf op mijn planning, de dag na het indienen, tot ik het zelf verschuif.
// (Oudere verbetertaken hebben geen `indien` en blijven gewone taken.)

export const isLeerlingTaak = (t) => t.soort === 'verbeteren' && !!t.indien;

export const verbeterDag = (indien) => plusDagen(indien, 1);

// Eerste vrijdag op of na `datum`.
export function vrijdagVanaf(datum) {
  return plusDagen(datum, (5 - weekdag(datum) + 7) % 7);
}

// Voorstel voor de indiendag: de vrijdag van de lesweek (zonder les: deze week).
export function standaardIndien(state, lesId, vandaagDatum = vandaag()) {
  const les = lesId && state.lessen[lesId];
  return vrijdagVanaf(les && !les.del && les.datum ? les.datum : vandaagDatum);
}

export function bewaarLeerlingTaak(state, id, { titel, lesId = null, klasIds = [], indien, werkdag = null, notitie = '', klaar = false }) {
  const huidig = id ? state.taken[id] : null;
  const nieuw = {
    ...(huidig || { klaar: false, deadline: null, vanaf: null }),
    id: id || nieuwId(),
    soort: 'verbeteren',
    domein: 'school',
    titel,
    lesId: lesId || null,
    klasIds: lesId ? undefined : klasIds,
    indien,
    indienManueel: indien !== standaardIndien(state, lesId),
    werkdag: werkdag && werkdag !== verbeterDag(indien) ? werkdag : null,
    notitie,
    klaar,
  };
  if (nieuw.klaar && nieuw.gestart) Object.assign(nieuw, { tijd: bestedeTijd(nieuw), gestart: null });
  return zet(state, 'taken', nieuw);
}

// Een les opslaan (nieuw of gewijzigd). Een nieuwe les krijgt haar taak;
// een verplaatste les neemt haar taak mee (tenzij die zelf verplaatst werd).
export function bewaarLes(state, id, { klasIds, titel, datum }) {
  const huidig = id ? state.lessen[id] : null;
  const les = zet(state, 'lessen', {
    ...(huidig || {}),
    id: id || nieuwId(),
    klasId: undefined,
    klasIds,
    titel,
    datum: datum || null,
    volg: huidig?.volg ?? volgendeVolg(state, klasIds[0]),
  });
  if (!huidig) zorgHoofdtaken(state);
  else if ((huidig.datum || null) !== les.datum) verplaatsLes(state, les.id, les.datum);
  return les;
}

// ---------- lesrooster ----------

// Een lesmoment: een lesdag van de klas waarop de klas niet afwezig is.
export function isLesmoment(state, klasId, datum) {
  const k = state.klassen[klasId];
  return !!k && !k.del && (k.rooster || []).includes(weekdag(datum)) && !klasAfwezig(state, datum, [klasId]);
}

// Volgend (richting 1) of vorig (richting -1) lesmoment na/vóór `datum`, of null.
export function volgendLesmoment(state, klasId, datum, richting = 1) {
  for (let i = 1; i <= 400; i++) {
    const d = plusDagen(datum, i * richting);
    if (isLesmoment(state, klasId, d)) return d;
  }
  return null;
}

// Voorstel om de lessen zonder datum van een klas in te plannen op de volgende
// lesmomenten (na de laatst geplande les, en niet vóór vandaag). Geeft [{ les, datum }].
export function planVolgensRooster(state, klasId, vandaagDatum = vandaag()) {
  const lessen = lessenVanKlas(state, klasId);
  const zonder = lessen.filter((l) => !l.datum);
  const bezet = new Set(lessen.filter((l) => l.datum).map((l) => l.datum));
  const laatste = [...bezet].sort().at(-1);
  let d = laatste && laatste >= vandaagDatum ? laatste : plusDagen(vandaagDatum, -1);
  const plan = [];
  for (const les of zonder) {
    do d = volgendLesmoment(state, klasId, d);
    while (d && bezet.has(d));
    if (!d) break;
    bezet.add(d);
    plan.push({ les, datum: d });
  }
  return plan;
}

// Deze les en alle volgende lessen van de klas één lesmoment later (1) of vroeger (-1).
// Geeft het plan [{ les, datum }], of null als het niet kan (geen lesrooster, of de
// plaats vóór de eerste les is al bezet).
export function reeksPlan(state, lesId, klasId, richting = 1) {
  const les = state.lessen[lesId];
  if (!les || les.del || !les.datum) return null;
  const alle = lessenVanKlas(state, klasId).filter((l) => l.datum);
  const reeks = alle.filter((l) => l.datum >= les.datum);
  const plan = [];
  let vorige = richting > 0 ? null : undefined;
  for (const l of reeks) {
    let d = volgendLesmoment(state, klasId, l.datum, richting);
    if (richting > 0 && vorige && d && d <= vorige) d = volgendLesmoment(state, klasId, vorige, 1);
    if (!d) return null;
    plan.push({ les: l, datum: d });
    vorige = d;
  }
  if (richting < 0 && plan.length) {
    const eerste = plan[0].datum;
    if (alle.some((l) => l.datum === eerste && !reeks.includes(l))) return null;
  }
  return plan.length ? plan : null;
}

export function pasLesplanToe(state, plan) {
  for (const p of plan) verplaatsLes(state, p.les.id, p.datum);
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

function oudeTakenVanLes(taken, titels) {
  return (taken || []).filter(
    (t) => !t.hoofd && !t.deelGroep && titels.has((t.titel || '').trim().toLowerCase())
  );
}

// Is er nog opruimwerk: een les zonder taak, of oude standaardtaken naast de lestaak?
export function heeftOpruimwerk(state) {
  return metCache(() => opruimwerk(state));
}

function opruimwerk(state) {
  const titels = oudeStandaardTitels(state);
  if (groepenMetVerschillendeDeadline(state).length) return true;
  if (lijst(state, 'taken').some((t) => t.deelGroep && !t.lesId && !t.opdrachtId)) return true;
  return lijst(state, 'lessen').some((les) => {
    const h = state.taken[hoofdId(les.id)];
    if (!h) return true;
    if (h.del) return false;
    return oudeTakenVanLes(takenVanLes(state, les.id), titels).length > 0 || (!h.werkdag && !!les.datum);
  });
}

// Zorgt dat elke les precies één (hoofd)taak heeft. Het id is vast ('h-' + les-id),
// zodat twee toestellen dezelfde taak maken. Oude standaardtaken van de les gaan erin op:
// hun werkdag (bij voorkeur die van de lesvoorbereiding) en "klaar" worden overgenomen.
// Geeft true als er iets veranderde.
export function zorgHoofdtaken(state) {
  const titels = oudeStandaardTitels(state);
  // eenmalig opzoeken: in de lus veranderen enkel de taken van de les zelf
  const perLes = groepeer(lijst(state, 'taken'), (t) => t.lesId || null);
  let veranderd = false;
  for (const les of lijst(state, 'lessen')) {
    const id = hoofdId(les.id);
    const h = state.taken[id];
    if (h && h.del) continue; // bewust verwijderd
    const oude = oudeTakenVanLes(perLes.get(les.id), titels);
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
  return (onthoud('takenPerGroep', state.taken, () => groepeer(lijst(state, 'taken'), (t) => t.deelGroep || null)).get(deelGroep) || []).slice();
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

// ---------- herplannen ----------

// Voorstel om taken die bleven liggen opnieuw te verdelen over de komende dagen die
// geen werkdag zijn (vanaf vandaag, minstens een week ver), zonder voorbij hun deadline.
// Geeft [{ taak, datum }].
export function herplanPlan(state, taken, vandaagDatum = vandaag()) {
  const tot = plusDagen(vandaagDatum, Math.max(6, taken.length - 1));
  const dagen = verdeelDagen(state, taken.length, vandaagDatum, tot);
  return taken.map((taak, i) => {
    let datum = dagen[i];
    const dl = deadlineVan(state, taak);
    if (dl && datum > dl) datum = dl < vandaagDatum ? vandaagDatum : dl;
    return { taak, datum };
  });
}

export function pasHerplanToe(state, plan) {
  for (const p of plan) zetWerkdag(state, p.taak.id, p.datum);
}

// ---------- opleiding ----------

export function takenVanOpdracht(state, opdrachtId) {
  const m = onthoud('takenPerOpdracht', state.taken, () => {
    const g = groepeer(lijst(state, 'taken'), (t) => t.opdrachtId || null);
    for (const v of g.values()) v.sort((a, b) => (a.volg || 0) - (b.volg || 0));
    return g;
  });
  return (m.get(opdrachtId) || []).slice();
}

// Een voorstel van verdelen (zie verdeelOpdracht) uitvoeren.
export function pasVerdelingToe(state, plan) {
  for (const p of plan) {
    const t = state.taken[p.taak.id];
    if (t && !t.del) zet(state, 'taken', { ...t, werkdag: p.datum });
  }
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

// ---------- ongedaan maken ----------

// Momentopname vóór een wijziging (enkel verwijzingen, de objecten zelf worden nooit aangepast).
export function momentopname(state) {
  const foto = {};
  for (const k of Object.keys(state)) foto[k] = isCollectie(state[k]) && k !== 'instellingen' ? { ...state[k] } : state[k];
  return foto;
}

// Alles wat sinds de momentopname veranderde, terugzetten (met een nieuwe tijdstempel,
// zodat het ook op de andere toestellen terugkomt). Wat nieuw was, wordt verwijderd.
export function zetTerug(state, foto) {
  for (const k of Object.keys(state)) {
    if (k === 'instellingen') {
      if (foto.instellingen && state.instellingen !== foto.instellingen) state.instellingen = { ...foto.instellingen, upd: Date.now() };
      continue;
    }
    if (!isCollectie(state[k])) continue;
    const voor = foto[k] || {};
    for (const id of Object.keys(state[k])) {
      if (state[k][id] === voor[id]) continue;
      if (voor[id]) zet(state, k, { ...voor[id] });
      else wis(state, k, id);
    }
  }
}

// Een back-up écht terugzetten: alles uit de back-up wint (nieuwe tijdstempel) en
// wat er sindsdien bijkwam, wordt verwijderd. Agenda-afspraken blijven van het script.
export function herstelNaar(state, data) {
  const nu = Date.now();
  for (const k of Object.keys(data || {})) {
    if (k === 'instellingen' || k === 'afspraken' || !isCollectie(data[k])) continue;
    state[k] = { ...(state[k] || {}) };
    for (const [id, o] of Object.entries(data[k])) state[k][id] = { ...o, upd: nu };
  }
  for (const k of Object.keys(state)) {
    if (k === 'instellingen' || k === 'afspraken' || !isCollectie(state[k])) continue;
    for (const id of Object.keys(state[k])) if (!data?.[k]?.[id] && !state[k][id].del) wis(state, k, id);
  }
  if (data?.instellingen) state.instellingen = { ...data.instellingen, upd: nu };
}

// ---------- archief: wat het toestel nog nodig heeft ----------

// Alles wordt bewaard op Drive. Op het toestel blijft enkel wat de laatste maand
// (ACTIEF_DAGEN) nog speelde: afgewerkte taken, voorbije lessen, oude afspraken en
// afwezigheden verdwijnen er na een maand. Een les blijft zolang één van haar taken
// blijft (en omgekeerd: blijft een les, dan blijven al haar taken), zodat Saga nooit
// een lestaak opnieuw aanmaakt die nog op Drive staat. Hetzelfde voor opdrachten.
// Wat recent gewijzigd werd (of na `bewaardTot`, nog niet op Drive) blijft altijd.
// (Dezelfde functie staat ook in apps-script/Code.gs.)
export const ACTIEF_DAGEN = 31;

export function actief(state, vandaagDatum, nu, bewaardTot) {
  const d = new Date(Number(vandaagDatum.slice(0, 4)), Number(vandaagDatum.slice(5, 7)) - 1, Number(vandaagDatum.slice(8, 10)) - ACTIEF_DAGEN);
  const z = (n) => String(n).padStart(2, '0');
  const grens = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  let grensMs = nu - ACTIEF_DAGEN * 86400000;
  if (typeof bewaardTot === 'number' && bewaardTot < grensMs) grensMs = bewaardTot;
  const recent = (o) => (o.upd || 0) > grensMs;
  const taken = state.taken || {};
  const metStukken = {};
  Object.keys(taken).forEach((id) => {
    const t = taken[id];
    if (t && !t.del && t.opdrachtId) metStukken[t.opdrachtId] = true;
  });
  const eigenOud = (k, o) => {
    if (!o || typeof o !== 'object') return false;
    if (o.del) return !recent(o);
    if (k === 'taken') return !recent(o) && !!o.klaar && (o.werkdag || '') < grens;
    if (k === 'lessen') return !recent(o) && !!o.datum && o.datum < grens;
    if (k === 'opdrachten') return !recent(o) && (o.deadline ? o.deadline < grens : !!metStukken[o.id]);
    if (k === 'afspraken') return (o.eindDatum || o.datum || '') < grens;
    if (k === 'dagen') return String(o.id || '') < grens;
    if (k === 'afwezigheden') return !recent(o) && (o.tot || o.van || '') < grens;
    return false;
  };
  const levend = { lessen: {}, opdrachten: {} };
  Object.keys(taken).forEach((id) => {
    const t = taken[id];
    if (eigenOud('taken', t)) return;
    if (t.lesId) levend.lessen[t.lesId] = true;
    if (t.opdrachtId) levend.opdrachten[t.opdrachtId] = true;
  });
  const ouderBlijft = (k, id) => {
    const o = state[k] && state[k][id];
    return !!o && (!!levend[k][id] || !eigenOud(k, o));
  };
  const r = {};
  Object.keys(state).forEach((k) => {
    const c = state[k];
    if (k === 'instellingen' || !c || typeof c !== 'object' || Array.isArray(c)) {
      r[k] = c;
      return;
    }
    const nieuw = {};
    let weg = false;
    Object.keys(c).forEach((id) => {
      const o = c[id];
      let blijft;
      if (k === 'lessen' || k === 'opdrachten') blijft = ouderBlijft(k, id);
      else if (k === 'taken')
        blijft = !eigenOud(k, o) || (!!o.lesId && ouderBlijft('lessen', o.lesId)) || (!!o.opdrachtId && ouderBlijft('opdrachten', o.opdrachtId));
      else blijft = !eigenOud(k, o);
      if (blijft) nieuw[id] = o;
      else weg = true;
    });
    r[k] = weg ? nieuw : c;
  });
  return r;
}

// ---------- waar gaat mijn tijd naartoe ----------

export const SOORTEN = { les: 'Lesvoorbereiding', verbeteren: 'Verbeteren', opdracht: 'Opdrachten en stukken', los: "To do's" };

// Begin van het schooljaar (1 september) waarin `datum` valt.
export function schooljaarStart(datum) {
  const j = Number(datum.slice(0, 4));
  return datum.slice(5) >= '09-01' ? `${j}-09-01` : `${j - 1}-09-01`;
}

// Dag waaraan de bestede tijd van een taak toegeschreven wordt.
export function tijdDatum(state, t) {
  return t.werkdag || deadlineVan(state, t) || (t.upd ? isoDatum(new Date(t.upd)) : null);
}

// Bestede tijd tussen `van` en `tot` (inbegrepen), opgeteld per groep (klas, onderwerp,
// opleidingsonderdeel), per soort werk, per maand en per les/opdracht.
export function tijdRapport(state, van, tot, nu = Date.now()) {
  return metCache(() => {
    const r = { totaal: 0, school: 0, opleiding: 0, groepen: {}, maanden: {}, items: {} };
    for (const t of lijst(state, 'taken')) {
      const ms = bestedeTijd(t, nu);
      if (!ms) continue;
      const datum = tijdDatum(state, t);
      if (!datum || datum < van || datum > tot) continue;
      const domein = domeinVan(t);
      const les = t.lesId && state.lessen[t.lesId];
      const opd = t.opdrachtId && state.opdrachten[t.opdrachtId];
      const soort = isVerbeteren(t) ? 'verbeteren' : t.lesId ? 'les' : t.opdrachtId ? 'opdracht' : 'los';
      const klassen = klassenVanTaak(state, t)
        .map((id) => state.klassen[id])
        .filter(Boolean);
      let g;
      if (klassen.length) {
        g = { sleutel: 'klas:' + klassen.map((k) => k.id).sort().join('+'), naam: groepNaam(klassen.map((k) => k.naam)), kleur: klassen[0].kleur, klasIds: klassen.map((k) => k.id) };
      } else {
        const ond = (opd && opd.onderwerpId && state.onderwerpen[opd.onderwerpId]) || (!opd && !les && t.onderwerpId && state.onderwerpen[t.onderwerpId]);
        const vak = opd && opd.vakId && state.vakken[opd.vakId];
        if (ond) g = { sleutel: 'ond:' + ond.id, naam: ond.naam, kleur: ond.kleur };
        else if (vak) g = { sleutel: 'vak:' + vak.id, naam: vak.naam, kleur: vak.kleur };
        else g = { sleutel: 'overig:' + domein, naam: domein === 'opleiding' ? 'Opleiding, overig' : 'School, overig', kleur: null };
      }
      const groep = (r.groepen[g.sleutel] ||= { ...g, domein, totaal: 0, soorten: {}, lessen: {} });
      groep.totaal += ms;
      groep.soorten[soort] = (groep.soorten[soort] || 0) + ms;
      if (soort === 'les') groep.lessen[t.lesId] = true;
      const maand = (r.maanden[datum.slice(0, 7)] ||= { maand: datum.slice(0, 7), school: 0, opleiding: 0 });
      maand[domein] += ms;
      r.totaal += ms;
      r[domein] += ms;
      const ik = les ? 'les:' + t.lesId : opd ? 'opd:' + t.opdrachtId : 'taak:' + t.id;
      const titel = les ? les.titel : opd ? opd.titel : t.titel;
      const item = (r.items[ik] ||= { sleutel: ik, titel: titel || '(zonder titel)', groep: g.naam, kleur: g.kleur, ms: 0, datum });
      item.ms += ms;
      if (datum > item.datum) item.datum = datum;
    }
    const groepen = Object.values(r.groepen)
      .map((g) => {
        const aantal = Object.keys(g.lessen).length;
        return { ...g, aantalLessen: aantal, perLes: aantal ? Math.round((g.soorten.les || 0) / aantal) : 0 };
      })
      .sort((a, b) => b.totaal - a.totaal);
    return {
      totaal: r.totaal,
      school: r.school,
      opleiding: r.opleiding,
      groepen,
      maanden: Object.values(r.maanden).sort((a, b) => (a.maand < b.maand ? -1 : 1)),
      top: Object.values(r.items)
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 10),
    };
  });
}
