const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EV = require('../events');

test('school calendar: validation and store', async () => {
  const known = { emis: new Set(['101', '102']), sectors: new Set(['Urban-I']) };
  const base = { coach: 'Saba Kokab', type: 'assessment', from: '2026-11-03', to: '2026-11-07', scope: 'schools', schools: ['101', '999'] };
  const ok = EV.validate(base, known);
  assert.deepStrictEqual(ok.row.schools, ['101']);                         // unknown EMIS dropped
  assert.ok(EV.validate({ ...base, schools: ['999'] }, known).error);
  assert.ok(EV.validate({ ...base, type: 'other' }, known).error);         // other needs a reason
  assert.strictEqual(EV.validate({ ...base, type: 'other', reason: 'Polio campaign' }, known).row.reason, 'Polio campaign');
  assert.ok(EV.validate({ ...base, to: '2026-11-01' }, known).error);       // end before start
  assert.ok(EV.validate({ ...base, to: '2027-06-30' }, known).error);       // too long
  assert.ok(EV.validate({ ...base, scope: 'sector', sector: 'Nowhere' }, known).error);
  assert.strictEqual(EV.validate({ ...base, scope: 'sector', sector: 'Urban-I' }, known).row.sector, 'Urban-I');
  assert.ok(EV.validate({ ...base, coach: '' }, known).error);

  const store = EV.createStore({ pool: null, file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-')), 'events.json') });
  const a = await store.add(ok.row);
  await store.add(EV.validate({ ...base, scope: 'all', type: 'winter', from: '2026-12-20', to: '2027-01-10' }, known).row);
  assert.deepStrictEqual((await store.list()).map((e) => [e.type, e.from]), [['assessment', '2026-11-03'], ['winter', '2026-12-20']]);
  assert.strictEqual(await store.remove(a.id), true);
  assert.strictEqual((await store.list()).length, 1);
  assert.strictEqual(await store.remove(a.id), false);
});
