const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CC = require('../coachcheck');

const DQ = [['205', 'Urban-I', 'IMS G-6/1-4', 17, 'Aleeha Noor', 1], ['908', 'Urban-I', 'ICB G-6/3', 143, 'Maroof Anwar, Mubashar Zia', 2], ['300', 'Urban-I', 'IMS F-8/3', 14, '', 0]];

test('coach check: validation', () => {
  const idx = CC.schoolIndex(DQ);
  assert.deepStrictEqual(CC.validate({ coach: 'Aleeha Noor', emis: '205', answer: 'yes' }, idx).row, { coach: 'Aleeha Noor', emis: '205', answer: 'yes' });
  assert.strictEqual(CC.validate({ coach: 'Mubashar Zia', emis: 908, answer: 'no' }, idx).row.emis, '908');
  assert.ok(CC.validate({ coach: 'Aleeha Noor', emis: '908', answer: 'yes' }, idx).error);   // not hers: use Add
  assert.strictEqual(CC.validate({ coach: 'Aleeha Noor', emis: '300', answer: 'add' }, idx).row.answer, 'add');
  assert.ok(CC.validate({ coach: 'Aleeha Noor', emis: '205', answer: 'add' }, idx).error);   // already hers
  assert.ok(CC.validate({ coach: 'Someone Else', emis: '205', answer: 'yes' }, idx).error);
  assert.ok(CC.validate({ coach: 'Aleeha Noor', emis: '999', answer: 'yes' }, idx).error);
  assert.ok(CC.validate({ coach: 'Aleeha Noor', emis: '205', answer: 'maybe' }, idx).error);
  assert.strictEqual(CC.validate({ coach: 'Aleeha Noor', emis: '205', answer: '' }, idx).row.answer, '');   // undo
});

test('coach check: store and password gate', async () => {
  const store = CC.createStore({ pool: null, file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-')), 'cc.json') });
  await store.set({ coach: 'Aleeha Noor', emis: '205', answer: 'yes' });
  await store.set({ coach: 'Aleeha Noor', emis: '205', answer: 'no' });     // changes, not a second row
  await store.set({ coach: 'Aleeha Noor', emis: '300', answer: 'add' });
  assert.deepStrictEqual((await store.list()).map((x) => [x.emis, x.answer]), [['205', 'no'], ['300', 'add']]);
  await store.set({ coach: 'Aleeha Noor', emis: '300', answer: '' });
  assert.deepStrictEqual((await store.list()).map((x) => x.emis), ['205']);

  assert.strictEqual(CC.createGate('')('x', 'ip'), 'off');
  const gate = CC.createGate('secret', 3);
  assert.strictEqual(gate('secret', 'a'), 'ok');
  assert.deepStrictEqual([gate('no', 'a'), gate('no', 'a'), gate('no', 'a'), gate('secret', 'a')], ['wrong', 'wrong', 'wrong', 'blocked']);
  assert.strictEqual(gate('secret', 'b'), 'ok');   // other visitors are not blocked
});
