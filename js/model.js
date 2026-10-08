// Saga – datamodel en rekenregels (zonder DOM, zodat het te testen is).
//
// Datums zijn overal strings 'JJJJ-MM-DD' in lokale tijd.
// Elk object heeft een `upd` (tijdstempel van laatste wijziging) zodat twee
// toestellen hun gegevens kunnen samenvoegen. Verwijderen = `del: true`.

export const COLLECTIES = ['klassen', 'lessen', 'taken', 'sjablonen', 'dagen', 'vakken', 'opdrachten', 'afspraken'];

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
export function werkdagVan(state, taak) {
  if (taak.werkdag) return taak.werkdag;
  return taak.hoofd ? deadlineVan(state, taak) : null;
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

export function domeinVan(taak) {
  if (taak.opdrachtId) return 'opleiding';
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
const OUDE_STANDAARDTAKEN = ['lesvoorbereiding', 'cr-taak klaarzetten', 'prints'];

export const hoofdId = (lesId) => 'h-' + lesId;

// Zorgt dat elke les precies één (hoofd)taak heeft. Het id is vast ('h-' + les-id),
// zodat twee toestellen dezelfde taak maken. Geeft true als er iets veranderde.
export function zorgHoofdtaken(state) {
  let veranderd = false;
  for (const les of lijst(state, 'lessen')) {
    const id = hoofdId(les.id);
    if (state.taken[id]) continue; // bestaat (of werd bewust verwijderd)
    const oude = takenVanLes(state, les.id).filter((t) => !t.hoofd && OUDE_STANDAARDTAKEN.includes((t.titel || '').toLowerCase()));
    const lvb = oude.find((t) => t.titel.toLowerCase() === 'lesvoorbereiding');
    zet(state, 'taken', {
      id,
      titel: '',
      lesId: les.id,
      hoofd: true,
      werkdag: lvb?.werkdag || null,
      deadline: { ...HOOFD_DEADLINE },
      vanaf: null,
      klaar: oude.length ? oude.every((t) => t.klaar) : false,
      notitie: '',
    });
    for (const t of oude) wis(state, 'taken', t.id);
    veranderd = true;
  }
  return veranderd;
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
        deelGroep: groep,
        deelNr: i,
        deelVan: aantal,
      })
    );
  }
  return nieuw;
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
    .filter((o) => (o.vakId || null) === (vakId || null))
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
  return titels.map((titel) =>
    zet(state, 'taken', {
      id: nieuwId(),
      titel,
      opdrachtId,
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
