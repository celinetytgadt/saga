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
  const ctx = {
    Date,
    Session: { getScriptTimeZone: () => 'Europe/Brussels' },
    Utilities: { formatDate: fmt },
    CalendarApp: {
      getDefaultCalendar: () => ({ getTimeZone: () => 'Europe/Brussels' }),
      getAllCalendars: () => [{ getName: () => 'Hoofdagenda', getEvents: () => [] }],
      getCalendarsByName: (n) => (n.toLowerCase() === 'de zottekes' ? [{ getName: () => 'De Zottekes', getEvents: () => agenda }] : []),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const oud = { weg_2026: { id: 'weg_2026', titel: 'Oude afspraak', datum: '2026-10-01', upd: 1 } };
  const res = JSON.parse(JSON.stringify(ctx.leesAgenda_(oud)));
  assert.deepEqual([res.info.agendas, res.info.aantal, res.info.fout], [['De Zottekes'], 3, null]);
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
  assert.match(weg.info.fout, /niet gevonden/);
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
