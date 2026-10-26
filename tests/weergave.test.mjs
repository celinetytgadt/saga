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

test('blijven liggen: niet de voorbereiding van een les die al voorbij is', () => {
  const s = basis();
  s.lessen.oud = { id: 'oud', klasIds: ['k1'], titel: 'Oud', datum: plus(-2), upd: 1 };
  s.lessen.nu = { id: 'nu', klasIds: ['k1'], titel: 'Nu', datum: plus(2), upd: 1 };
  s.taken.h1 = todo('h1', { lesId: 'oud', hoofd: true, werkdag: plus(-3) });
  s.taken.h2 = todo('h2', { lesId: 'nu', hoofd: true, werkdag: plus(-1) });
  assert.deepEqual(W.blijvenLiggen(s, V).map((t) => t.id), ['h2']);
});

test('bakje: opleiding in de volgorde van de pagina Opleiding', () => {
  const s = basis();
  // ingegeven als 1, 2, 3; zelfde einddeadline
  for (const [i, id] of ['o1', 'o2', 'o3'].entries()) s.opdrachten[id] = { id, titel: id, vakId: 'v1', deadline: plus(60), volg: i + 1, upd: 1 };
  const stuk = (id, opd, volg) => (s.taken[id] = todo(id, { titel: 'cursus doornemen', opdrachtId: opd, domein: 'opleiding', deadline: { eind: true }, volg }));
  stuk('c2', 'o3', 2);
  stuk('a1', 'o1', 1);
  stuk('c1', 'o3', 1);
  stuk('b1', 'o2', 1);
  stuk('a2', 'o1', 2);
  s.taken.los = todo('los', { domein: 'opleiding' });
  const b = W.bakje(s, undefined, V);
  assert.deepEqual(b.opleiding[0].taken.map((t) => t.id), ['a1', 'a2', 'b1', 'c1', 'c2']);
  assert.deepEqual(b.opleiding[1].taken.map((t) => t.id), ['los']); // losse to do: groep zonder onderdeel
});

test('afspraak op Vandaag: met het uur als dat er is', async () => {
  const { afspraakUur } = await import('../js/views/vandaag.js');
  assert.equal(afspraakUur({ datum: V, tijd: '14:00', eindTijd: '15:30' }, V), '14:00–15:30');
  assert.equal(afspraakUur({ datum: V, tijd: '09:00' }, V), '09:00'); // oud script: zonder einduur
  assert.equal(afspraakUur({ datum: V, tijd: null }, V), 'hele dag');
  assert.equal(afspraakUur({ datum: V, eindDatum: plus(2), tijd: '18:00', eindTijd: '10:00' }, V), 'vanaf 18:00');
  assert.equal(afspraakUur({ datum: plus(-2), eindDatum: V, tijd: '18:00', eindTijd: '10:00' }, V), 'tot 10:00');
  assert.equal(afspraakUur({ datum: plus(-1), eindDatum: plus(1), tijd: '18:00', eindTijd: '10:00' }, V), 'hele dag');
});

test('Vandaag: deadline vandaag of morgen bovenaan, blok per klas en per onderwerp, geen dubbels met de magjes', async () => {
  const { viewVandaag } = await import('../js/views/vandaag.js');
  const v = M.vandaag();
  const s = basis();
  s.instellingen.werkdagen = [0, 1, 2, 3, 4, 5, 6];
  s.lessen.l1 = { id: 'l1', klasIds: ['k1'], titel: 'Les morgen', datum: M.plusDagen(v, 1), upd: 1 };
  // voorbereiding die gisteren gepland stond: enkel bij Belangrijk, niet bij "Bleef liggen"
  s.taken['h-l1'] = todo('h-l1', { titel: '', lesId: 'l1', hoofd: true, werkdag: M.plusDagen(v, -1), deadline: { rel: -1, nietOpWerkdag: true } });
  s.taken.cr = todo('cr', { titel: 'Balans', soort: 'verbeteren', indien: M.plusDagen(v, -3), klasIds: ['k1'], werkdag: M.plusDagen(v, -2) });
  s.taken.later = todo('later', { titel: 'Nog niet', soort: 'verbeteren', indien: v, klasIds: ['k1'] });
  s.taken.cursus = todo('cursus', { titel: 'Cursus schrijven', klasIds: ['k1'], deadline: { datum: M.plusDagen(v, 5) } });
  s.taken.verre = todo('verre', { titel: 'Toets maken', klasIds: ['k1'], deadline: { datum: M.plusDagen(v, 10) } });
  s.onderwerpen.o1 = { id: 'o1', naam: 'Stage', kleur: '#5bbba4', upd: 1 };
  s.taken.st = todo('st', { titel: 'Stagebrief', onderwerpId: 'o1', deadline: { datum: v } });
  s.taken.st2 = todo('st2', { titel: 'Bedrijven bellen', onderwerpId: 'o1', deadline: { datum: M.plusDagen(v, 3) } });
  s.taken.los = todo('los', { titel: 'Los' });
  s.taken.mg = todo('mg', { titel: 'Kopies', klasIds: ['k1'], deadline: { datum: M.plusDagen(v, 1) } });
  const html = viewVandaag(s);
  const [belangrijk, rest] = html.split('<h2>Magjes</h2>');
  const telt = (deel, id) => deel.split(`data-actie="vink" data-id="${id}"`).length - 1;
  for (const id of ['h-l1', 'cr', 'cursus', 'st', 'st2']) {
    assert.equal(telt(belangrijk, id), 1, id);
    assert.equal(telt(rest, id), 0, id);
  }
  assert.equal(telt(html, 'later'), 0); // pas vanaf morgen (dag na het indienen)
  for (const id of ['verre', 'los']) {
    assert.equal(telt(belangrijk, id), 0, id);
    assert.equal(telt(rest, id), 1, id);
  }
  // deadline vandaag staat boven de blokken; blok BKH4 met voorbereiding, verbeteren en to do
  const dl = belangrijk.indexOf('Deadline vandaag of morgen');
  const klas = belangrijk.indexOf('kop-blok" style="--klas:#123b78">BKH4<');
  const stage = belangrijk.indexOf('>Stage</h3>');
  assert.ok(dl > 0 && dl < belangrijk.indexOf('data-id="st"') && belangrijk.indexOf('data-id="st"') < klas, 'deadline bovenaan');
  assert.ok(dl < belangrijk.indexOf('data-id="h-l1"') && belangrijk.indexOf('data-id="h-l1"') < klas, 'voorbereiding van de les van morgen in het rode vlak');
  assert.ok(klas < belangrijk.indexOf('data-id="cr"') && belangrijk.indexOf('data-id="cursus"') < stage, 'blok per klas, dan onderwerp');
  assert.ok(dl < belangrijk.indexOf('data-id="mg"') && belangrijk.indexOf('data-id="mg"') < klas, 'deadline morgen in het rode vlak');
  assert.ok(belangrijk.indexOf('data-id="st2"') > stage, 'deadline over 3 dagen: in het blok, niet in het rode vlak');
  // magjes per klas of onderwerp, met een startknop
  assert.match(rest, /kop-blok[^>]*>BKH4</);
  assert.match(rest, /kop-blok[^>]*>Zonder onderwerp</);
  assert.match(rest.slice(rest.indexOf('data-id="los"')), /data-actie="timer" data-id="los"/);
});
