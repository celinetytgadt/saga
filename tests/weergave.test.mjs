import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../js/model.js';

// weergave.js gebruikt ui.js, dat bij het laden het scherm bekijkt
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const W = await import('../js/weergave.js');

const V = '2026-10-19'; // maandag
const plus = (n) => M.plusDagen(V, n);

function basis() {
  const s = M.leegeState();
  s.klassen.k1 = { id: 'k1', naam: 'BKH4', kleur: '#123b78', rooster: [1, 4], upd: 1 };
  s.vakken.v1 = { id: 'v1', naam: 'Didactiek', kleur: '#ef4f4e', upd: 1 };
  return s;
}

const todo = (id, extra) => ({ id, titel: id, werkdag: null, deadline: null, vanaf: null, klaar: false, domein: 'school', upd: 1, ...extra });

test('bakje: to do\'s met een deadline binnen 2 weken of zonder deadline', () => {
  const s = basis();
  s.taken.a = todo('a');
  s.taken.b = todo('b', { deadline: { datum: plus(10) } });
  s.taken.c = todo('c', { deadline: { datum: plus(20) } });
  const b = W.bakje(s, undefined, V);
  assert.deepEqual(b.school.map((t) => t.id).sort(), ['a', 'b']);
  assert.equal(b.later, 1);
  assert.equal(b.aantal, 2);
});

test('bakje: bij een les enkel voor lessen in de komende 2 weken', () => {
  const s = basis();
  s.lessen.l1 = { id: 'l1', klasIds: ['k1'], titel: 'Les', datum: plus(5), upd: 1 };
  s.lessen.l2 = { id: 'l2', klasIds: ['k1'], titel: 'Later', datum: plus(30), upd: 1 };
  s.taken.x = todo('x', { lesId: 'l1', deadline: { rel: -1 } });
  s.taken.y = todo('y', { lesId: 'l2', deadline: { rel: -1 } });
  const b = W.bakje(s, undefined, V);
  assert.deepEqual(b.school.map((t) => t.id), ['x']);
});

test('bakje: opleiding toont per onderdeel de volgende 5', () => {
  const s = basis();
  s.opdrachten.o1 = { id: 'o1', titel: 'Portfolio', vakId: 'v1', deadline: plus(60), upd: 1 };
  for (let i = 1; i <= 7; i++) s.taken['s' + i] = todo('s' + i, { opdrachtId: 'o1', domein: 'opleiding', deadline: { eind: true }, volg: i });
  const b = W.bakje(s, undefined, V);
  assert.equal(b.opleiding.length, 1);
  assert.deepEqual(b.opleiding[0].taken.map((t) => t.id), ['s1', 's2', 's3', 's4', 's5']);
  assert.equal(b.opleiding[0].meer, 2);
  assert.equal(b.later, 2);
});

test('bakje: blijven liggen staat er altijd in', () => {
  const s = basis();
  s.taken.oud = todo('oud', { werkdag: plus(-3), deadline: { datum: plus(40) } });
  const b = W.bakje(s, undefined, V);
  assert.deepEqual(b.liggen.map((t) => t.id), ['oud']);
});

test('taak voor leerlingen heet "Verbeteren CR: …" op de planning', () => {
  const s = basis();
  const t = M.bewaarLeerlingTaak(s, null, { titel: 'Oefening', klasIds: ['k1'], indien: plus(4) });
  assert.equal(W.taakTitel(s, t), 'Verbeteren CR: Oefening');
});

test('elk bestand van de app zit in de cache van de service worker', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const lijst = (map) => fs.readdirSync(new URL(`../${map}/`, import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `${map}/${f}`);
  for (const f of [...lijst('js'), ...lijst('js/views'), 'css/saga.css', 'index.html']) assert.ok(sw.includes(`'${f}'`), `${f} ontbreekt in sw.js`);
});
