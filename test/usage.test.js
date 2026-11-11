const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const US = require('../usage');

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

test('usage: what is recorded', () => {
  const id = 'a'.repeat(32);
  const r = US.validate({ v: id, tab: 'lp', d: 'm' }, CHROME).row;
  assert.deepStrictEqual(Object.keys(r), ['visitor', 'tab', 'device']);
  assert.strictEqual(r.tab, 'lp'); assert.strictEqual(r.device, 'm');
  assert.notStrictEqual(r.visitor, id);                                     // only a hash is kept
  assert.strictEqual(US.validate({ v: id, open: 1 }, CHROME).row.tab, '_open');
  assert.strictEqual(US.validate({ v: id, tab: 'lp' }, CHROME).row.device, 'd');
  assert.ok(US.validate({ v: id, tab: 'lp' }, 'Mozilla/5.0 HeadlessChrome/157').skip);
  assert.ok(US.validate({ v: id, tab: 'lp' }, 'Slackbot-LinkExpanding 1.0').skip);
  assert.ok(US.validate({ v: id, tab: 'lp' }, 'curl/8.7.1').skip);
  assert.ok(US.validate({ v: 'short', tab: 'lp' }, CHROME).skip);
  assert.ok(US.validate({ v: id, tab: '<script>' }, CHROME).skip);
  assert.ok(US.validate(null, CHROME).skip);
});

test('usage: daily, weekly, tabs, devices, new and returning', async () => {
  const store = US.createStore({ pool: null, file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'us-')), 'usage.json') });
  const add = (day, v, tab, d = 'd') => store.add(day, { visitor: v, tab, device: d });
  // Mon 9 Nov: A opens twice (lp, dc); B opens once on a phone. Tue 10 Nov: A again. Wed 11 Nov: C (new).
  await add('2026-11-09', 'A', '_open'); await add('2026-11-09', 'A', 'lp'); await add('2026-11-09', 'A', '_open'); await add('2026-11-09', 'A', 'dc');
  await add('2026-11-09', 'B', '_open', 'm'); await add('2026-11-09', 'B', 'lp', 'm');
  await add('2026-11-10', 'A', '_open'); await add('2026-11-10', 'A', 'lp');
  await add('2026-11-11', 'C', '_open'); await add('2026-11-11', 'C', 'overview');
  await add('2026-11-02', 'D', '_open');   // the week before, still inside the 10-day window
  const U = US.summarize(await store.all(), '2026-11-11', 10);
  assert.strictEqual(U.from, '2026-11-02');
  assert.strictEqual(U.daily.length, 10);
  assert.strictEqual(U.tracking_since, '2026-11-02');
  const day = Object.fromEntries(U.daily.map((x) => [x.day, x]));
  assert.deepStrictEqual([day['2026-11-09'].visitors, day['2026-11-09'].opens, day['2026-11-09'].new], [2, 3, 2]);
  assert.deepStrictEqual([day['2026-11-10'].visitors, day['2026-11-10'].new], [1, 0]);   // A is returning
  assert.deepStrictEqual([day['2026-11-05'].visitors, day['2026-11-05'].opens], [0, 0]);
  assert.deepStrictEqual(U.weekly.map((w) => [w.mon, w.visitors, w.opens, w.days]), [['2026-11-09', 3, 5, 3], ['2026-11-02', 1, 1, 1]]);
  assert.deepStrictEqual(U.tabs.map((t) => [t.tab, t.visitors, t.views]), [['lp', 2, 3], ['dc', 1, 1], ['overview', 1, 1]]);
  assert.deepStrictEqual(U.devices, { phone: 1, computer: 3, both: 0 });
  assert.strictEqual(U.visitors, 4);
  assert.strictEqual(U.returning, 1);
  // a shorter window leaves the older visitor out of the counts but still knows A was seen before
  const V = US.summarize(await store.all(), '2026-11-11', 2);
  assert.deepStrictEqual(V.daily.map((x) => [x.day, x.visitors, x.new]), [['2026-11-10', 1, 0], ['2026-11-11', 1, 1]]);
  assert.strictEqual(US.mondayOf('2026-11-15'), '2026-11-09');   // Sunday -> its Monday
  assert.strictEqual(US.mondayOf('2026-11-09'), '2026-11-09');
});
