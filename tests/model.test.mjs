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

test('standaardtaken en les verwijderen', () => {
  const s = basis();
  const taken = M.maakStandaardTaken(s, s.lessen.l1, ['sj-voorb', 'sj-prints', 'bestaat-niet']);
  assert.deepEqual(taken.map((t) => t.titel), ['Lesvoorbereiding', 'Prints']);
  assert.equal(M.takenVanLes(s, 'l1').length, 2);
  taken[0].deadline.rel = -5; // kopie, sjabloon blijft ongewijzigd
  assert.equal(s.sjablonen['sj-voorb'].deadline.rel, -1);
  M.verwijderLes(s, 'l1');
  assert.equal(M.takenVanLes(s, 'l1').length, 0);
  assert.equal(M.lijst(s, 'lessen').length, 0);
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
