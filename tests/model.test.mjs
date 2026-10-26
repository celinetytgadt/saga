import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as M from '../js/model.js';

function basis() {
  const s = M.leegeState(); // vaste werkdagen di (2) en vr (5)
  s.klassen.k1 = { id: 'k1', naam: 'BKH4', kleur: '#123b78', rooster: [1, 4], upd: 1 };
  s.lessen.l1 = { id: 'l1', klasId: 'k1', titel: 'Aankoopfactuur', datum: '2026-10-15', volg: 1, upd: 1 }; // donderdag
  return s;
}

const taak = (extra) => ({ id: 't', titel: 'x', lesId: 'l1', werkdag: null, deadline: null, vanaf: null, klaar: false, ...extra });

test('datums rekenen over maandgrenzen', () => {
  assert.equal(M.plusDagen('2026-10-31', 1), '2026-11-01');
  assert.equal(M.plusDagen('2026-03-01', -1), '2026-02-28');
  assert.equal(M.maandagVan('2026-10-11'), '2026-10-05'); // zondag → maandag ervoor
  assert.equal(M.verschilDagen('2026-10-07', '2026-10-15'), 8);
  assert.equal(M.kortDatum('2026-10-15'), 'do 15 okt');
});

test('relatieve deadline volgt de les', () => {
  const s = basis();
  const t = taak({ deadline: { rel: -1 } });
  assert.equal(M.deadlineVan(s, t), '2026-10-14');
  s.lessen.l1.datum = '2026-10-20';
  assert.equal(M.deadlineVan(s, t), '2026-10-19');
  s.lessen.l1.datum = null;
  assert.equal(M.deadlineVan(s, t), null);
});

test('prints: ochtend van de les zelf', () => {
  assert.equal(M.deadlineVan(basis(), taak({ deadline: { rel: 0 } })), '2026-10-15');
});

test('lesvoorbereiding schuift voorbij werkdagen', () => {
  const s = basis();
  const t = taak({ deadline: { rel: -1, nietOpWerkdag: true } });
  // les op do 15/10, woensdag is geen werkdag
  assert.equal(M.deadlineVan(s, t), '2026-10-14');
  // les op za 17/10: vrijdag is werkdag → donderdag
  s.lessen.l1.datum = '2026-10-17';
  assert.equal(M.deadlineVan(s, t), '2026-10-15');
  // werkdagen ma + di, les op wo 14/10 → zondag
  s.instellingen.werkdagen = [1, 2];
  s.lessen.l1.datum = '2026-10-14';
  assert.equal(M.deadlineVan(s, t), '2026-10-11');
});

test('extra werkdag en uitgezette werkdag', () => {
  const s = basis();
  const t = taak({ deadline: { rel: -1, nietOpWerkdag: true } });
  s.dagen['2026-10-14'] = { id: '2026-10-14', werkdag: true, upd: 1 }; // studiedag op woensdag
  assert.equal(M.isWerkdag(s, '2026-10-14'), true);
  assert.equal(M.deadlineVan(s, t), '2026-10-12'); // wo werk, di vaste werkdag → ma
  s.dagen['2026-10-13'] = { id: '2026-10-13', werkdag: false, upd: 1 };
  assert.equal(M.deadlineVan(s, t), '2026-10-13');
  s.dagen['2026-10-13'] = { id: '2026-10-13', werkdag: null, upd: 2 }; // terug naar standaard
  assert.equal(M.isWerkdag(s, '2026-10-13'), true);
});

test('waarschuwingen', () => {
  const s = basis();
  const v = '2026-10-10';
  assert.equal(M.waarschuwing(s, taak({ deadline: { rel: -1 }, werkdag: '2026-10-12' }), v), null);
  assert.equal(M.waarschuwing(s, taak({ deadline: { rel: -1 }, werkdag: '2026-10-15' }), v).niveau, 'rood');
  assert.equal(M.waarschuwing(s, taak({ vanaf: { datum: '2026-10-16' }, werkdag: '2026-10-12' }), v).niveau, 'rood');
  assert.equal(M.waarschuwing(s, taak({ deadline: { datum: '2026-10-12' } }), v).niveau, 'oranje');
  assert.equal(M.waarschuwing(s, taak({ deadline: { datum: '2026-10-20' } }), v), null);
  assert.equal(M.waarschuwing(s, taak({ werkdag: '2026-10-09' }), v).niveau, 'oranje');
  assert.equal(M.waarschuwing(s, taak({ deadline: { datum: '2026-10-09' } }), v).niveau, 'rood');
  assert.equal(M.waarschuwing(s, taak({ deadline: { datum: '2026-10-09' }, klaar: true }), v), null);
});

test('verbeterdeadline: volgende les, anders lesrooster, anders +7', () => {
  const s = basis();
  s.lessen.l2 = { id: 'l2', klasId: 'k1', titel: 'Volgende', datum: '2026-10-22', volg: 2, upd: 1 };
  assert.equal(M.volgendeLesNa(s, 'k1', '2026-10-15'), '2026-10-22');
  assert.equal(M.volgendeLesNa(s, 'k1', '2026-10-22'), '2026-10-26'); // rooster: maandag
  s.klassen.k1.rooster = [];
  assert.equal(M.volgendeLesNa(s, 'k1', '2026-10-22'), '2026-10-29');
});

test('één taak per les: aangemaakt, standaard vóór de les, verplaatsbaar', () => {
  const s = basis(); // les l1 op do 15/10, werkdagen di + vr
  // oude standaardtaken worden samengevoegd
  s.taken.oud1 = { id: 'oud1', titel: 'Lesvoorbereiding', lesId: 'l1', werkdag: '2026-10-12', klaar: false, upd: 1 };
  s.taken.oud2 = { id: 'oud2', titel: 'Prints', lesId: 'l1', werkdag: null, klaar: false, upd: 1 };
  s.taken.eigen = { id: 'eigen', titel: 'Verbeteren', lesId: 'l1', werkdag: null, klaar: false, upd: 1 };
  assert.equal(M.zorgHoofdtaken(s), true);
  assert.equal(M.zorgHoofdtaken(s), false); // maar één keer
  const h = s.taken[M.hoofdId('l1')];
  assert.equal(h.hoofd, true);
  assert.equal(h.werkdag, '2026-10-12'); // overgenomen van de oude lesvoorbereiding
  assert.equal(h.manueel, true);
  assert.equal(s.taken.oud1.del, true);
  assert.equal(s.taken.oud2.del, true);
  assert.equal(s.taken.eigen.titel, 'Verbeteren'); // eigen taak blijft
  // terug naar standaard: dag vóór de les, niet op een werkdag, en vastgelegd
  M.zetWerkdag(s, h.id, null);
  assert.deepEqual([s.taken[h.id].werkdag, s.taken[h.id].manueel], ['2026-10-14', false]);
  // een extra werkdag (#sw) laat de taak staan
  s.afspraken.sw = { id: 'sw', titel: 'Studiedag', datum: '2026-10-14', werk: true, upd: 1 };
  assert.equal(M.werkdagVan(s, s.taken[h.id]), '2026-10-14');
  delete s.afspraken.sw;
  // de les verplaatsen: de taak verhuist mee (za → vrijdag is werkdag → do)
  M.verplaatsLes(s, 'l1', '2026-10-17');
  assert.equal(s.taken[h.id].werkdag, '2026-10-15');
  // zelf verplaatst: blijft staan als de les verschuift
  M.zetWerkdag(s, h.id, '2026-10-12');
  M.verplaatsLes(s, 'l1', '2026-10-22');
  assert.deepEqual([s.taken[h.id].werkdag, s.taken[h.id].manueel], ['2026-10-12', true]);
  M.verwijderLes(s, 'l1');
  assert.equal(s.taken[M.hoofdId('l1')].del, true);
});

test('eigen namen van oude standaardtaken (bv. LVB) gaan op in de lestaak', () => {
  const s = basis();
  s.sjablonen = { x: { id: 'x', titel: 'Kopies', upd: 1 } };
  M.zorgHoofdtaken(s); // lestaak bestaat al
  s.taken.lvb = { id: 'lvb', titel: 'LVB', lesId: 'l1', werkdag: '2026-10-11', klaar: false, upd: 1 };
  s.taken.kop = { id: 'kop', titel: 'kopies', lesId: 'l1', werkdag: null, klaar: false, upd: 1 };
  s.taken.ver = { id: 'ver', titel: 'Verbeteren', lesId: 'l1', werkdag: null, klaar: false, upd: 1 };
  assert.equal(M.heeftOpruimwerk(s), true);
  assert.equal(M.zorgHoofdtaken(s), true);
  assert.equal(M.heeftOpruimwerk(s), false);
  assert.equal(s.taken[M.hoofdId('l1')].werkdag, '2026-10-11');
  assert.equal(s.taken.lvb.del, true);
  assert.equal(s.taken.kop.del, true);
  assert.equal(s.taken.ver.del, undefined);
});

test('taak opsplitsen in blokken', () => {
  const s = basis();
  M.zorgHoofdtaken(s);
  const id = M.hoofdId('l1');
  const nieuw = M.splitsTaak(s, id, 3);
  assert.equal(nieuw.length, 2);
  assert.deepEqual([s.taken[id].deelNr, s.taken[id].deelVan, s.taken[id].hoofd], [1, 3, true]);
  assert.deepEqual(nieuw.map((t) => [t.deelNr, t.titel, t.werkdag, t.hoofd, t.lesId]), [
    [2, 'Aankoopfactuur', null, false, 'l1'],
    [3, 'Aankoopfactuur', null, false, 'l1'],
  ]);
  assert.deepEqual(M.splitsTaak(s, nieuw[0].id, 2), []); // een blok niet opnieuw splitsen
});

test('blokken van een opgesplitste taak delen één deadline', () => {
  const s = basis();
  M.zorgHoofdtaken(s);
  s.taken.c = { id: 'c', titel: 'Cursus', lesId: 'l1', werkdag: null, deadline: { datum: '2026-10-20' }, klaar: false, upd: 1 };
  const [b2, b3] = M.splitsTaak(s, 'c', 3);
  s.taken.c = { ...s.taken.c, deadline: { datum: '2026-10-21' } };
  M.deelDeadline(s, 'c');
  assert.deepEqual([s.taken[b2.id].deadline, s.taken[b3.id].deadline], [{ datum: '2026-10-21' }, { datum: '2026-10-21' }]);
  // oude, uiteengelopen gegevens: de laatst gewijzigde deadline geldt
  s.taken[b3.id] = { ...s.taken[b3.id], deadline: { datum: '2026-10-25' }, upd: Date.now() + 1000 };
  assert.equal(M.heeftOpruimwerk(s), true);
  assert.equal(M.herstelDeelDeadlines(s), true);
  assert.deepEqual(['c', b2.id].map((id) => s.taken[id].deadline.datum), ['2026-10-25', '2026-10-25']);
  assert.equal(M.heeftOpruimwerk(s), false);
});

test('deadline-sleutels heen en terug', () => {
  for (const k of M.DEADLINE_KEUZES) assert.equal(M.deadlineSleutel(M.deadlineUitSleutel(k.sleutel)), k.sleutel);
  assert.deepEqual(M.deadlineUitSleutel('datum', '2026-10-01'), { datum: '2026-10-01' });
  assert.equal(M.deadlineUitSleutel('geen'), null);
  assert.equal(M.deadlineSleutel(null), 'geen');
});

test('samenvoegen: recentste wint, verwijderingen blijven', () => {
  const a = M.leegeState();
  const b = M.leegeState();
  a.taken.t1 = { id: 't1', titel: 'oud', upd: 1 };
  b.taken.t1 = { id: 't1', titel: 'nieuw', upd: 2 };
  a.taken.t2 = { id: 't2', titel: 'enkel a', upd: 5 };
  b.taken.t3 = { id: 't3', del: true, upd: 9 };
  a.taken.t3 = { id: 't3', titel: 'nog niet gewist', upd: 3 };
  b.instellingen = { werkdagen: [1, 2], upd: 10 };
  const r = M.merge(a, b);
  assert.equal(r.taken.t1.titel, 'nieuw');
  assert.equal(r.taken.t2.titel, 'enkel a');
  assert.equal(r.taken.t3.del, true);
  assert.deepEqual(r.instellingen.werkdagen, [1, 2]);
  assert.deepEqual(M.merge(r, a), r);
  assert.deepEqual(M.merge({}, r), r);
});

test('Code.gs gebruikt dezelfde samenvoeg-regels', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const a = M.leegeState();
  const b = M.leegeState();
  a.lessen.x = { id: 'x', titel: 'a', upd: 3 };
  b.lessen.x = { id: 'x', titel: 'b', upd: 4 };
  b.dagen['2026-10-10'] = { id: '2026-10-10', werkdag: true, upd: 1 };
  a.instellingen.upd = 7;
  for (const [x, y] of [[a, b], [b, a], [{}, a], [a, {}]]) {
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.merge(x, y))), M.merge(x, y));
  }
});

test('gezamenlijke les: meerdere klassen', () => {
  const s = basis();
  s.klassen.k2 = { id: 'k2', naam: 'BKH3-K2', rooster: [2], upd: 1 };
  s.klassen.k3 = { id: 'k3', naam: 'BKH3-K3', rooster: [2], upd: 1 };
  s.lessen.l2 = { id: 'l2', klasIds: ['k2', 'k3'], titel: 'Samen', datum: '2026-10-13', upd: 1 };
  s.lessen.l3 = { id: 'l3', klasIds: ['k2'], titel: 'Enkel K2', datum: '2026-10-20', upd: 1 };
  assert.deepEqual(M.klassenVanLes(s.lessen.l1), ['k1']); // oud formaat
  assert.deepEqual(M.lessenVanKlas(s, 'k3').map((l) => l.id), ['l2']);
  assert.deepEqual(M.lessenVanKlas(s, 'k2').map((l) => l.id), ['l2', 'l3']);
  assert.equal(M.volgendeLesNa(s, ['k2', 'k3'], '2026-10-13'), '2026-10-20');
  assert.equal(M.volgendeLesNa(s, ['k3'], '2026-10-13'), '2026-10-20'); // rooster dinsdag
  M.verwijderKlas(s, 'k3');
  assert.deepEqual(s.lessen.l2.klasIds, ['k2']);
  M.verwijderKlas(s, 'k2');
  assert.equal(s.lessen.l2.del, true);
});

test('groepsnaam', () => {
  assert.equal(M.groepNaam(['BKH3-K2', 'BKH3-K3']), 'BKH3-K2 + K3');
  assert.equal(M.groepNaam(['BKH4']), 'BKH4');
  assert.equal(M.groepNaam(['BKH4', 'ECO5']), 'BKH4 + ECO5');
  assert.equal(M.groepNaam(['5 ECO', '5 HUM']), '5 ECO + HUM');
});

test('opleiding: stukken volgen de einddeadline', () => {
  const s = basis();
  s.opdrachten.o1 = { id: 'o1', titel: 'Portfolio', deadline: '2026-11-20', upd: 1 };
  const stukken = M.maakStukken(s, 'o1', ['Lezen', 'Schrijven', 'Nalezen']);
  assert.deepEqual(stukken.map((t) => t.volg), [1, 2, 3]);
  assert.equal(M.domeinVan(stukken[0]), 'opleiding');
  assert.equal(M.domeinVan({ lesId: 'l1' }), 'school');
  assert.equal(M.domeinVan({ domein: 'opleiding' }), 'opleiding');
  assert.equal(M.deadlineVan(s, stukken[0]), '2026-11-20');
  s.opdrachten.o1.deadline = '2026-11-27';
  assert.equal(M.deadlineVan(s, stukken[0]), '2026-11-27');
  assert.equal(M.deadlineSleutel({ eind: true }), 'eind');
  M.verwijderOpdracht(s, 'o1');
  assert.equal(M.takenVanOpdracht(s, 'o1').length, 0);
});

test('stukken verdelen over vrije dagen', () => {
  const s = basis(); // werkdagen di + vr
  s.opdrachten.o1 = { id: 'o1', titel: 'Portfolio', deadline: '2026-10-24', upd: 1 };
  const stukken = M.maakStukken(s, 'o1', ['a', 'b', 'c', 'd']);
  stukken[1].werkdag = '2026-10-10'; // al ingepland: blijft
  stukken[3].deadline = { datum: '2026-10-12' }; // tussendeadline
  const plan = M.verdeelOpdracht(s, 'o1', '2026-10-07');
  assert.deepEqual(plan.map((p) => p.taak.titel), ['a', 'c', 'd']);
  for (const p of plan) assert.equal(M.isWerkdag(s, p.datum), false, p.datum);
  assert.equal(plan[0].datum, '2026-10-08'); // morgen
  assert.ok(plan[2].datum <= '2026-10-12');
  assert.ok(plan.every((p) => p.datum < '2026-10-24'));
  // deadline al voorbij of morgen: alles op de eerstvolgende dag
  s.opdrachten.o1.deadline = '2026-10-08';
  assert.ok(M.verdeelOpdracht(s, 'o1', '2026-10-07').every((p) => p.datum === '2026-10-08'));
});

test('samenvoegen neemt nieuwe collecties vanzelf mee', () => {
  const a = { taken: {}, instellingen: { upd: 1 } };
  const b = { vakken: { v1: { id: 'v1', naam: 'Didactiek', upd: 2 } }, nieuw: { x: { id: 'x', upd: 1 } } };
  const r = M.merge(a, b);
  assert.equal(r.vakken.v1.naam, 'Didactiek');
  assert.equal(r.nieuw.x.id, 'x');
  assert.deepEqual(M.merge(r, { vakken: { v1: { id: 'v1', naam: 'Oud', upd: 1 } } }).vakken.v1.naam, 'Didactiek');
});

test('afspraken uit de agenda: tonen en #sw als werkdag', () => {
  const s = basis();
  s.afspraken.a1 = { id: 'a1', titel: 'Tandarts', datum: '2026-10-14', tijd: '16:30', werk: false, upd: 1 };
  s.afspraken.a2 = { id: 'a2', titel: 'Studiedag', datum: '2026-10-14', eindDatum: '2026-10-14', werk: true, upd: 1 };
  s.afspraken.a3 = { id: 'a3', del: true, upd: 2 };
  assert.deepEqual(M.afsprakenOp(s, '2026-10-14').map((a) => a.id), ['a2', 'a1']);
  assert.equal(M.isWerkdag(s, '2026-10-14'), true);
  // lesvoorbereiding voor les op do 15/10 schuift naar maandag (wo = #sw, di = vaste werkdag)
  assert.equal(M.deadlineVan(s, taak({ deadline: { rel: -1, nietOpWerkdag: true } })), '2026-10-12');
  // manuele aanduiding wint
  s.dagen['2026-10-14'] = { id: '2026-10-14', werkdag: false, upd: 1 };
  assert.equal(M.isWerkdag(s, '2026-10-14'), false);
});

test('Code.gs leest enkel afspraken met #s of #sw', () => {
  const dag = (d, u = 0, m = 0) => new Date(2026, 9, d, u, m);
  const ev = (titel, beschrijving, start, einde, heleDag = false, id = titel) => ({
    getId: () => id,
    getTitle: () => titel,
    getDescription: () => beschrijving,
    isAllDayEvent: () => heleDag,
    getStartTime: () => start,
    getEndTime: () => einde,
    getAllDayStartDate: () => start,
    getAllDayEndDate: () => einde,
  });
  const fmt = (d, tz, p) => {
    const z = (n) => String(n).padStart(2, '0');
    return p === 'HH:mm' ? `${z(d.getHours())}:${z(d.getMinutes())}` : `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };
  const agenda = [
    ev('Tandarts #s', '', dag(14, 16, 30), dag(14, 17)),
    ev('Poetsvrouw', '', dag(14, 9), dag(14, 12)),
    ev('Studiedag', 'meenemen: laptop #sw', dag(21), dag(22), true),
    ev('Uitstap #s', '', dag(23), dag(25), true),
    ev('#school feest', '', dag(15, 10), dag(15, 11)),
  ];
  const opleiding = [ev('Seminarie didactiek', '', dag(16, 18), dag(16, 21)), ev('Tandarts #s', '', dag(14, 16, 30), dag(14, 17))];
  const ctx = {
    Date,
    Session: { getScriptTimeZone: () => 'Europe/Brussels' },
    Utilities: { formatDate: fmt },
    CalendarApp: {
      getDefaultCalendar: () => ({ getTimeZone: () => 'Europe/Brussels' }),
      getAllCalendars: () => [
        { getId: () => 'hoofd@x', getName: () => 'Hoofdagenda', getEvents: () => [] },
        { getId: () => 'zot@x', getName: () => 'De  zottekes ', getEvents: () => agenda },
        { getId: () => 'opl@x', getName: () => 'Opleiding', getEvents: () => opleiding },
      ],
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const oud = { weg_2026: { id: 'weg_2026', titel: 'Oude afspraak', datum: '2026-10-01', upd: 1 } };
  const res = JSON.parse(JSON.stringify(ctx.leesAgenda_(oud)));
  assert.deepEqual([res.info.agendas, res.info.aantal, res.info.fout], [['De  zottekes '], 3, null]);
  const r = res.afspraken;
  const zichtbaar = Object.values(r).filter((a) => !a.del);
  assert.deepEqual(zichtbaar.map((a) => a.titel).sort(), ['Studiedag', 'Tandarts', 'Uitstap']);
  const tandarts = zichtbaar.find((a) => a.titel === 'Tandarts');
  assert.equal(tandarts.datum, '2026-10-14');
  assert.equal(tandarts.tijd, '16:30');
  assert.equal(tandarts.werk, false);
  const studiedag = zichtbaar.find((a) => a.titel === 'Studiedag');
  assert.deepEqual([studiedag.datum, studiedag.eindDatum, studiedag.werk, studiedag.tijd], ['2026-10-21', '2026-10-21', true, null]);
  const uitstap = zichtbaar.find((a) => a.titel === 'Uitstap');
  assert.deepEqual([uitstap.datum, uitstap.eindDatum], ['2026-10-23', '2026-10-24']);
  assert.equal(r.weg_2026.del, true); // niet meer in de agenda
  // tweede keer inlezen: niets verandert, dus geen nieuwe upd
  const r2 = JSON.parse(JSON.stringify(ctx.leesAgenda_(r))).afspraken;
  assert.equal(r2[tandarts.id].upd, tandarts.upd);
  // agenda niet gevonden: niets wissen, wel een melding
  vm.runInContext('AGENDA_NAMEN.splice(0, 1, "Bestaat niet")', ctx);
  const weg = JSON.parse(JSON.stringify(ctx.leesAgenda_(r)));
  assert.deepEqual(weg.afspraken, r);
  assert.match(weg.info.fout, /niet gevonden\. Het script ziet: Hoofdagenda, De  zottekes/);
});

test('Code.gs leest alle afspraken uit een aangevinkte extra agenda', () => {
  const ev = (titel, d, u, id = titel) => ({
    getId: () => id,
    getTitle: () => titel,
    getDescription: () => '',
    isAllDayEvent: () => false,
    getStartTime: () => new Date(2026, 9, d, u),
    getEndTime: () => new Date(2026, 9, d, u + 2),
  });
  const fmt = (d, tz, p) => {
    const z = (n) => String(n).padStart(2, '0');
    return p === 'HH:mm' ? `${z(d.getHours())}:${z(d.getMinutes())}` : `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };
  const kal = (id, naam, evs) => ({ getId: () => id, getName: () => naam, getEvents: () => evs });
  const ctx = {
    Date,
    Session: { getScriptTimeZone: () => 'Europe/Brussels' },
    Utilities: { formatDate: fmt },
    CalendarApp: {
      getDefaultCalendar: () => ({ getTimeZone: () => 'Europe/Brussels' }),
      getAllCalendars: () => [
        kal('zot@x', 'De Zottekes', [ev('Tandarts #s', 14, 16), ev('Poetsvrouw', 14, 9), ev('Seminarie #s', 16, 18, 'sem')]),
        kal('opl@x', 'Opleiding', [ev('Seminarie', 16, 18, 'sem'), ev('Intervisie', 20, 9), ev('Stagedag #sw', 22, 8)]),
        kal('fees@x', 'Feestdagen', [ev('Allerheiligen', 1, 0)]),
      ],
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const zonder = JSON.parse(JSON.stringify(ctx.leesAgenda_({})));
  assert.deepEqual(zonder.info.alle, [{ id: 'opl@x', naam: 'Opleiding' }, { id: 'fees@x', naam: 'Feestdagen' }]);
  assert.deepEqual(Object.values(zonder.afspraken).map((a) => a.titel).sort(), ['Seminarie', 'Tandarts']);

  const res = JSON.parse(JSON.stringify(ctx.leesAgenda_(zonder.afspraken, ['opl@x'])));
  assert.deepEqual([res.info.extra, res.info.aantal, res.info.aantalExtra], [['Opleiding'], 2, 2]);
  const r = Object.values(res.afspraken).filter((a) => !a.del);
  assert.deepEqual(r.map((a) => `${a.titel}|${a.agenda || ''}|${a.werk}`).sort(), [
    'Intervisie|Opleiding|false',
    'Seminarie||false', // ook in de hoofdagenda: één keer, zonder agendanaam
    'Stagedag|Opleiding|true',
    'Tandarts||false',
  ]);
  // weer uitgevinkt: de afspraken uit die agenda verdwijnen
  const weg = JSON.parse(JSON.stringify(ctx.leesAgenda_(res.afspraken, [])));
  assert.deepEqual(Object.values(weg.afspraken).filter((a) => !a.del).map((a) => a.titel).sort(), ['Seminarie', 'Tandarts']);
});

test('Code.gs bewaart op Drive met enkel eigen bestanden (nagemaakte Drive-API)', () => {
  const bestanden = {}; // id → { name, parents, trashed, inhoud }
  let teller = 0;
  const props = {};
  const antwoord = (code, tekst = '') => ({ getResponseCode: () => code, getContentText: () => tekst });
  const UrlFetchApp = {
    fetch(url, p) {
      const u = new URL(url);
      const delen = u.pathname.split('/').filter(Boolean); // [drive|upload, ...]
      const isUpload = delen[0] === 'upload';
      const id = isUpload ? delen[4] : delen[3];
      const actie = delen[4] === 'copy' ? 'copy' : null;
      const body = p.payload && p.contentType === 'application/json' && !isUpload ? JSON.parse(p.payload) : null;
      if (p.method === 'post' && actie === 'copy') {
        const nieuw = 'f' + ++teller;
        bestanden[nieuw] = { ...bestanden[id], ...body };
        return antwoord(200, JSON.stringify({ id: nieuw }));
      }
      if (p.method === 'post') {
        const nieuw = 'f' + ++teller;
        bestanden[nieuw] = { ...body, trashed: false, inhoud: '' };
        return antwoord(200, JSON.stringify({ id: nieuw }));
      }
      if (p.method === 'get' && !id) {
        const q = u.searchParams.get('q');
        const map = q.match(/'([^']+)' in parents/)[1];
        const files = Object.entries(bestanden)
          .filter(([, f]) => !f.trashed && (f.parents || []).includes(map) && f.name.startsWith('saga-backup-'))
          .map(([i, f]) => ({ id: i, name: f.name }));
        return antwoord(200, JSON.stringify({ files }));
      }
      if (!bestanden[id]) return antwoord(404, 'niet gevonden');
      if (p.method === 'get' && u.searchParams.get('alt') === 'media') return antwoord(200, bestanden[id].inhoud);
      if (p.method === 'get') return antwoord(200, JSON.stringify({ id, trashed: bestanden[id].trashed }));
      if (p.method === 'patch' && isUpload) {
        bestanden[id].inhoud = p.payload;
        return antwoord(200, '{}');
      }
      if (p.method === 'patch') {
        Object.assign(bestanden[id], body);
        return antwoord(200, '{}');
      }
      throw new Error('onverwacht ' + p.method + ' ' + url);
    },
  };
  let dag = 1;
  const ctx = {
    UrlFetchApp,
    ScriptApp: { getOAuthToken: () => 'token' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }) },
    Utilities: { formatDate: () => `2026-10-${String(dag).padStart(2, '0')}` },
    Session: { getScriptTimeZone: () => 'Europe/Brussels' },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);

  const id = ctx.haalBestand_();
  assert.equal(bestanden[props.SAGA_MAP].mimeType, 'application/vnd.google-apps.folder');
  assert.deepEqual(bestanden[id].parents, [props.SAGA_MAP]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.leesData_(id))), {});
  ctx.schrijfBestand_(id, '{"taken":{}}');
  assert.equal(ctx.haalBestand_(), id); // bestaat al
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.leesData_(id))), { taken: {} });

  // 16 dagen back-ups: enkel de laatste 14 blijven
  for (dag = 1; dag <= 16; dag++) ctx.maakDagelijkseBackup_(id);
  const backups = Object.values(bestanden).filter((f) => f.name.startsWith('saga-backup-'));
  assert.equal(backups.filter((f) => !f.trashed).length, 14);
  assert.equal(backups.find((f) => f.name === 'saga-backup-2026-10-01.json').trashed, true);
  dag = 16;
  ctx.maakDagelijkseBackup_(id); // zelfde dag: geen extra kopie
  assert.equal(Object.values(bestanden).filter((f) => f.name.startsWith('saga-backup-')).length, 16);

  // bestand in de prullenbak of onbereikbaar: er komt een nieuw
  bestanden[id].trashed = true;
  assert.notEqual(ctx.haalBestand_(), id);
});

test('timer: starten, pauzeren en later verder doen telt op', () => {
  const s = basis();
  s.taken.t = taak({ id: 't' });
  M.startTimer(s, 't', 1000);
  assert.equal(M.bestedeTijd(s.taken.t, 61000), 60000);
  M.stopTimer(s, 't', 61000);
  assert.equal(s.taken.t.gestart, null);
  assert.equal(M.bestedeTijd(s.taken.t, 999999), 60000); // gepauzeerd: telt niet verder
  M.startTimer(s, 't', 100000);
  M.stopTimer(s, 't', 130000);
  assert.equal(s.taken.t.tijd, 90000);
});

test('timer: maar één tegelijk, afvinken stopt hem', () => {
  const s = basis();
  s.taken.a = taak({ id: 'a' });
  s.taken.b = taak({ id: 'b' });
  M.startTimer(s, 'a', 1000);
  M.startTimer(s, 'b', 6000);
  assert.equal(s.taken.a.gestart, null);
  assert.equal(s.taken.a.tijd, 5000);
  assert.equal(M.lopendeTaak(s).id, 'b');
  M.zetKlaar(s, 'b', true, 9000);
  assert.equal(s.taken.b.klaar, true);
  assert.equal(s.taken.b.tijd, 3000);
  assert.equal(M.lopendeTaak(s), null);
  M.zetKlaar(s, 'b', false);
  assert.equal(s.taken.b.tijd, 3000); // terug open: tijd blijft
});

test('timer: tijd zelf aanpassen en nieuwe blokken beginnen op nul', () => {
  const s = basis();
  s.taken.t = taak({ id: 't', titel: 'Groot werk' });
  M.startTimer(s, 't', 1000);
  M.zetTijd(s, 't', 30 * 60000, 7200000); // timer 2 uur vergeten: zet op 30 min
  assert.equal(M.bestedeTijd(s.taken.t, 7200000 + 60000), 31 * 60000); // loopt verder
  const [blok] = M.splitsTaak(s, 't', 2);
  assert.equal(blok.tijd, 0);
  assert.equal(blok.gestart, null);
});

test('tijd tonen en inlezen', () => {
  assert.equal(M.klokTekst(0), '0:00');
  assert.equal(M.klokTekst(65000), '1:05');
  assert.equal(M.klokTekst(3725000), '1:02:05');
  assert.equal(M.duurTekst(30000), '< 1 min');
  assert.equal(M.duurTekst(25 * 60000), '25 min');
  assert.equal(M.duurTekst(65 * 60000), '1u 05m');
  assert.equal(M.leesMinuten('45'), 45);
  assert.equal(M.leesMinuten('1:30'), 90);
  assert.equal(M.leesMinuten('1u30'), 90);
  assert.equal(M.leesMinuten('2u'), 120);
  assert.equal(M.leesMinuten('12,5'), 12.5);
  assert.equal(M.leesMinuten('abc'), null);
});

test('losse taken per onderwerp; onderwerp verwijderen houdt de taken', () => {
  const s = basis();
  s.onderwerpen.o1 = { id: 'o1', naam: 'Stage', kleur: '#5bbba4', upd: 1 };
  s.taken.a = taak({ id: 'a', lesId: null, onderwerpId: 'o1' });
  s.taken.b = taak({ id: 'b', lesId: null });
  s.taken.c = taak({ id: 'c', lesId: null, domein: 'opleiding' });
  s.taken.d = taak({ id: 'd' }); // bij een les
  assert.deepEqual(M.losseTaken(s, 'school').map((t) => t.id).sort(), ['a', 'b']);
  assert.deepEqual(M.losseTaken(s, 'opleiding').map((t) => t.id), ['c']);
  assert.deepEqual(M.takenVanOnderwerp(s, 'o1').map((t) => t.id), ['a']);
  assert.deepEqual(M.takenVanOnderwerp(s, null).map((t) => t.id), ['b']);
  M.verwijderOnderwerp(s, 'o1');
  assert.equal(s.taken.a.del, undefined);
  assert.deepEqual(M.takenVanOnderwerp(s, null).map((t) => t.id).sort(), ['a', 'b']);
});

test('to do bij een klas zonder onderwerp staat niet bij "Zonder onderwerp"', () => {
  const s = basis();
  s.onderwerpen.o1 = { id: 'o1', naam: 'Stage', kleur: '#5bbba4', upd: 1 };
  s.taken.a = taak({ id: 'a', lesId: null, klasIds: ['k1'] }); // bv. cursus schrijven
  s.taken.b = taak({ id: 'b', lesId: null, klasIds: ['k1'], onderwerpId: 'o1' });
  s.taken.c = taak({ id: 'c', lesId: null, klasIds: ['weg'] }); // klas bestaat niet (meer)
  s.opdrachten.g = { id: 'g', titel: 'Cursus', domein: 'school', klasIds: ['k1'], upd: 1 };
  assert.deepEqual(M.takenVanOnderwerp(s, null).map((t) => t.id), ['c']);
  assert.deepEqual(M.takenVanOnderwerp(s, 'o1').map((t) => t.id), ['b']);
  assert.equal(M.opdrachtenVanOnderwerp(s, null).length, 0);
});

test('vroeger opgesplitste losse taak wordt een opdracht met stukken', () => {
  const s = basis();
  M.zorgHoofdtaken(s);
  s.onderwerpen.o1 = { id: 'o1', naam: 'Stage', kleur: '#5bbba4', upd: 1 };
  s.taken.a = taak({ id: 'a', lesId: null, titel: 'Stageverslag', onderwerpId: 'o1', deadline: { datum: '2026-11-01' }, werkdag: '2026-10-12', tijd: 60000 });
  M.splitsTaak(s, 'a', 2);
  M.zetKlaar(s, 'a', true);
  assert.equal(M.heeftOpruimwerk(s), true);
  assert.equal(M.losseBlokkenNaarStukken(s), true);
  const opd = s.opdrachten['g-a'];
  assert.deepEqual([opd.titel, opd.domein, opd.onderwerpId, opd.deadline], ['Stageverslag', 'school', 'o1', '2026-11-01']);
  const stukken = M.takenVanOpdracht(s, 'g-a');
  assert.deepEqual(stukken.map((t) => [t.titel, t.klaar, t.domein]), [['Deel 1', true, 'school'], ['Deel 2', false, 'school']]);
  assert.equal(stukken[0].werkdag, '2026-10-12');
  assert.equal(stukken[0].tijd, 60000);
  assert.equal(stukken[0].deelGroep, undefined);
  assert.equal(M.deadlineVan(s, stukken[1]), '2026-11-01');
  assert.deepEqual(M.opdrachtenVanOnderwerp(s, 'o1').map((o) => o.id), ['g-a']);
  assert.deepEqual(M.opdrachtenVanVak(s, null), []); // niet bij de opleiding
  assert.equal(M.domeinVan(stukken[0]), 'school');
  assert.equal(M.heeftOpruimwerk(s), false);
});

test('losse taak opdelen in stukken: wordt een opdracht met de taak als eerste stuk', () => {
  const s = basis();
  s.onderwerpen.o1 = { id: 'o1', naam: 'Stage', kleur: '#5bbba4', upd: 1 };
  s.taken.a = taak({ id: 'a', lesId: null, titel: 'Stageverslag', onderwerpId: 'o1', deadline: { datum: '2026-11-01' }, werkdag: '2026-10-12' });
  const opd = M.maakOpdrachtVanTaak(s, 'a');
  assert.deepEqual([opd.titel, opd.domein, opd.onderwerpId, opd.deadline], ['Stageverslag', 'school', 'o1', '2026-11-01']);
  assert.equal(s.taken.a.opdrachtId, opd.id);
  assert.equal(s.taken.a.werkdag, '2026-10-12');
  const [nieuw] = M.maakStukken(s, opd.id, ['Nalezen']);
  assert.equal(nieuw.domein, 'school');
  assert.deepEqual(M.takenVanOpdracht(s, opd.id).map((t) => t.titel), ['Stageverslag', 'Nalezen']);
  assert.equal(M.takenVanOnderwerp(s, 'o1').length, 0); // geen losse taak meer
  M.verwijderOnderwerp(s, 'o1');
  assert.equal(s.opdrachten[opd.id].onderwerpId, null);
  assert.equal(s.opdrachten[opd.id].del, undefined);
});

// ---------- archief, rooster, vakanties, tijd ----------

test('overzicht: doorlopende weken, ook over de maandgrens', () => {
  const r = M.venster('2026-10-29'); // donderdag
  assert.equal(r.van, '2026-10-19'); // maandag van vorige week
  assert.equal(r.tot, '2026-11-29'); // zondag, 4 weken na deze week
  assert.equal(r.dagen.length, 6 * 7);
  assert.ok(r.dagen.includes('2026-11-20'));
  const meer = M.venster('2026-10-29', 3, 20);
  assert.equal(meer.van, '2026-10-05');
  assert.equal(meer.dagen.length, 24 * 7);
  assert.equal(M.weekdag(meer.tot), 0);
});

test('verwijderen bewaart de gegevens en stopt de timer', () => {
  const s = basis();
  s.taken.t = taak({ id: 't', tijd: 60000, gestart: Date.now() - 60000 });
  M.wis(s, 'taken', 't');
  assert.equal(s.taken.t.del, true);
  assert.equal(s.taken.t.titel, 'x');
  assert.equal(s.taken.t.gestart, null);
  assert.ok(s.taken.t.tijd >= 120000);
  assert.equal(M.lijst(s, 'taken').length, 0);
});

test('index tijdens het tekenen geeft hetzelfde als zonder', () => {
  const s = basis();
  M.zorgHoofdtaken(s);
  s.afspraken.a = { id: 'a', titel: 'Kamp', datum: '2026-10-13', eindDatum: '2026-10-15', werk: true, upd: 1 };
  const zonder = [M.takenVanLes(s, 'l1').length, M.afsprakenOp(s, '2026-10-14').length, M.lessenVanKlas(s, 'k1').length, M.isWerkdag(s, '2026-10-14')];
  const met = M.metCache(() => [M.takenVanLes(s, 'l1').length, M.afsprakenOp(s, '2026-10-14').length, M.lessenVanKlas(s, 'k1').length, M.isWerkdag(s, '2026-10-14')]);
  assert.deepEqual(met, zonder);
  assert.deepEqual(zonder, [1, 1, 1, true]);
});

test('werkdag wisselen houdt rekening met #sw', () => {
  const s = basis();
  s.afspraken.sw = { id: 'sw', titel: 'Studiedag', datum: '2026-10-14', werk: true, upd: 1 }; // woensdag
  M.wisselWerkdag(s, '2026-10-14');
  assert.equal(M.isWerkdag(s, '2026-10-14'), false);
  M.wisselWerkdag(s, '2026-10-14');
  assert.equal(M.isWerkdag(s, '2026-10-14'), true);
  assert.equal(s.dagen['2026-10-14'].werkdag, null);
});

test('taak opslaan: lestaak manueel of terug standaard, afvinken stopt timer', () => {
  const s = basis();
  M.zorgHoofdtaken(s);
  const id = M.hoofdId('l1');
  M.bewaarTaak(s, id, { werkdag: '2026-10-11' });
  assert.equal(s.taken[id].manueel, true);
  M.bewaarTaak(s, id, { werkdag: null });
  assert.equal(s.taken[id].werkdag, '2026-10-14');
  assert.equal(s.taken[id].manueel, false);
  M.startTimer(s, id);
  M.bewaarTaak(s, id, { klaar: true });
  assert.equal(s.taken[id].gestart, null);
  const los = M.bewaarTaak(s, null, { titel: 'Toets', klasIds: ['k1'] }, { domein: 'school' });
  assert.deepEqual(M.klassenVanTaak(s, los), ['k1']);
  const naarLes = M.bewaarTaak(s, los.id, { lesId: 'l1' });
  assert.equal(naarLes.klasIds, undefined);
});

test('les opslaan: nieuwe les krijgt taak, verplaatste les neemt ze mee', () => {
  const s = basis();
  const les = M.bewaarLes(s, null, { klasIds: ['k1'], titel: 'Nieuw', datum: '2026-10-22' });
  assert.equal(s.taken[M.hoofdId(les.id)].werkdag, '2026-10-21');
  M.bewaarLes(s, les.id, { klasIds: ['k1'], titel: 'Nieuw', datum: '2026-10-29' });
  assert.equal(s.taken[M.hoofdId(les.id)].werkdag, '2026-10-28');
});

test('vakantie en afwezigheid: waarschuwing bij een les', () => {
  const s = basis();
  s.klassen.k2 = { id: 'k2', naam: 'BKH3', rooster: [4], upd: 1 };
  s.afwezigheden.v = { id: 'v', reden: 'Herfstvakantie', van: '2026-10-26', tot: '2026-11-08', klasIds: [], upd: 1 };
  s.afwezigheden.u = { id: 'u', reden: 'Uitstap', van: '2026-10-15', tot: '2026-10-15', klasIds: ['k2'], upd: 1 };
  assert.equal(M.lesWaarschuwing(s, s.lessen.l1), null); // uitstap is van een andere klas
  s.lessen.l1.klasIds = ['k1', 'k2'];
  assert.equal(M.lesWaarschuwing(s, s.lessen.l1).reden, 'Uitstap');
  assert.equal(M.lesWaarschuwing(s, { klasIds: ['k1'], datum: '2026-10-29' }).reden, 'Herfstvakantie');
  assert.equal(M.isLesmoment(s, 'k1', '2026-10-29'), false);
  assert.equal(M.isLesmoment(s, 'k1', '2026-11-09'), true);
});

test('lessen inplannen volgens rooster, vakantie overslaan', () => {
  const s = basis(); // k1: ma en do, les l1 op do 15/10
  s.afwezigheden.v = { id: 'v', reden: 'Herfstvakantie', van: '2026-10-26', tot: '2026-11-08', upd: 1 };
  for (let i = 2; i <= 5; i++) s.lessen['l' + i] = { id: 'l' + i, klasIds: ['k1'], titel: 'Les ' + i, datum: null, volg: i, upd: 1 };
  const plan = M.planVolgensRooster(s, 'k1', '2026-10-10');
  assert.deepEqual(
    plan.map((p) => [p.les.id, p.datum]),
    [['l2', '2026-10-19'], ['l3', '2026-10-22'], ['l4', '2026-11-09'], ['l5', '2026-11-12']]
  );
});

test('reeks opschuiven: één lesmoment later of vroeger', () => {
  const s = basis();
  s.lessen.l2 = { id: 'l2', klasIds: ['k1'], titel: 'Twee', datum: '2026-10-19', volg: 2, upd: 1 };
  s.lessen.l3 = { id: 'l3', klasIds: ['k1'], titel: 'Drie', datum: '2026-10-22', volg: 3, upd: 1 };
  M.zorgHoofdtaken(s);
  const later = M.reeksPlan(s, 'l2', 'k1', 1);
  assert.deepEqual(later.map((p) => p.datum), ['2026-10-22', '2026-10-26']);
  assert.equal(M.reeksPlan(s, 'l2', 'k1', -1), null); // do 15/10 is bezet door l1
  M.pasLesplanToe(s, later);
  assert.equal(s.lessen.l3.datum, '2026-10-26');
  assert.equal(s.taken[M.hoofdId('l3')].werkdag, '2026-10-25');
  const terug = M.reeksPlan(s, 'l2', 'k1', -1);
  assert.deepEqual(terug.map((p) => p.datum), ['2026-10-19', '2026-10-22']);
});

test('ongedaan maken zet alles terug, ook verwijderde lessen', () => {
  const s = basis();
  M.zorgHoofdtaken(s);
  const foto = M.momentopname(s);
  M.verwijderLes(s, 'l1');
  M.zet(s, 'taken', { id: 'nieuw', titel: 'nieuw' });
  M.zetTerug(s, foto);
  assert.equal(M.lijst(s, 'lessen').length, 1);
  assert.equal(M.takenVanLes(s, 'l1').length, 1);
  assert.equal(s.taken.nieuw.del, true);
});

test('back-up terugzetten: back-up wint, nieuwere dingen verdwijnen', () => {
  const s = basis();
  const backup = JSON.parse(JSON.stringify(s));
  M.wis(s, 'lessen', 'l1');
  M.zet(s, 'taken', { id: 'later', titel: 'later' });
  M.herstelNaar(s, backup);
  assert.equal(M.lijst(s, 'lessen').length, 1);
  assert.equal(s.taken.later.del, true);
  assert.ok(M.merge(backup, s).lessen.l1.upd > 1);
});

test('archief: oude, afgewerkte dingen verdwijnen van het toestel, lessen en taken samen', () => {
  const v = '2026-12-15';
  const nu = new Date(2026, 11, 15).getTime();
  const s = basis(); // les l1 op 15/10
  s.lessen.nieuw = { id: 'nieuw', klasIds: ['k1'], titel: 'Nieuw', datum: '2026-12-01', upd: 1 };
  s.lessen.zonder = { id: 'zonder', klasIds: ['k1'], titel: 'Zonder datum', datum: null, upd: 1 };
  M.zorgHoofdtaken(s);
  const h = M.hoofdId('l1');
  for (const t of Object.values(s.taken)) t.upd = 1;
  s.taken[h].klaar = true;
  s.taken.open = { id: 'open', titel: 'Open, oud', werkdag: '2026-09-01', klaar: false, upd: 1 };
  s.taken.af = { id: 'af', titel: 'Af, oud', werkdag: '2026-09-01', klaar: true, upd: 1 };
  s.taken.afRecent = { id: 'afRecent', titel: 'Af, net gewijzigd', werkdag: '2026-09-01', klaar: true, upd: nu - 1000 };
  s.taken.weg = { id: 'weg', del: true, upd: 1 };
  s.afspraken.oud = { id: 'oud', titel: 'x', datum: '2026-10-01', upd: nu };
  s.dagen['2026-10-01'] = { id: '2026-10-01', werkdag: true, upd: 1 };
  s.afwezigheden.herfst = { id: 'herfst', van: '2026-10-26', tot: '2026-11-08', upd: 1 };
  s.opdrachten.o = { id: 'o', titel: 'Oud', deadline: '2026-10-01', upd: 1 };
  s.taken.st = { id: 'st', titel: 'stuk', opdrachtId: 'o', klaar: true, werkdag: '2026-09-20', upd: 1 };
  s.opdrachten.o2 = { id: 'o2', titel: 'Oud maar open', deadline: '2026-10-01', upd: 1 };
  s.taken.st2 = { id: 'st2', titel: 'open stuk', opdrachtId: 'o2', klaar: false, upd: 1 };
  s.taken.st3 = { id: 'st3', titel: 'af stuk', opdrachtId: 'o2', klaar: true, werkdag: '2026-09-20', upd: 1 };

  const r = M.actief(s, v, nu);
  assert.equal(r.lessen.l1, undefined);
  assert.equal(r.taken[h], undefined);
  assert.ok(r.lessen.nieuw && r.lessen.zonder);
  assert.ok(r.taken.open && r.taken.afRecent);
  assert.equal(r.taken.af, undefined);
  assert.equal(r.taken.weg, undefined);
  assert.equal(r.afspraken.oud, undefined);
  assert.equal(r.dagen['2026-10-01'], undefined);
  assert.equal(r.afwezigheden.herfst, undefined);
  assert.equal(r.opdrachten.o, undefined);
  assert.equal(r.taken.st, undefined);
  assert.ok(r.opdrachten.o2 && r.taken.st2 && r.taken.st3); // open stuk houdt de opdracht en al haar stukken
  assert.ok(r.klassen.k1 && r.instellingen);
  assert.equal(M.zorgHoofdtaken(r), false); // er wordt geen lestaak opnieuw gemaakt

  // een open taak bij een oude les houdt de les en de lestaak vast
  s.taken.verb = { id: 'verb', titel: 'Verbeteren', lesId: 'l1', klaar: false, upd: 1 };
  const r2 = M.actief(s, v, nu);
  assert.ok(r2.lessen.l1 && r2.taken[h] && r2.taken.verb);

  // nog niet doorgestuurd: blijft
  assert.ok(M.actief(s, v, nu, 0).taken.af);
});

test('tijdrapport per klas, soort en maand', () => {
  const s = basis();
  s.onderwerpen.st = { id: 'st', naam: 'Stage', kleur: '#000', upd: 1 };
  s.vakken.d = { id: 'd', naam: 'Didactiek', kleur: '#f00', upd: 1 };
  s.opdrachten.p = { id: 'p', titel: 'Portfolio', vakId: 'd', deadline: '2026-11-10', upd: 1 };
  s.lessen.l2 = { id: 'l2', klasIds: ['k1'], titel: 'Twee', datum: '2026-10-22', upd: 1 };
  s.taken.a = { id: 'a', lesId: 'l1', hoofd: true, titel: '', werkdag: '2026-10-14', tijd: 3600000, upd: 1 };
  s.taken.b = { id: 'b', lesId: 'l2', hoofd: true, titel: '', werkdag: '2026-10-21', tijd: 1800000, upd: 1 };
  s.taken.c = { id: 'c', lesId: 'l1', titel: 'Verbeteren toets', werkdag: '2026-10-20', tijd: 600000, upd: 1 };
  s.taken.d = { id: 'd', titel: 'Stageverslag lezen', onderwerpId: 'st', werkdag: '2026-11-02', tijd: 900000, upd: 1 };
  s.taken.e = { id: 'e', titel: 'Hfst 1', opdrachtId: 'p', domein: 'opleiding', deadline: { eind: true }, tijd: 1200000, upd: 1 };
  s.taken.f = { id: 'f', titel: 'Oud', werkdag: '2025-10-01', tijd: 999999, upd: 1 };
  const r = M.tijdRapport(s, M.schooljaarStart('2026-10-15'), '2027-08-31');
  assert.equal(M.schooljaarStart('2026-10-15'), '2026-09-01');
  assert.equal(M.schooljaarStart('2027-03-01'), '2026-09-01');
  assert.equal(r.totaal, 3600000 + 1800000 + 600000 + 900000 + 1200000);
  assert.equal(r.opleiding, 1200000);
  const klas = r.groepen.find((g) => g.naam === 'BKH4');
  assert.equal(klas.soorten.les, 5400000);
  assert.equal(klas.soorten.verbeteren, 600000);
  assert.equal(klas.perLes, 2700000);
  assert.ok(r.groepen.find((g) => g.naam === 'Stage'));
  assert.ok(r.groepen.find((g) => g.naam === 'Didactiek'));
  assert.deepEqual(r.maanden.map((m) => m.maand), ['2026-10', '2026-11']);
  assert.equal(r.top[0].titel, 'Aankoopfactuur');
  assert.equal(r.top[0].ms, 4200000);
});

test('Code.gs: zelfde archiefregels; sync geeft enkel actieve data, "alles" de volledige', () => {
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'SAGA_TOKEN' ? 'geheim' : null), setProperty: () => {} }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }), MimeType: { JSON: 'json' } },
    Utilities: { formatDate: () => '2026-12-15' },
    Session: { getScriptTimeZone: () => 'Europe/Brussels' },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const s = basis();
  M.zorgHoofdtaken(s);
  for (const t of Object.values(s.taken)) Object.assign(t, { klaar: true, upd: 1 });
  s.taken.open = { id: 'open', titel: 'open', klaar: false, upd: 1 };
  const nu = new Date(2026, 11, 15).getTime();
  for (const tot of [undefined, 0]) {
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.actief(s, '2026-12-15', nu, tot))), JSON.parse(JSON.stringify(M.actief(s, '2026-12-15', nu, tot))));
  }

  let bewaard = JSON.stringify(s);
  ctx.haalBestand_ = () => 'f';
  ctx.leesData_ = () => JSON.parse(bewaard);
  ctx.schrijfBestand_ = (id, tekst) => (bewaard = tekst);
  ctx.maakDagelijkseBackup_ = () => {};
  ctx.agendaInfo_ = () => null;
  const post = (actie) => ctx.doPost({ postData: { contents: JSON.stringify({ actie, token: 'geheim', data: { taken: { nieuw: { id: 'nieuw', titel: 'n', upd: 5 } } } }) } });
  const sync = post('sync');
  assert.equal(sync.scriptVersie, 10);
  assert.equal(sync.data.lessen.l1, undefined); // oude les blijft op Drive, niet op het toestel
  assert.ok(sync.data.taken.open && sync.data.taken.nieuw);
  const alles = post('alles');
  assert.ok(alles.data.lessen.l1 && alles.data.taken[M.hoofdId('l1')]);
  assert.ok(JSON.parse(bewaard).lessen.l1);
});

// ---------- taken voor leerlingen ----------

test('taak voor leerlingen: indienen op vrijdag van de lesweek, verbeteren de dag erna', () => {
  const s = basis(); // les op do 15 okt
  assert.equal(M.vrijdagVanaf('2026-10-15'), '2026-10-16');
  assert.equal(M.vrijdagVanaf('2026-10-16'), '2026-10-16');
  assert.equal(M.vrijdagVanaf('2026-10-17'), '2026-10-23'); // zaterdag → volgende vrijdag
  assert.equal(M.standaardIndien(s, 'l1'), '2026-10-16');
  assert.equal(M.standaardIndien(s, null, '2026-10-19'), '2026-10-23');

  const t = M.bewaarLeerlingTaak(s, null, { titel: 'Oefening factuur', lesId: 'l1', indien: '2026-10-16' });
  assert.ok(M.isLeerlingTaak(t) && M.isVerbeteren(t));
  assert.equal(t.indienManueel, false);
  assert.equal(M.werkdagVan(s, t), '2026-10-17');
  assert.equal(M.vanafVan(s, t), '2026-10-16');
  assert.equal(M.waarschuwing(s, t, '2026-10-10'), null);

  // zelf verschoven verbeteren blijft staan, "standaard" zet het terug
  M.zetWerkdag(s, t.id, '2026-10-20');
  assert.equal(M.werkdagVan(s, s.taken[t.id]), '2026-10-20');
  M.zetWerkdag(s, t.id, null);
  assert.equal(M.werkdagVan(s, s.taken[t.id]), '2026-10-17');
});

test('taak voor leerlingen schuift mee met de les, tenzij de indiendag zelf gekozen is', () => {
  const s = basis();
  const a = M.bewaarLeerlingTaak(s, null, { titel: 'A', lesId: 'l1', indien: '2026-10-16' });
  const b = M.bewaarLeerlingTaak(s, null, { titel: 'B', lesId: 'l1', indien: '2026-10-21' });
  assert.equal(b.indienManueel, true);
  M.verplaatsLes(s, 'l1', '2026-10-22');
  assert.equal(s.taken[a.id].indien, '2026-10-23');
  assert.equal(s.taken[b.id].indien, '2026-10-21');
});

test('taak voor leerlingen zonder les hoort bij een klas', () => {
  const s = basis();
  const t = M.bewaarLeerlingTaak(s, null, { titel: 'Toets', klasIds: ['k1'], indien: '2026-10-16', werkdag: '2026-10-17' });
  assert.equal(t.werkdag, null); // gelijk aan de standaard: niet vastgezet
  assert.deepEqual(M.klassenVanTaak(s, t), ['k1']);
  assert.equal(M.domeinVan(t), 'school');
  const r = M.tijdRapport({ ...s, taken: { [t.id]: { ...t, tijd: 600000 } } }, '2026-09-01', '2027-08-31');
  assert.equal(r.groepen[0].soorten.verbeteren, 600000);
});

test('volgende werkdagen, zonder vandaag', () => {
  const s = basis(); // werkdagen di en vr
  assert.deepEqual(M.volgendeWerkdagen(s, '2026-10-20'), ['2026-10-23', '2026-10-27']); // dinsdag zelf telt niet
  s.instellingen = { ...s.instellingen, werkdagen: [] };
  assert.deepEqual(M.volgendeWerkdagen(s, '2026-10-20'), []);
});

test('herplannen: over vrije dagen vanaf vandaag, niet voorbij de deadline', () => {
  const s = basis(); // werkdagen di en vr
  s.taken.a = taak({ id: 'a', lesId: null, werkdag: '2026-10-12' });
  s.taken.b = taak({ id: 'b', lesId: null, werkdag: '2026-10-13', deadline: { datum: '2026-10-19' } });
  s.taken.c = taak({ id: 'c', lesId: null, werkdag: '2026-10-14', deadline: { datum: '2026-10-10' } });
  const plan = M.herplanPlan(s, [s.taken.a, s.taken.b, s.taken.c], '2026-10-19'); // maandag
  for (const p of plan) assert.ok(p.datum >= '2026-10-19');
  assert.ok(!M.isWerkdag(s, plan[0].datum));
  assert.equal(plan.find((p) => p.taak.id === 'b').datum, '2026-10-19');
  assert.equal(plan.find((p) => p.taak.id === 'c').datum, '2026-10-19'); // deadline voorbij: vandaag
  M.pasHerplanToe(s, plan);
  assert.equal(s.taken.a.werkdag, plan[0].datum);
});

test('voorbereiding van een gegeven les: geen waarschuwing meer', () => {
  const s = basis(); // les do 15 okt
  M.zorgHoofdtaken(s);
  const h = s.taken[M.hoofdId('l1')];
  assert.equal(M.waarschuwing(s, h, '2026-10-20'), null);
  assert.ok(M.waarschuwing(s, h, '2026-10-15'));
});

// ---------- daglast, timer, gedaan ----------

test('schatting: gemiddelde van gelijkaardige afgewerkte taken, anders 30 minuten', () => {
  const s = basis();
  s.lessen.l2 = { id: 'l2', klasIds: ['k1'], titel: 'Volgende', datum: '2026-10-22', upd: 1 };
  M.zorgHoofdtaken(s);
  const open = s.taken[M.hoofdId('l2')];
  assert.equal(M.schatting(s, open), 30 * 60000);
  s.taken[M.hoofdId('l1')] = { ...s.taken[M.hoofdId('l1')], klaar: true, tijd: 90 * 60000 };
  assert.equal(M.schatting(s, open), 90 * 60000);
  // al bestede tijd gaat eraf, een blok is een deel
  assert.equal(M.schatting(s, { ...open, tijd: 30 * 60000 }), 60 * 60000);
  assert.equal(M.schatting(s, { ...open, deelVan: 3 }), 30 * 60000);
  // een to do zonder vergelijkbare taken
  assert.equal(M.schatting(s, { id: 'x', titel: 'x', domein: 'school' }), 30 * 60000);
});

test('daglast: som van wat open staat, vol boven de grens', () => {
  const s = basis(); // werkdagen di en vr
  for (let i = 0; i < 9; i++) s.taken['t' + i] = { id: 't' + i, titel: 'x', domein: 'school', werkdag: '2026-10-17', klaar: false, upd: 1 };
  const za = M.dagLast(s, '2026-10-17');
  assert.equal(za.ms, 9 * 30 * 60000);
  assert.equal(za.vol, true); // 4u30 > 4u
  s.instellingen = { ...s.instellingen, daggrens: 300 };
  assert.equal(M.dagLast(s, '2026-10-17').vol, false);
  s.taken.w = { id: 'w', titel: 'x', domein: 'school', werkdag: '2026-10-20', klaar: false, upd: 1 };
  s.taken.w2 = { id: 'w2', titel: 'x', domein: 'school', werkdag: '2026-10-20', klaar: false, upd: 1 };
  s.taken.w3 = { id: 'w3', titel: 'x', domein: 'school', werkdag: '2026-10-20', klaar: false, upd: 1 };
  assert.equal(M.dagLast(s, '2026-10-20').vol, true); // werkdag: vanaf 1 uur
  assert.equal(M.duurKort(150 * 60000), '2u30');
  assert.equal(M.duurKort(120 * 60000), '2u');
  assert.equal(M.duurKort(44 * 60000), '45m');
});

test('vergeten timer: eerst vragen, na 5 minuten stoppen op het moment van de vraag', () => {
  const s = basis();
  const start = 1_000_000_000;
  s.taken.t = taak({ id: 't', lesId: null });
  M.startTimer(s, 't', start);
  const t = () => s.taken.t;
  assert.equal(M.timerCheck(t(), start + 89 * 60000), null);
  assert.equal(M.timerCheck(t(), start + 91 * 60000).stand, 'vraag');
  const stop = M.timerCheck(t(), start + 96 * 60000);
  assert.deepEqual(stop, { stand: 'stop', tot: start + 90 * 60000 });
  // "ja, loopt nog": opnieuw 90 minuten
  M.bevestigTimer(s, 't', start + 92 * 60000);
  assert.equal(M.timerCheck(t(), start + 100 * 60000), null);
  assert.equal(M.timerCheck(t(), start + 183 * 60000).stand, 'vraag');
  M.stopTimer(s, 't', stop.tot);
  assert.equal(t().tijd, 90 * 60000);
  assert.equal(M.timerCheck(t(), start + 999 * 60000), null);
});

test('afvinken onthoudt wanneer, voor "vandaag gedaan"', () => {
  const s = basis();
  s.taken.t = taak({ id: 't', lesId: null });
  const nu = new Date(2026, 9, 20, 14).getTime();
  M.zetKlaar(s, 't', true, nu);
  assert.equal(s.taken.t.klaarOp, nu);
  assert.deepEqual(M.gedaanOp(s, '2026-10-20').map((t) => t.id), ['t']);
  M.zetKlaar(s, 't', false);
  assert.equal(s.taken.t.klaarOp, null);
  M.bewaarTaak(s, 't', { klaar: true });
  assert.ok(s.taken.t.klaarOp);
});

test('ochtendmail: de dag in een paar regels (Code.gs)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const s = basis(); // werkdagen di en vr, les l1 op do 15 okt
  s.lessen.l2 = { id: 'l2', klasIds: ['k1'], titel: 'Verkoopfactuur', datum: '2026-10-16', upd: 1 }; // vrijdag = werkdag
  M.zorgHoofdtaken(s);
  M.bewaarLeerlingTaak(s, null, { titel: 'Oefening', lesId: 'l1', indien: '2026-10-14' });
  s.taken.oud = { id: 'oud', titel: 'Mails', domein: 'school', werkdag: '2026-10-10', klaar: false, upd: 1 };
  const brief = ctx.dagBriefje_(JSON.parse(JSON.stringify(s)), '2026-10-15');
  // de voorbereiding van vrijdag staat op donderdag (dag vóór de les, geen werkdag)
  assert.match(brief.tekst, /Gepland voor vandaag:\n {2}○ Verkoopfactuur\n {2}○ Verbeteren CR: Oefening/);
  assert.match(brief.tekst, /Nog voor te bereiden:\n {2}○ vr 16 okt · BKH4 · Verkoopfactuur/);
  assert.match(brief.tekst, /2 blokjes bleven liggen/); // to do + voorbereiding van de les van vandaag
  assert.equal(brief.onderwerp, 'do 15 okt · 2 gepland, 1 les voor te bereiden');
  assert.equal(ctx.dagBriefje_({ instellingen: { werkdagen: [] } }, '2026-10-15'), null);
});

test('leerlingen plakken: regels of komma\'s, zonder lege of dubbele namen', () => {
  assert.deepEqual(M.leesLeerlingen('Amira\n Bram ,Lotte\n\nAmira;  Jan  Piet'), ['Amira', 'Bram', 'Lotte', 'Jan Piet']);
  assert.deepEqual(M.leesLeerlingen(''), []);
});

test('verbeterd aanvinken per leerling, ook bij een les met twee klassen', () => {
  const s = basis();
  s.klassen.k1.leerlingen = ['Amira', 'Bram', 'Lotte'];
  s.klassen.k2 = { id: 'k2', naam: 'BKH3', kleur: '#5bbba4', leerlingen: ['Bram'], upd: 1 };
  s.lessen.l1.klasIds = ['k1', 'k2'];
  M.bewaarLeerlingTaak(s, 'lt', { titel: 'Oefening', lesId: 'l1', indien: '2026-10-16' });
  assert.deepEqual(M.verbeterStand(s, s.taken.lt), { totaal: 4, klaar: 0, nog: ['Amira (BKH4)', 'Bram (BKH4)', 'Lotte (BKH4)', 'Bram (BKH3)'] });
  M.zetLeerlingVerbeterd(s, 'lt', 'k1|Bram', true);
  M.zetLeerlingVerbeterd(s, 'lt', 'k2|Bram', true);
  M.zetLeerlingVerbeterd(s, 'lt', 'k1|Lotte', true);
  M.zetLeerlingVerbeterd(s, 'lt', 'k1|Lotte', false);
  assert.deepEqual(M.verbeterStand(s, s.taken.lt).nog, ['Amira (BKH4)', 'Lotte (BKH4)']);
  // opnieuw bewaren in het taakvenster laat de vinkjes staan
  M.bewaarLeerlingTaak(s, 'lt', { titel: 'Oefening 2', lesId: 'l1', indien: '2026-10-16' });
  assert.deepEqual(s.taken.lt.verbeterd, ['k1|Bram', 'k2|Bram']);
  // een leerling die uit de klas verdwijnt telt niet meer mee
  s.klassen.k1.leerlingen = ['Amira', 'Bram'];
  s.lessen.l1.klasIds = ['k1'];
  assert.deepEqual(M.verbeterStand(s, s.taken.lt), { totaal: 2, klaar: 1, nog: ['Amira'] });
});

test('Classroom-taak is oud als het indienen meer dan een maand geleden is', () => {
  const t = { id: 'x', soort: 'verbeteren', indien: '2026-09-25', klaar: false };
  assert.equal(M.isOudeClassroomTaak(t, '2026-10-25'), false); // precies 30 dagen
  assert.equal(M.isOudeClassroomTaak(t, '2026-10-26'), true);
  assert.equal(M.isOudeClassroomTaak({ ...t, klaar: true }, '2026-10-26'), false);
  assert.equal(M.isOudeClassroomTaak({ ...t, indien: undefined }, '2026-10-26'), false);
});
