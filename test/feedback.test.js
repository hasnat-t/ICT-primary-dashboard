const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FB = require('../feedback');

test('feedback: validation, spam trap, limits, file store, admin check', async () => {
  assert.ok(FB.validate({ message: 'short' }).error);
  assert.deepStrictEqual(FB.validate({ message: 'This chart is too small on my phone', website: 'x' }), { spam: true });
  const ok = FB.validate({ type: 'nonsense', message: '  The DC tab shows a different total than the overview  ', name: ' Ali ', tab: 'DC observations' });
  assert.strictEqual(ok.row.type, 'other');
  assert.strictEqual(ok.row.message, 'The DC tab shows a different total than the overview');
  assert.strictEqual(ok.row.name, 'Ali');
  assert.strictEqual(FB.validate({ type: 'data', message: 'x'.repeat(5000) }).row.message.length, 3000);

  const limit = FB.createLimiter();
  for (let i = 0; i < 8; i++) assert.ok(limit('1.2.3.4'));
  assert.strictEqual(limit('1.2.3.4'), false);           // ninth in an hour from the same visitor
  assert.ok(limit('5.6.7.8'));

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fb-')), 'feedback.json');
  const store = FB.createStore({ pool: null, file });
  const a = await store.add(ok.row);
  await store.add({ ...ok.row, type: 'bug', message: 'The page does not load on Firefox' });
  assert.strictEqual(a.id, 1);
  assert.strictEqual((await store.list({ days: 30 })).length, 2);
  await store.update(1, { status: 'approved', note: 'Next sprint' });
  const approved = await store.list({ status: 'approved', days: 30 });
  assert.deepStrictEqual([approved.length, approved[0].admin_note], [1, 'Next sprint']);
  assert.strictEqual(await store.update(99, { status: 'done' }), null);

  assert.strictEqual(FB.isAdmin({ headers: { 'x-admin-token': 'secret-1' } }, 'secret-1'), true);
  assert.strictEqual(FB.isAdmin({ headers: { 'x-admin-token': 'secret-2' } }, 'secret-1'), false);
  assert.strictEqual(FB.isAdmin({ headers: {} }, ''), false);     // closed when no token is configured
});
