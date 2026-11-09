const test = require('node:test');
const assert = require('node:assert');
const Calc = require('../public/calc');

// DC row with a classroom-practice score of p% (teaching practices /48 + student engagement /28).
const dc = (ti, day, p) => [ti, day, 'D', '-', null, null, (48 * p) / 100, 48, (28 * p) / 100, 28, null, null];
const hitl = (ti, day, coach, stage = 'C') => [ti, day, 'H', stage, null, null, 30, 48, 20, 28, null, null, '', '', coach, 'r'];

function data() {
  const teachers = [], obs = [];
  for (let i = 0; i < 8; i++) teachers.push({ s: i < 7 ? 0 : 1, name: `T${i}`, lv: 'P' });
  // teacher 0: visited on day 30, 50% before, 60% after; second visit too recent (day 55)
  obs.push(dc(0, 20, 50), dc(0, 25, 50), hitl(0, 30, 'c1'), dc(0, 35, 60), hitl(0, 55, 'c1'));
  // teachers 1-5: never visited, 50% -> 52% over the same days (the comparison)
  for (let t = 1; t <= 5; t++) obs.push(dc(t, 22, 50), dc(t, 38, 52));
  // teacher 6: visited, but no DC after the visit
  obs.push(dc(6, 20, 40), hitl(6, 30, 'c2'));
  // teacher 7: another sector, visited, no comparison teachers there
  obs.push(dc(7, 20, 50), hitl(7, 30, 'c1'), dc(7, 35, 70));
  return { window_start: '2026-08-01', today: 60, teachers, obs,
    schools: [{ emis: '1', sector: 'A', name: 'S1' }, { emis: '2', sector: 'B', name: 'S2' }] };
}

test('impact: before/after, comparison, net and counts', () => {
  const P = Calc.prepare(data());
  const I = Calc.coachImpact(P, { from: 0, to: 60 });
  assert.strictEqual(I.visitsIn, 4);
  assert.strictEqual(I.tooRecent, 1);
  assert.strictEqual(I.noDc, 1);
  assert.strictEqual(I.pairs.length, 2);
  const A = I.all;
  assert.strictEqual(A.n, 2);        // both visits with recordings on both sides
  assert.strictEqual(A.nNet, 1);     // only sector A has a comparison group
  assert.ok(Math.abs(A.before - 50) < 1e-9);
  assert.ok(Math.abs(A.after - 60) < 1e-9);
  assert.ok(Math.abs(A.gain - 10) < 1e-9);
  assert.ok(Math.abs(A.ctrl - 2) < 1e-9);
  assert.ok(Math.abs(A.net - 8) < 1e-9);
  assert.strictEqual(A.ci, null);    // one visit: no range
  const B = I.sectors.find((g) => g.key === 'B');
  assert.strictEqual(B.n, 1);
  assert.strictEqual(B.net, null);
  assert.deepStrictEqual(I.coaches.map((g) => g.key).sort(), ['c1']);
});

test('impact: filters, window and comparison band', () => {
  const P = Calc.prepare(data());
  assert.strictEqual(Calc.coachImpact(P, { from: 0, to: 60, sector: 'B' }).all.nNet, 0);
  assert.strictEqual(Calc.coachImpact(P, { from: 31, to: 60 }).pairs.length, 0);   // only the too-recent visit
  // a 7-day window: teacher 0's day-25 recording is in; teacher 7's (day 20) and the comparison's (day 22) are not
  const W7 = Calc.coachImpact(P, { from: 0, to: 60, w: 7 });
  assert.strictEqual(W7.pairs.length, 1);
  assert.strictEqual(W7.all.nNet, 0);
  // comparison teachers starting in another band do not count
  const d = data();
  d.obs = d.obs.map((r) => (r[0] >= 1 && r[0] <= 5 && r[1] === 22 ? dc(r[0], 22, 75) : r));
  assert.strictEqual(Calc.coachImpact(Calc.prepare(d), { from: 0, to: 60 }).all.nNet, 0);
});

test('impact: subject knowledge uses FICO v3 only', () => {
  const d = data();
  d.obs = [[0, 20, 'D', '-', 10, 32, null, null, null, null, null, null], hitl(0, 30, 'c1'), [0, 35, 'D', '-', 12, 24, null, null, null, null, null, null]];
  const I = Calc.coachImpact(Calc.prepare(d), { from: 0, to: 60, sec: 'tsk3' });
  assert.strictEqual(I.pairs.length, 0);   // the v2 score (out of 32) before does not count
});
