const test = require('node:test');
const assert = require('node:assert');
const { buildMh, buildMhCatalog } = require('../mh');

const levels = buildMhCatalog([
  { level_id: 3, vendor: 'TALEEMABAD', order_index: 2, modules: 40, passing_pct: 80 },
  { level_id: 17, vendor: 'OXBRIDGE', order_index: 4, modules: 7, passing_pct: 70 },
  { level_id: 27, vendor: 'ISAPS', order_index: 0, modules: 54, passing_pct: 60 },
]);

test('mh: unpack teachers with level mix, programme, modules and certificates', () => {
  const rows = [
    { school_id: 'a', emis: 224, sector: 'Urban-I', school_name: 'IMSG F-6/1', n: 2, t: 'dbd66fd0|Aisha|MH|1||~eff30d29|Asma|PM|1|3:40,17:7|3,17' },
    { school_id: 'b', emis: '922', sector: 'Tarnol', school_name: 'IMCG G-14/4', n: 1, t: 'aa92ba98|Rabia|H|0|27:54|27' },
  ];
  const m = buildMh(rows, levels, 1);
  assert.deepStrictEqual(m.schools, [['224', 'Urban-I', 'IMSG F-6/1'], ['922', 'Tarnol', 'IMCG G-14/4']]);
  assert.deepStrictEqual(m.teachers[0], [0, 'Aisha', 'MH', 1, {}, []]);
  assert.deepStrictEqual(m.teachers[1], [0, 'Asma', 'PM', 1, { 3: 40, 17: 7 }, [3, 17]]);
  assert.deepStrictEqual(m.teachers[2], [1, 'Rabia', 'H', 0, { 27: 54 }, [27]]);
  assert.strictEqual(m.levels.length, 3);
});

test('mh: refuses a short answer, primary-only teachers and unknown levels', () => {
  const ok = { school_id: 'a', emis: 1, sector: 'B.K', school_name: 'S', n: 1, t: 'x|A|M|1||' };
  assert.throws(() => buildMh([ok], levels, 2), /only 1 schools/);
  assert.throws(() => buildMh([{ ...ok, t: 'x|A|P|1||' }], levels, 1), /unexpected levels/);
  assert.throws(() => buildMh([{ ...ok, t: 'x|A|M|1|99:3|' }], levels, 1), /unknown level/);
  assert.throws(() => buildMh([{ ...ok, n: 2 }], levels, 1), /record count mismatch/);
});
