const test = require('node:test');
const assert = require('node:assert');
const C = require('../public/calc.js');

const START = '2026-08-01';   // a Saturday

// Two sectors, three schools, four teachers; today = day 30 (31 Aug).
function sample() {
  return {
    window_start: START, today: 30,
    schools: [{ emis: '1', sector: 'A', name: 'S1', n: 2 }, { emis: '2', sector: 'A', name: 'S2', n: 1 }, { emis: '3', sector: 'B', name: 'S3', n: 1 }],
    teachers: [{ s: 0, name: 'T0', lv: 'P' }, { s: 0, name: 'T1', lv: 'PM' }, { s: 1, name: 'T2', lv: 'P' }, { s: 2, name: 'T3', lv: 'P' }],
    lp: [[0, 2, 1, 0, 2, 1, 1], [0, 9, 1, 0, 1, 0, 1], [1, 9, 0, 1, 0, 0, 0], [3, 20, 1, 0, 1, 1, 1]],
    obs: [
      [0, 2, 'D', 'L', 18, 24, 30, 48, 20, 28, 30, 40],      // v3 subject scale; taught a recent Rumi plan
      [0, 3, 'D', '-', 20, 32, 24, 48, 14, 28, null, null],  // v2 subject scale, no plan attached
      [2, 3, 'H', 'C', 12, 24, 36, 48, 21, 28, 20, 40],
      [2, 4, 'H', 'P', 10, 20, 12, 16, 21, 28, 20, 40],      // HLP out of 16 = unknown scale: not pooled
    ],
    quiz: {
      made: [[0, 2, 3], [3, 20, 1]],
      sit: [[0, 2, 'L', 5, 4, 5], [-1, 2, 'L', 5, 4, 5], [0, 3, 'L', 2, 2, 2], [-1, 3, 'L', 2, 2, 2]],
      buckets: [[0, 'w', '2', 'L', 6], [-1, 'w', '2', 'L', 6], [0, 'o', '202608', 'L', 6], [-1, 'o', '202608', 'L', 6], [0, 'a', '', 'L', 6], [-1, 'a', '', 'L', 6]],
    },
    quiz_sectors: { A: [['a', '', 'L', 6], ['o', '202608', 'L', 6], ['w', '2', 'L', 6]], B: [], ALL: [['a', '', 'L', 6], ['o', '202608', 'L', 6], ['w', '2', 'L', 6]] },
    exams: [[0, 9, 3, 2, 1, 0, 1], [3, 20, 1, 1, 0, 0, 0]],
    training: [[0, 1, 46, 10, 0, 0, '1'], [3, 0, 5, 0, 0, 0, '']],
  };
}

test('day and week helpers', () => {
  assert.strictEqual(C.dayToDate(START, 0), '2026-08-01');
  assert.strictEqual(C.dateToDay(START, '2026-09-08'), 38);
  assert.strictEqual(C.mondayOf(START, 0), -5);          // Mon 27 Jul
  assert.strictEqual(C.mondayOf(START, 2), 2);           // Mon 3 Aug
  assert.strictEqual(C.monthKey(START, 31), '202609');
});

test('distinct-children bucket only for whole days, weeks, months or the full period', () => {
  const b = (f, t) => C.childBucket(START, 30, f, t);
  assert.deepStrictEqual(b(0, 30), { type: 'a', key: '' });
  assert.deepStrictEqual(b(5, 5), { type: 'd', key: '5' });
  assert.deepStrictEqual(b(2, 8), { type: 'w', key: '2' });
  assert.deepStrictEqual(b(0, 1), { type: 'w', key: '-5' });   // first, partial week
  assert.deepStrictEqual(b(0, 30, 'x'), { type: 'a', key: '' });
  assert.strictEqual(b(2, 9), null);                           // crosses a week
  assert.deepStrictEqual(C.childBucket(START, 60, 31, 60), { type: 'o', key: '202609' });   // September so far
});

test('roll-up: LP usage, observations kept apart, FICO versions separate', () => {
  const P = C.prepare(sample());
  const r = C.rollup(P, { from: 0, to: 30 });
  assert.strictEqual(r.all.teachers, 4);
  assert.strictEqual(r.all.g15, 2);          // T0 and T3 got grade 1-5 plans; T1 only 6-12
  assert.strictEqual(r.all.lpAny, 3);
  assert.strictEqual(r.all.plans, 4);
  assert.strictEqual(r.all.taught, 1);                     // DC observations with a recent Rumi plan attached
  assert.strictEqual(r.all.dc, 2);
  assert.strictEqual(r.all.hitl, 2);
  assert.strictEqual(r.all.hitlC, 1);
  assert.strictEqual(r.all.hitlP, 1);
  // DC subject knowledge: v3 18/24 only; v2 20/32 only - never pooled
  assert.deepStrictEqual(r.all.ficoD.tsk3, [18, 24, 1]);
  assert.deepStrictEqual(r.all.ficoD.tsk2, [20, 32, 1]);
  assert.deepStrictEqual(r.all.ficoD.lpf, [30, 40, 1]);     // the no-plan session has no LPF
  // HITL teaching practices: the out-of-16 session is left out and counted
  assert.deepStrictEqual(r.all.ficoH.hlp, [36, 48, 1]);
  assert.strictEqual(r.all.odd, 1);
  assert.strictEqual(C.pct(r.all.ficoH.se), 75);
  assert.strictEqual(r.sectors.get('A').teachers, 3);
  assert.strictEqual(r.sectors.get('B').teachers, 1);
  assert.strictEqual(r.all.onProg, 1);
  assert.strictEqual(r.all.quizLT, 1);                     // teachers whose children took a lesson quiz
  assert.strictEqual(r.all.didModule, 2);
  assert.deepStrictEqual(r.all.cert, [1, 0, 0, 0]);
});

test('children come from the bucket at each level, never summed from below', () => {
  const P = C.prepare(sample());
  const all = C.rollup(P, { from: 0, to: 30 });
  assert.strictEqual(all.all.kidsL, 6);
  assert.strictEqual(all.all.sitL, 7);
  assert.strictEqual(all.schools.get(0).kidsL, 6);
  const day = C.rollup(P, { from: 2, to: 2 });
  assert.strictEqual(day.teachers[0].kidsL, 5);
  const odd = C.rollup(P, { from: 2, to: 9 });               // not a whole week: no exact count
  assert.strictEqual(odd.all.kidsL, null);
  assert.strictEqual(odd.all.sitL, 7);
});

test('filters by sector and school, and series sums match the roll-up', () => {
  const P = C.prepare(sample());
  const a = C.rollup(P, { from: 0, to: 30, sector: 'A' });
  assert.strictEqual(a.all.teachers, 3);
  const s = C.rollup(P, { from: 0, to: 30, school: 2 });
  assert.strictEqual(s.all.teachers, 1);
  assert.strictEqual(s.all.plans, 1);
  for (const gran of ['day', 'week', 'month']) {
    const ser = C.series(P, { from: 0, to: 30 }, gran);
    assert.strictEqual(ser.reduce((n, g) => n + g.plans, 0), 4, gran);
    assert.strictEqual(ser.reduce((n, g) => n + g.dc, 0), 2, gran);
    assert.strictEqual(ser.reduce((n, g) => n + g.made, 0), 4, gran);
  }
  const weeks = C.series(P, { from: 0, to: 30 }, 'week');
  assert.strictEqual(weeks[0].kidsL, 0);                    // 1-2 Aug: no sittings, so no bucket row = no children
  assert.strictEqual(weeks[1].kidsL, 6);                    // week of Mon 3 Aug, from the ALL line
  assert.strictEqual(C.rollup(P, { from: 2, to: 8 }).all.kidsL, 6);
});

test('exam papers: delivered, failed and teachers, by period', () => {
  const P = C.prepare(sample());
  const r = C.rollup(P, { from: 0, to: 30 });
  assert.strictEqual(r.all.exReq, 4);
  assert.strictEqual(r.all.exOk, 3);
  assert.strictEqual(r.all.exFail, 1);
  assert.strictEqual(r.all.exT, 2);
  assert.strictEqual(r.sectors.get('B').exOk, 1);
  assert.strictEqual(C.rollup(P, { from: 0, to: 10 }).all.exOk, 2);
  assert.strictEqual(C.series(P, { from: 0, to: 30 }, 'week').reduce((n, g) => n + g.exOk, 0), 3);
});

test('lesson-plan analytics: subject, weekday, hour and lessons taught', () => {
  const data = sample();
  data.lpd = {
    lessons: [{ id: '', grade: '', subject: '', title: 'Typed' }, { id: 'grade_5_math_ch1_seg1', grade: '5', subject: 'math', title: 'Fractions' }],
    gen: [[0, 2, 9, 1, 2], [3, 20, 10, 0, 1]],     // Mon 3 Aug 09:00, two maths plans; Fri 21 Aug 10:00, one typed plan
    taught: [[0, 3, 1, 1]],
  };
  const L = C.lessonStats(C.prepare(data), { from: 0, to: 30 });
  assert.strictEqual(L.genTotal, 3);
  assert.strictEqual(L.taughtTotal, 1);
  const maths = L.subjects.find((x) => x.key === 'Mathematics');
  assert.deepStrictEqual([maths.gen, maths.taught, maths.teachersGen], [2, 1, 1]);
  assert.strictEqual(L.wd[0], 2);           // Monday
  assert.strictEqual(L.wd[4], 1);           // Friday
  assert.strictEqual(L.hrs[9], 2);
  assert.strictEqual(L.wdDays.reduce((a, b) => a + b, 0), 31);
  assert.strictEqual(L.lessons.find((x) => x.lesson.title === 'Fractions').taught, 1);
  assert.strictEqual(C.lessonStats(C.prepare(data), { from: 0, to: 30, sector: 'B' }).genTotal, 1);
});

test('quiz scores: pooled score, grade x subject grid, filters', () => {
  const data = sample();
  data.qscore = [[0, 2, '3-5', 'maths', 2, 14, 16, 1, 1, 0], [3, 20, '1', 'urdu', 1, 8, 8, 1, 0, 0]];
  const P = C.prepare(data);
  const r = C.rollup(P, { from: 0, to: 30 });
  assert.deepStrictEqual([r.all.qF, r.all.qC, r.all.qA, r.all.qT], [3, 22, 24, 2]);
  const g = C.quizGrid(P, { from: 0, to: 30 });
  assert.deepStrictEqual(g.grades, ['Grade 1', 'Grades 3–5']);
  assert.strictEqual(g.cells.get('Grades 3–5|Mathematics').c, 14);
  assert.strictEqual(g.all.m, 2);
  assert.strictEqual(C.quizGrid(P, { from: 0, to: 30, sector: 'B' }).all.f, 1);
  const wk = C.series(P, { from: 0, to: 30 }, 'week');
  assert.strictEqual(wk.reduce((n, x) => n + x.qF, 0), 3);
});
