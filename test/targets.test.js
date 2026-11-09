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
  assert.deepStrictEqual(ok.row, { metric: 'lp', scope: 'all', sector: null, school: null, target: 80, deadline: '2026-12-31', note: null, owner: 'Hasnat' });
  assert.ok(TG.validate({ ...base, owner: '' }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, metric: 'nope' }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, target: 0 }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, target: 120 }, known, '2026-11-09').error);
  assert.ok(TG.validate({ ...base, deadline: '2026-11-09' }, known, '2026-11-09').error);   // not in the future
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
  assert.deepStrictEqual((await store.list()).map((t) => t.deadline), ['2026-12-01', '2026-12-31']);
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
  assert.deepStrictEqual(H.weeks.map((w) => w.p), [0, 25, 50, 50, 50, 50]);   // cumulative

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
