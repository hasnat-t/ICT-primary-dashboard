const test = require('node:test');
const assert = require('node:assert');
const CC = require('../coachcheck');

test('coach caseload: password gate', () => {
  assert.strictEqual(CC.createGate('')('x', 'ip'), 'off');
  const gate = CC.createGate('secret', 3);
  assert.strictEqual(gate('secret', 'a'), 'ok');
  assert.deepStrictEqual([gate('no', 'a'), gate('no', 'a'), gate('no', 'a'), gate('secret', 'a')], ['wrong', 'wrong', 'wrong', 'blocked']);
  assert.strictEqual(gate('secret', 'b'), 'ok');   // other visitors are not blocked
  assert.strictEqual(gate(undefined, 'c'), 'wrong');
});
