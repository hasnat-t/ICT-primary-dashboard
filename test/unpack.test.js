const test = require('node:test');
const assert = require('node:assert');
const U = require('../unpack.js');

const roster = () => U.buildRoster([
  { school_id: 'sB', emis: '20', sector: 'Tarnol', school_name: 'IMCG G-14/4', n: 2, t: 'aaaa1111|Fouzia|P~bbbb2222|Ayesha Latif|PM' },
  { school_id: 'sA', emis: '10', sector: 'B.K', school_name: 'IMSB Bhara Kahu', n: 1, t: 'cccc3333||P' },
], 1);

test('roster: schools sorted by sector, teachers indexed, blank name labelled', () => {
  const ro = roster();
  assert.deepStrictEqual(ro.schools.map((s) => s.sector), ['B.K', 'Tarnol']);
  assert.strictEqual(ro.teachers.length, 3);
  assert.strictEqual(ro.teachers[0].name, '(no name)');
  assert.strictEqual(ro.index.get('sB:bbbb2222'), 2);
  assert.strictEqual(ro.teachers[2].lv, 'PM');
});

test('roster: too few schools, count mismatch and redaction all refuse to publish', () => {
  assert.throws(() => U.buildRoster([{ school_id: 'x', n: 1, t: 'a|b|P' }]), /only 1 schools/);
  assert.throws(() => U.buildRoster([{ school_id: 'x', n: 2, t: 'a|b|P' }], 1), /count mismatch/);
  assert.throws(() => U.buildRoster([{ school_id: 'x', n: 1, t: '<redacted:policy>' }], 1), /withheld/);
});

test('lp and observations unpack to arrays; unknown teachers fail the part', () => {
  const ro = roster();
  assert.deepStrictEqual(U.buildLp([{ school_id: 'sA', n: 1, t: 'cccc3333:5:1:0:2:1:1' }], ro), [[0, 5, 1, 0, 2, 1, 1]]);
  assert.throws(() => U.buildLp([{ school_id: 'sA', n: 1, t: 'zzzz9999:5:1:0:2:1:1' }], ro), /not in the roster/);
  const o = U.buildObservations([{ school_id: 'sB', n: 1, observe2_excluded: 2, t: 'aaaa1111:40:H:C:18:24:30:48:20:28:::::cccc0001:r' }], ro);
  assert.deepStrictEqual(o.rows, [[1, 40, 'H', 'C', 18, 24, 30, 48, 20, 28, null, null, '', '', 'cccc0001', 'r']]);
  assert.deepStrictEqual(U.buildCoaches([{ school_id: 'coaches', n: 2, t: 'cccc0001|Ayesha K|coach~cccc0002||coach' }]),
    [{ id: 'cccc0001', name: 'Ayesha K', role: 'coach' }, { id: 'cccc0002', name: '', role: 'coach' }]);
  assert.throws(() => U.buildCoaches([{ school_id: 'coaches', n: 2, t: 'cccc0001|A|coach~cccc0001|B|coach' }]), /duplicate/);
  assert.deepStrictEqual(U.buildCoaches([{ school_id: 'coaches', n: 3, t: 'cccc0001|A|coach~cccc0002|B|principal~cccc0003|C|coach' }],
    { hide_roles: ['principal'], hide: { cccc0003: 'C' }, rename: { cccc0001: 'A2' } }).map((c) => [c.name, !!c.hide]), [['A2', false], ['B', true], ['C', true]]);
  assert.deepStrictEqual(U.buildTeacherGrades([{ school_id: 'sB', n: 1, t: 'aaaa1111|4,5' }], ro), [[1, '4,5']]);
  assert.strictEqual(o.observe2_excluded, 2);
});

test('quizzes: teacher and whole-school records', () => {
  const ro = roster();
  const q = U.buildQuizzes([{ school_id: 'sB', n: 5,
    t: 'm:aaaa1111:3:2~s:aaaa1111:3:L:4:3:4~s:*:3:L:4:3:4~w:*:2:L:4~a:aaaa1111:E:4' }], ro);
  assert.deepStrictEqual(q.made, [[1, 3, 2]]);
  assert.deepStrictEqual(q.sit, [[1, 3, 'L', 4, 3, 4], [-2, 3, 'L', 4, 3, 4]]);   // school index 1 -> -2
  assert.deepStrictEqual(q.buckets, [[-2, 'w', '2', 'L', 4], [1, 'a', '', 'E', 4]]);
  const s = U.buildQuizSectors([{ area: 'ALL', n: 2, t: 'a:E:10~d:3:L:4' }]);
  assert.deepStrictEqual(s.ALL, [['a', '', 'E', 10], ['d', '3', 'L', 4]]);
  assert.throws(() => U.buildQuizSectors([{ area: 'B.K', n: 0, t: '' }]), /no all-ICT line/);
});

test('training unpacks per teacher', () => {
  const ro = roster();
  assert.deepStrictEqual(U.buildTraining([{ school_id: 'sB', n: 1, t: 'bbbb2222:1:46:46:3:0:12' }], ro), [[2, 1, 46, 46, 3, 0, '12']]);
});

test('exams unpack per teacher-day', () => {
  const ro = roster();
  assert.deepStrictEqual(U.buildExams([{ school_id: 'sB', n: 1, t: 'aaaa1111:40:3:2:1:0:1' }], ro), [[1, 40, 3, 2, 1, 0, 1]]);
  assert.throws(() => U.buildExams([{ school_id: 'sB', n: 1, t: 'aaaa1111:40:3:2' }], ro), /malformed/);
});

test('lesson detail: catalogue, typed plans and unknown lessons', () => {
  const ro = roster();
  const cat = Array.from({ length: 100 }, (_, i) => ({ id: `grade_1_urdu_ch1_seg${i}`, grade: '1', subject: 'urdu', title: `L${i}` }));
  const d = U.buildLpDetail([{ school_id: 'sB', n: 3, t: 'p:aaaa1111:5:9:grade_1_urdu_ch1_seg3:2~p:aaaa1111:5:10::1~t:aaaa1111:6:grade_4_math_ch2_seg1:1' }], ro, cat);
  assert.deepStrictEqual(d.gen, [[1, 5, 9, 4, 2], [1, 5, 10, 0, 1]]);
  assert.deepStrictEqual(d.taught, [[1, 6, 101, 1]]);
  assert.deepStrictEqual(d.lessons[101], { id: 'grade_4_math_ch2_seg1', grade: '4', subject: 'math', title: '' });
  assert.throws(() => U.buildLessons([{ subject: 'urdu', n: 1, t: 'a|1|x' }]), /only 1 lessons/);
});
