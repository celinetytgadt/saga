// Saga – datamodel en rekenregels (zonder DOM, zodat het te testen is).
//
// Datums zijn overal strings 'JJJJ-MM-DD' in lokale tijd.
// Elk object heeft een `upd` (tijdstempel van laatste wijziging) zodat twee
// toestellen hun gegevens kunnen samenvoegen. Verwijderen = `del: true`.

export const COLLECTIES = ['klassen', 'lessen', 'taken', 'sjablonen', 'dagen'];

export const DAGNAMEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
export const MAANDNAMEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const KLASKLEUREN = ['#123b78', '#5bbba4', '#ef4f4e', '#8a5bb5', '#e0962a', '#2f8fcf', '#6f9a3a', '#c2577f'];

// Mogelijke deadlines van een taak bij een les.
export const DEADLINE_KEUZES = [
  { sleutel: 'rel:0', label: 'ochtend van de les', deadline: { rel: 0 } },
  { sleutel: 'rel:-1', label: 'dag vóór de les', deadline: { rel: -1 } },
  { sleutel: 'rel:-1w', label: 'dag vóór de les, niet op een werkdag', deadline: { rel: -1, nietOpWerkdag: true } },
  { sleutel: 'rel:-2', label: '2 dagen vóór de les', deadline: { rel: -2 } },
  { sleutel: 'rel:-7', label: '1 week vóór de les', deadline: { rel: -7 } },
];

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
    instellingen: { werkdagen: [2, 5], toonKlaar: false, upd: 0 },
  };
}

// Samenvoegen van twee versies: per object wint de recentste `upd`.
// Bij gelijke `upd` blijft de versie uit `a`.
// (Dezelfde functie staat ook in apps-script/Code.gs.)
export function merge(a, b) {
  a = a || {};
  b = b || {};
  const r = { ...b, ...a };
  for (const c of COLLECTIES) {
    r[c] = { ...(a[c] || {}) };
    for (const [id, v] of Object.entries(b[c] || {})) {
      const o = r[c][id];
      if (!o || (v.upd || 0) > (o.upd || 0)) r[c][id] = v;
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

export function isWerkdag(state, datum) {
  const m = state.dagen[datum];
  if (m && !m.del && typeof m.werkdag === 'boolean') return m.werkdag;
  return state.instellingen.werkdagen.includes(weekdag(datum));
}

// ---------- deadlines ----------

function berekenRelatief(state, taak, spec) {
  if (!spec) return null;
  if (spec.datum) return spec.datum;
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
  const k = DEADLINE_KEUZES.find(
    (k) => k.deadline.rel === deadline.rel && !!k.deadline.nietOpWerkdag === !!deadline.nietOpWerkdag
  );
  return k ? k.sleutel : 'rel:' + deadline.rel;
}

export function deadlineUitSleutel(sleutel, datum) {
  if (sleutel === 'datum') return datum ? { datum } : null;
  const k = DEADLINE_KEUZES.find((k) => k.sleutel === sleutel);
  return k ? { ...k.deadline } : null;
}

export function deadlineLabel(deadline) {
  const k = DEADLINE_KEUZES.find((k) => k.sleutel === deadlineSleutel(deadline));
  return k ? k.label : '';
}

// Waarschuwing voor een taak: { niveau: 'rood' | 'oranje', reden } of null.
export function waarschuwing(state, taak, vandaagDatum = vandaag()) {
  if (taak.klaar) return null;
  const dl = deadlineVan(state, taak);
  const va = vanafVan(state, taak);
  const wd = taak.werkdag;
  if (wd && dl && wd > dl) return { niveau: 'rood', reden: 'gepland ná de deadline' };
  if (wd && va && wd < va) return { niveau: 'rood', reden: `kan pas vanaf ${kortDatum(va)}` };
  if (dl && dl < vandaagDatum) return { niveau: 'rood', reden: 'deadline voorbij' };
  if (wd && wd < vandaagDatum) return { niveau: 'oranje', reden: 'blijven liggen' };
  if (!wd && dl && verschilDagen(vandaagDatum, dl) <= 3) return { niveau: 'oranje', reden: 'nog niet ingepland' };
  return null;
}

// ---------- lessen ----------

export function lessenVanKlas(state, klasId) {
  return lijst(state, 'lessen')
    .filter((l) => l.klasId === klasId)
    .sort((a, b) => {
      if (a.datum && b.datum && a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
      if (!!a.datum !== !!b.datum) return a.datum ? -1 : 1;
      return (a.volg || 0) - (b.volg || 0);
    });
}

export function volgendeVolg(state, klasId) {
  return Math.max(0, ...lessenVanKlas(state, klasId).map((l) => l.volg || 0)) + 1;
}

// Voorstel voor de verbeterdeadline: de eerste les van die klas na het indienen.
// Is er (nog) geen, dan de eerstvolgende lesdag volgens het lesrooster, anders +7 dagen.
export function volgendeLesNa(state, klasId, datum) {
  const les = lessenVanKlas(state, klasId).find((l) => l.datum && l.datum > datum);
  if (les) return les.datum;
  const rooster = state.klassen[klasId]?.rooster || [];
  for (let i = 1; i <= 7; i++) {
    const d = plusDagen(datum, i);
    if (rooster.includes(weekdag(d))) return d;
  }
  return plusDagen(datum, 7);
}

export function takenVanLes(state, lesId) {
  return lijst(state, 'taken').filter((t) => t.lesId === lesId);
}

// Maakt de gekozen standaardtaken aan bij een les (zonder werkdag: ze komen in het bakje).
export function maakStandaardTaken(state, les, sjabloonIds) {
  return sjabloonIds
    .map((id) => state.sjablonen[id])
    .filter((sj) => sj && !sj.del)
    .map((sj) =>
      zet(state, 'taken', {
        id: nieuwId(),
        titel: sj.titel,
        lesId: les.id,
        werkdag: null,
        deadline: sj.deadline ? { ...sj.deadline } : null,
        vanaf: null,
        klaar: false,
        notitie: '',
      })
    );
}

export function verwijderLes(state, lesId) {
  for (const t of takenVanLes(state, lesId)) wis(state, 'taken', t.id);
  wis(state, 'lessen', lesId);
}
