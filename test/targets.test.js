const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TG = require('../targets');
const Calc = require('../public/calc');

test('targets: validation and store', async () => {
  const known = { emis: new Set(['101']), sectors: new Set(['Urban-I']) };
  const base = { owner: 'Hasnat', metric: 'lp', target: 80, deadline: '2026-12-31', scope: 'all' };
  const ok = TG.validate(base, known, '2026-11-09');
  assert.deepStrictEqual(ok.row, { metric: 'lp', scope: 'all', sector: null, school: null, target: 80, start: '2026-11-09', deadline: '2026-12-31', mode: 'week', note: null, owner: 'Hasnat' });
  assert.ok(TG.validate({ ...base, owner: '' }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, metric: 'nope' }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, target: 0 }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, target: 120 }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, deadline: '2026-11-09' }, known, '2026-11-09').error);   // end not after the (default) start
  assert.ok(TG.validate({ ...base, start: '2026-12-31' }, known, '2026-11-09').error);       // start = end
  assert.ok(TG.validate({ ...base, start: '2026-07-01' }, known, '2026-11-09').error);       // before the data
  assert.ok(TG.validate({ ...base, start: 'soon' }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, mode: 'month' }, known, '2026-11-09').error);
  const past = TG.validate({ ...base, start: '2026-09-01', deadline: '2026-10-31', mode: 'period' }, known, '2026-11-09').row;   // a past period can be reviewed
  assert.deepStrictEqual([past.start, past.deadline, past.mode], ['2026-09-01', '2026-10-31', 'period']);
  assert.ok(TG.validate({ ...base, deadline: '2029-01-01' }, known, '2026-11-09').error);   // too far
  assert.ok(TG.validate({ ...base, scope: 'sector', sector: 'Nowhere' }, known, '2026-11-09').error);
  assert.strictEqual(TG.validate({ ...base, scope: 'sector', sector: 'Urban-I' }, known, '2026-11-09').row.sector, 'Urban-I');
  assert.ok(TG.validate({ ...base, scope: 'school', school: '999' }, known, '2026-11-09').error);
  assert.strictEqual(TG.validate({ ...base, scope: 'school', school: 101 }, known, '2026-11-09').row.school, '101');
  assert.strictEqual(TG.validate({ ...base, target: '72.34' }, known, '2026-11-09').row.target, 72.3);
  // every metric the server accepts is one the page can compute
  assert.deepStrictEqual(TG.METRICS.slice().sort(), Object.keys(Calc.TARGET_METRICS).sort());

  const store = TG.createStore({ pool: null, file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-')), 'targets.json') });
  const a = await store.add(ok.row);
  await store.add({ ...ok.row, deadline: '2026-12-01' });
  assert.deepStrictEqual((await store.list()).map((t) => [t.start, t.deadline, t.mode]), [['2026-11-09', '2026-12-01', 'week'], ['2026-11-09', '2026-12-31', 'week']]);
  assert.strictEqual(await store.remove(a.id), true);
  assert.strictEqual(await store.remove(a.id), false);
  assert.strictEqual((await store.list()).length, 1);
});

test('targets: weekly series and forecast', () => {
  // 2026-08-01 is a Saturday, so the first Monday-Sunday week is days -5..1
  const teachers = [{ s: 0 }, { s: 0 }, { s: 0 }, { s: 0 }];
  const lp = [];
  // week k (days 2+7k .. 8+7k): k+1 of the 4 teachers use a plan (capped at 4) -> 25%, 50%, 75%, 100%
  for (let k = 0; k < 4; k++) for (let t = 0; t <= Math.min(k, 3); t++) lp.push([t, 2 + 7 * k, 1, 0, 1, 0, 0]);
  const obs = [[0, 3, 'H', 'C', null, null, 30, 48, 20, 28, null, null, '', '', 'c', 'r'], [1, 10, 'H', 'C', null, null, 30, 48, 20, 28, null, null, '', '', 'c', 'r']];
  const data = { window_start: '2026-08-01', today: 31, teachers, schools: [{ emis: '1', sector: 'A', name: 'S' }], lp, obs };
  const P = Calc.prepare(data);
  const S = Calc.targetSeries(P, 'lp', {});
  assert.strictEqual(S.teachers, 4);
  assert.deepStrictEqual(S.weeks.map((w) => w.p), [0, 25, 50, 75, 100, 0]);
  assert.deepStrictEqual(S.weeks.map((w) => w.partial), [false, false, false, false, false, true]);
  const H = Calc.targetSeries(P, 'hitl', {});
  assert.deepStrictEqual(H.weeks.map((w) => w.p), [0, 25, 25, 0, 0, 0]);       // each week (visits on days 3 and 10)
  // over the period from day 2: teacher 0 (day 2), +1 (day 9), +2 (day 16), +3 (day 23); week 0 ends on day 1 (before the start)
  const L = Calc.targetSeries(P, 'lp', {}, { mode: 'period', from: 2 });
  assert.deepStrictEqual(L.weeks.map((w) => w.p), [null, 25, 50, 75, 100, 100]);
  const H2 = Calc.targetSeries(P, 'hitl', {}, { mode: 'period', from: 5 });
  assert.deepStrictEqual(H2.weeks.map((w) => w.p), [null, 0, 25, 25, 25, 25]);   // teacher 0's day-3 visit is before the start
  // an end date caps the count: nothing after day 16, and later weeks are empty
  const L2 = Calc.targetSeries(P, 'lp', {}, { mode: 'period', from: 2, to: 16 });
  assert.deepStrictEqual(L2.weeks.map((w) => w.p), [null, 25, 50, 75, null, null]);
  const F2 = Calc.targetForecast(L.weeks, 100, 60, 31, { cumulative: true, live: true, from: 2 });
  assert.strictEqual(F2.current, 100);
  assert.strictEqual(F2.status, 'achieved');
  // reach over a period: 0 -> 25 -> 50 -> 62.5 reaches 25%, 33.3% and 25% of those left (mean 27.8%) each week
  const R = Calc.targetForecast([{ mon: 0, end: 6, p: 25, partial: false }, { mon: 7, end: 13, p: 50, partial: false }, { mon: 14, end: 20, p: 62.5, partial: false }], 85, 37, 22, { cumulative: true, live: true, from: 0 });
  const r = (0.25 + 1 / 3 + 0.25) / 3;
  assert.ok(Math.abs(R.rate - r) < 1e-9);
  assert.ok(Math.abs(R.projected - (100 - 37.5 * (1 - r) ** 3)) < 1e-9);   // 3 weeks from mon 14 to the week of day 37 (mon 35)
  assert.strictEqual(R.status, 'ontrack');

  const wk = (vals) => vals.map((p, i) => ({ mon: 7 * i, end: 7 * i + 6, p, partial: false }));
  // rising 2 points a week from 50: 8 weeks after the last (60 at mon 35) -> 76 at mon 91
  const F = Calc.targetForecast(wk([50, 52, 54, 56, 58, 60]), 70, 93, 41);
  assert.ok(Math.abs(F.slope - 2) < 1e-9);
  assert.ok(Math.abs(F.projected - 76) < 1e-9);
  assert.strictEqual(F.status, 'ontrack');
  assert.strictEqual(Calc.targetForecast(wk([50, 52, 54, 56, 58, 60]), 80, 93, 41).status, 'close');
  assert.strictEqual(Calc.targetForecast(wk([50, 52, 54, 56, 58, 60]), 90, 93, 41).status, 'off');
  assert.strictEqual(Calc.targetForecast(wk([50, 52, 54, 56, 58, 60]), 60, 93, 41).status, 'achieved');
  assert.strictEqual(Calc.targetForecast(wk([50, 52]), 70, 93, 41).status, 'nodata');
  assert.strictEqual(Calc.targetForecast(wk([50, 52, 54, 56, 58, 60]), 55, 20, 41).status, 'missed');   // week of day 14 had 54
  assert.strictEqual(Calc.targetForecast(wk([50, 52, 54, 56, 58, 60]), 54, 20, 41).status, 'met');
});
