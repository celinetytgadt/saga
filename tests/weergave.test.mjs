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

test('bakje: vroeger werk bij een les en weekblokken staan er niet in', () => {
  const s = basis();
  s.lessen.l1 = { id: 'l1', klasIds: ['k1'], titel: 'Les', datum: plus(5), upd: 1 };
  s.taken.x = todo('x', { lesId: 'l1', deadline: { rel: -1 } });
  s.taken.cr = todo('cr', { soort: 'verbeteren', indien: plus(-3), klasIds: ['k1'] });
  M.zorgWeekblokken(s, V);
  s.taken.a = todo('a');
  const b = W.bakje(s, undefined, V);
  assert.deepEqual(b.school.map((t) => t.id), ['a']);
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

test('blijven liggen: geen vroeger werk bij een les', () => {
  const s = basis();
  s.lessen.nu = { id: 'nu', klasIds: ['k1'], titel: 'Nu', datum: plus(2), upd: 1 };
  s.taken.h2 = todo('h2', { lesId: 'nu', hoofd: true, werkdag: plus(-1) });
  s.taken.cr = todo('cr', { soort: 'verbeteren', klasIds: ['k1'], indien: plus(-10) });
  s.taken.t = todo('t', { werkdag: plus(-1) });
  assert.deepEqual(W.blijvenLiggen(s, V).map((t) => t.id), ['t']);
});

test('weekblok heet "Lesvoorbereiding BKH3" en krijgt de kleur van zijn groep', () => {
  const s = basis();
  M.zorgWeekblokken(s, V);
  const t = M.weekblok(s, 'bkh3', 'voorbereiding', V);
  assert.equal(W.taakTitel(s, t), 'Lesvoorbereiding BKH3');
  assert.equal(W.anker(s, t).kleur, s.weekgroepen.bkh3.kleur);
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

test('Vandaag: deadline bovenaan, weekblokken, blok per onderwerp, geen lessen en geen dubbels met de magjes', async () => {
  const { viewVandaag } = await import('../js/views/vandaag.js');
  const v = M.vandaag();
  const s = basis();
  M.zorgWeekblokken(s, v);
  M.zorgWeekblokken(s, M.plusDagen(v, -7));
  M.zetTijd(s, M.weekblokId('verbeteren', 'bkh4', M.maandagVan(M.plusDagen(v, -7))), 45 * 60000);
  s.lessen.l1 = { id: 'l1', klasIds: ['k1'], titel: 'Les morgen', datum: M.plusDagen(v, 1), upd: 1 };
  s.taken['h-l1'] = todo('h-l1', { titel: '', lesId: 'l1', hoofd: true, werkdag: M.plusDagen(v, -1), deadline: { rel: -1, nietOpWerkdag: true } });
  s.taken.cr = todo('cr', { titel: 'Balans', soort: 'verbeteren', indien: M.plusDagen(v, -3), klasIds: ['k1'], werkdag: M.plusDagen(v, -2) });
  s.onderwerpen.o1 = { id: 'o1', naam: 'Stage', kleur: '#5bbba4', upd: 1 };
  s.taken.st = todo('st', { titel: 'Stagebrief', onderwerpId: 'o1', deadline: { datum: v } });
  s.taken.st2 = todo('st2', { titel: 'Bedrijven bellen', onderwerpId: 'o1', deadline: { datum: M.plusDagen(v, 3) } });
  s.taken.los = todo('los', { titel: 'Los' });
  s.taken.verre = todo('verre', { titel: 'Toets maken', deadline: { datum: M.plusDagen(v, 10) } });
  const html = viewVandaag(s);
  const [belangrijk, rest] = html.split('<h2>Magjes</h2>');
  const telt = (deel, id) => deel.split(`data-actie="vink" data-id="${id}"`).length - 1;
  for (const id of ['h-l1', 'cr']) assert.equal(telt(html, id), 0, id); // lessen staan niet meer in Saga
  for (const id of ['st', 'st2']) {
    assert.equal(telt(belangrijk, id), 1, id);
    assert.equal(telt(rest, id), 0, id);
  }
  for (const id of ['verre', 'los']) {
    assert.equal(telt(belangrijk, id), 0, id);
    assert.equal(telt(rest, id), 1, id);
  }
  // weekblokken: elke groep twee keer (voorbereiding, verbeteren), enkel bij Belangrijk, met een timer
  const deze = M.maandagVan(v);
  for (const g of ['bkh3', 'bkh4', 'bkh56t', 'bkh56e'])
    for (const soort of ['voorbereiding', 'verbeteren']) {
      const id = M.weekblokId(soort, g, deze);
      assert.equal(telt(belangrijk, id), 1, id);
      assert.equal(telt(rest, id), 0, id);
      assert.match(belangrijk, new RegExp(`data-actie="timer" data-id="${id}"`));
    }
  assert.equal(telt(html, M.weekblokId('verbeteren', 'bkh4', M.maandagVan(M.plusDagen(v, -7)))), 0); // vorige week: afgesloten
  assert.match(belangrijk, /vorige week 45 min/);
  // deadline vandaag bovenaan, dan de weekblokken, dan het blok Stage
  const dl = belangrijk.indexOf('Deadline vandaag of morgen');
  const week = belangrijk.indexOf('Lesvoorbereiding');
  const stage = belangrijk.indexOf('>Stage</h3>');
  assert.ok(dl > 0 && dl < belangrijk.indexOf('data-id="st"') && belangrijk.indexOf('data-id="st"') < week && week < stage);
  assert.ok(belangrijk.indexOf('data-id="st2"') > stage, 'deadline over 3 dagen: in het blok, niet in het rode vlak');
  assert.match(rest, /kop-blok[^>]*>Zonder onderwerp</);
  assert.match(rest.slice(rest.indexOf('data-id="los"')), /data-actie="timer" data-id="los"/);
});

test('wie nog verbeterd moet worden (oude taken voor leerlingen)', () => {
  const s = basis();
  s.klassen.k1.leerlingen = ['Amira', 'Bram'];
  s.taken.oud = todo('oud', { soort: 'verbeteren', klasIds: ['k1'], indien: plus(-40), verbeterd: ['k1|Bram'] });
  assert.equal(W.verbeterTekst(s, s.taken.oud), '1/2 verbeterd · nog: Amira');
});

test('School: enkel onderwerpen, geen klassen of lessen meer', async () => {
  const { viewKlassen } = await import('../js/views/school.js');
  const s = basis();
  s.lessen.l1 = { id: 'l1', klasIds: ['k1'], titel: 'Oude les', datum: plus(2), upd: 1 };
  s.onderwerpen.o1 = { id: 'o1', naam: 'Stage', kleur: '#5bbba4', upd: 1 };
  s.taken.st = todo('st', { titel: 'Stagebrief', onderwerpId: 'o1' });
  s.taken.cursus = todo('cursus', { titel: 'Cursus schrijven', klasIds: ['k1'] });
  const html = viewKlassen(s);
  assert.match(html, />Stage</);
  assert.match(html, /Cursus schrijven/); // vroeger enkel bij de klas, nu bij "Zonder onderwerp"
  assert.doesNotMatch(html, /Oude les|BKH4|\+ les/);
});

test('Tijd: per week een tabel voor lesvoorbereiding en voor verbeteren', async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem() {} };
  const { viewTijd } = await import('../js/views/tijd.js');
  const { ui } = await import('../js/ui.js');
  const v = M.vandaag();
  const s = basis();
  M.zorgWeekblokken(s, M.plusDagen(v, -7));
  M.zorgWeekblokken(s, v);
  M.zetTijd(s, M.weekblokId('voorbereiding', 'bkh56e', M.maandagVan(M.plusDagen(v, -7))), 75 * 60000);
  Object.assign(ui.tijd, { periode: 'jaar', data: s, volledig: true, bezig: false, fout: '' });
  const html = viewTijd(s);
  assert.match(html, /Lesvoorbereiding per week/);
  assert.match(html, /Verbeteren per week/);
  assert.match(html, /BKH56 exact/);
  assert.match(html, /1u 15m/);
});
