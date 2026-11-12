const test = require('node:test');
const assert = require('node:assert');
const { buildDq } = require('../dq');

test('dq: unpack schools, flagged teachers and unassigned coaches', () => {
  const rows = [
    { school_id: 'a', emis: 224, sector: 'Urban-I', school_name: 'IMSG F-6/1', teachers: 40, ncoach: 2, coaches: 'Sara, Ali', n: 3, t: 'dbd66fd0|Aisha|L~eff30d29||LN~aa000001|Asma|D' },
    { school_id: 'b', emis: '922', sector: null, school_name: 'Empty', teachers: 0, ncoach: 0, coaches: null, n: 0, t: null },
  ];
  const d = buildDq(rows, [{ school_id: 'coaches', n: 2, t: '7b770502|~1dd6313a|Hamza' }], 1);
  assert.deepStrictEqual(d.schools, [['224', 'Urban-I', 'IMSG F-6/1', 40, 'Sara, Ali', 2], ['922', '(no sector)', 'Empty', 0, '', 0]]);
  assert.deepStrictEqual(d.teachers, [[0, 'Aisha', 'L'], [0, '', 'LN'], [0, 'Asma', 'D']]);
  assert.deepStrictEqual(d.coaches, ['', 'Hamza']);
});

test('dq: refuses a short answer, bad flags and count mismatches', () => {
  const ok = { school_id: 'a', emis: 1, sector: 'B.K', school_name: 'S', teachers: 1, ncoach: 1, coaches: 'C', n: 1, t: 'x|A|L' };
  assert.throws(() => buildDq([ok], [], 2), /only 1 schools/);
  assert.throws(() => buildDq([{ ...ok, t: 'x|A|Q' }], [], 1), /unexpected flags/);
  assert.throws(() => buildDq([{ ...ok, t: 'x|A|' }], [], 1), /unexpected flags/);
  assert.throws(() => buildDq([{ ...ok, n: 2 }], [], 1), /record count mismatch/);
  assert.throws(() => buildDq([ok], [{ school_id: 'coaches', n: 1, t: 'x|A|B' }], 1), /malformed/);
});

test('dq: coach overrides rename coaches and drop staff accounts', () => {
  const ov = { hide: { aaaaaaaa: 'Staff' }, rename: { bbbbbbbb: 'New Name' } };
  const rows = [{ school_id: 'a', emis: 1, sector: 'B.K', school_name: 'S', teachers: 5, ncoach: 3, coaches: 'aaaaaaaa=Staff, bbbbbbbb=Old Name, cccccccc=Coach', n: 0, t: null },
    { school_id: 'b', emis: 2, sector: 'B.K', school_name: 'T', teachers: 1, ncoach: 1, coaches: 'aaaaaaaa=Staff', n: 0, t: null }];
  const d = buildDq(rows, [{ school_id: 'coaches', n: 2, t: 'aaaaaaaa|Staff~dddddddd|Free' }], 1, ov);
  assert.deepStrictEqual(d.schools.map((s) => [s[4], s[5]]), [['New Name, Coach', 2], ['', 0]]);
  assert.deepStrictEqual(d.coaches, ['Free']);
});
