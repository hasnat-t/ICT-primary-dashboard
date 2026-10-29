const test = require('node:test');
const assert = require('node:assert');
const E = require('../egra');

const ro = { schoolIndex: new Map([['sA', 0], ['sB', 1]]) };
const rec = (d, g, done, counted, child, ur, en, tasks) => [d, g, done, counted, child, 'Urban-I', ur, en, '0', tasks].join(':');
const blank = Array(17).fill('');
const tasks = (o) => { const t = blank.slice(); for (const [i, v] of Object.entries(o)) t[i] = v; return t.join(','); };

test('egra: unpack, masking under five children, proposed benchmarks', () => {
  const rows = [{ school_id: 'sA', n: 7, t: [
    rec(87, 3, 1, 1, 'c1', 0, 12, tasks({ 4: '0/4', 9: '3/3', 10: '8/8', 11: '2/2', 16: '15/' })),
    rec(87, 3, 1, 1, 'c2', 25, 45, tasks({ 4: '4/4', 10: '6/8', 11: '2/2' })),
    rec(87, 4, 1, 1, 'c3', 45, '', tasks({ 4: '3/4', 10: '8/8' })),
    rec(88, 4, 0, 1, 'c4', 10, 20, tasks({ 10: '2/8' })),
    rec(88, 5, 1, 1, 'c5', '', '', tasks({})),
    rec(88, 5, 1, 0, 'x1', 50, 50, tasks({})),
    rec(88, 5, 1, 1, 'c6', 60, 60, tasks({ 4: '4/4' })),
  ].join('~') }];
  const all = E.buildEgra(rows, ro);
  assert.strictEqual(all.length, 7);
  assert.strictEqual(all[0].t[16][0], 15);
  const s = E.egraSummary(all, {}, { schools: [{ sector: 'Urban-I' }, { sector: 'B.K' }] }, { from: 0, to: 100 });
  assert.deepStrictEqual([s.all.children, s.all.completed, s.excluded], [6, 5, 1]);
  assert.deepStrictEqual(s.all.ur.bands, [1, 1, 1, 2]);          // 0 | 10 | 25 | 45, 60
  assert.strictEqual(s.all.ur.median, 25);
  assert.deepStrictEqual([s.all.ur.compScored, s.all.ur.compMet], [4, 2]);   // 0/4, 4/4, 3/4 (75% < 80%), 4/4
  assert.deepStrictEqual([s.all.maths.scored, s.all.maths.met], [4, 3]);     // c4 2/8 below 75%
  assert.ok(s.grades.every((g) => g.masked));                                 // every grade has fewer than 5 children
  assert.strictEqual(s.grades[0].children, 'fewer than 5');
  assert.strictEqual(E.egraSummary(all, {}, null, { from: 88, to: 88 }).all.masked, true);   // 3 children that day
});
