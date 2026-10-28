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
      [0, 2, 'D', 'L', 18, 24, 30, 48, 20, 28, 30, 40, 'm', 'r3'], // v3 subject scale; taught a recent Rumi plan
      [0, 3, 'D', '-', 20, 32, 24, 48, 14, 28, null, null, 'u', ''], // v2 subject scale, no plan attached
      [2, 3, 'H', 'C', 12, 24, 36, 48, 21, 28, 20, 40, '', '', 'cccc0001', 'r'],
      [2, 4, 'H', 'P', 10, 20, 12, 16, 21, 28, 20, 40, '', 'r4', 'cccc0001', 'u'],      // HLP out of 16 = unknown scale: not pooled
    ],
    quiz: {
      made: [[0, 2, 3], [3, 20, 1]],
      sit: [[0, 2, 'L', 5, 4, 5], [-1, 2, 'L', 5, 4, 5], [0, 3, 'L', 2, 2, 2], [-1, 3, 'L', 2, 2, 2]],
      buckets: [[0, 'w', '2', 'L', 6], [-1, 'w', '2', 'L', 6], [0, 'o', '202608', 'L', 6], [-1, 'o', '202608', 'L', 6], [0, 'a', '', 'L', 6], [-1, 'a', '', 'L', 6]],
    },
    quiz_sectors: { A: [['a', '', 'L', 6], ['o', '202608', 'L', 6], ['w', '2', 'L', 6]], B: [], ALL: [['a', '', 'L', 6], ['o', '202608', 'L', 6], ['w', '2', 'L', 6]] },
    exams: [[0, 9, 3, 2, 1, 0, 1], [3, 20, 1, 1, 0, 0, 0]],
    training: [[0, 1, 46, 10, 0, 0, '1'], [3, 0, 5, 0, 0, 0, '']],
    tgr: [[0, '4,5']],
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
  assert.deepStrictEqual(g.grades, ['Grade 1', 'Grades 3–5 (exact grade not recorded)']);
  assert.strictEqual(g.cells.get('Grades 3–5 (exact grade not recorded)|Mathematics').c, 14);
  assert.strictEqual(g.all.m, 2);
  assert.strictEqual(C.quizGrid(P, { from: 0, to: 30, sector: 'B' }).all.f, 1);
  const wk = C.series(P, { from: 0, to: 30 }, 'week');
  assert.strictEqual(wk.reduce((n, x) => n + x.qF, 0), 3);
});

test('exam analytics: subjects, sources, surfaces, weekdays, chapters', () => {
  const data = sample();
  data.exd = [[0, 2, 9, '4', 'maths', 's', 'w', '3', 2, 2, 20, 15, 5, ''], [3, 20, 15, '5', 'urdu', 'u', 'p', '', 1, 0, 10, 10, 0, ''],
    [3, 21, 10, '5', 'science', 'u', 'p', '', 3, 3, 90, 60, 30, 'f'], [0, 22, 11, '5', 'science', 'u', 'p', '', 1, 1, 30, 20, 10, 'c']];
  const E = C.examStats(C.prepare(data), { from: 0, to: 30 });
  assert.deepStrictEqual([E.req, E.gen, E.q, E.obj, E.subjq, E.teachers], [7, 6, 150, 105, 45, 2]);
  assert.deepStrictEqual([E.board.req, E.board.gen, E.board.teachers], [4, 4, 2]);
  assert.strictEqual(E.board.scopes.find((x) => x.key === 'f').gen, 3);
  assert.strictEqual(E.board.days.get(21), 3);
  const R = C.rollup(C.prepare(data), { from: 0, to: 30 });
  assert.deepStrictEqual([R.all.fde, R.all.fdeReq, R.all.fdeT], [4, 4, 2]);
  assert.strictEqual(E.subjects.find((x) => x.key === 'Mathematics').gen, 2);
  assert.strictEqual(E.sources.find((x) => x.key === 'u').req, 5);
  assert.strictEqual(E.wd[0], 2);                         // generated on Monday 3 Aug
  assert.deepStrictEqual(E.chapters.map((c) => c.key), ['Grade 4|Mathematics|3']);
  assert.strictEqual(C.examStats(C.prepare(data), { from: 0, to: 30, sector: 'A' }).req, 3);
});

test('DC analytics: by lesson subject and by roster grade (a teacher on two grades counts in each)', () => {
  const data = sample();
  data.obs.push([3, 5, 'D', '-', 12, 24, 24, 48, 14, 28, null, null, 'm', '']);
  const D = C.dcStats(C.prepare(data), { from: 0, to: 30 });
  assert.deepStrictEqual([D.n, D.teachers], [3, 2]);
  assert.deepStrictEqual(D.subjects.map((x) => [x.key, x.n]), [['Mathematics', 2], ['Urdu', 1]]);
  // lesson 1: Rumi plan grade 3; lesson 2: no plan grade -> roster grades 4 and 5; lesson 3: no grade at all
  assert.deepStrictEqual(D.grades.map((x) => [x.key, x.n]), [['Grade 3', 1], ['Grade 4', 1], ['Grade 5', 1], ['Grade unknown', 1]]);
  assert.deepStrictEqual(D.gsrc, { r: 1, t: 0, roster: 1, none: 1 });
  assert.strictEqual(D.cells.get('Grade 3|Mathematics').n, 1);
  assert.deepStrictEqual(D.subjects[0].fico.hlp, [54, 96, 2]);
  assert.strictEqual(C.dcStats(C.prepare(data), { from: 0, to: 30, sector: 'B' }).n, 1);
});

test('HITL analytics: observations per teacher, coaches, AI-form edits, grade from plan', () => {
  const data = sample();
  data.coaches = [{ id: 'cccc0001', name: 'Coach A', role: 'coach' }];
  const H = C.hitlStats(C.prepare(data), { from: 0, to: 30 });
  assert.deepStrictEqual([H.n, H.teachers, H.observed], [2, 4, 1]);
  assert.deepStrictEqual(H.per, [3, 0, 1, 0, 0]);
  assert.deepStrictEqual([H.edits.u, H.edits.r, H.edits.n], [1, 1, 0]);
  assert.deepStrictEqual(H.coaches.map((c) => [c.name, c.n, c.teachers, c.C, c.r, c.school]), [['Coach A', 2, 1, 1, 1, 'S2']]);
  data.coaches[0] = { id: 'cccc0001', name: 'Head A', role: 'principal', hide: true };
  const H2 = C.hitlStats(C.prepare(data), { from: 0, to: 30 });
  assert.deepStrictEqual([H2.coaches.length, H2.principals.length, H2.principals[0].n, H2.hidden, H2.n], [0, 1, 2, 0, 2]);
  const G = C.dcStats(C.prepare(data), { from: 0, to: 30 }, 'H');
  assert.deepStrictEqual(G.grades.map((x) => [x.key, x.n]), [['Grade 4', 1], ['Grade unknown', 1]]);
});

test('/observe2: indicator levels, priorities, repeat visits, kept apart from HITL', () => {
  const data = sample();
  data.o2 = [[2, 10, 'cccc0001', 'C', '1234n123412341234', 'C7', ['D1'], ['recall'], 50, null, null],
    [2, 20, 'cccc0001', 'P', '23443234423442344', 'C7', [], [], 60, null, null]];
  const O = C.observe2Stats(C.prepare(data), { from: 0, to: 30 });
  assert.deepStrictEqual([O.n, O.teachers, O.C, O.repeat], [2, 1, 1, 1]);
  assert.deepStrictEqual(O.ind[0].c['1'], 1);
  assert.strictEqual(O.ind[4].c.n, 1);
  assert.deepStrictEqual(O.prio, [['C7', 2]]);
  assert.strictEqual(O.change[0], null);                  // one repeat teacher: too few for an arrow
  assert.strictEqual(O.overallChange.d, 10);
  assert.strictEqual(C.rollup(C.prepare(data), { from: 0, to: 30 }).all.hitl, 2);   // /observe2 does not touch HITL
});

test('pilot: DC vs provisional, evidence check, joint and cross-coach agreement', () => {
  const data = sample();
  const f = (o) => ({ f: 'x', c: 'c1', t: 't1', ti: 0, sector: 'A', d: 10, st: 'c', prov: '22222222222220000'.replace(/0/g, '-'), dc: '2-------3--------'.replace(/(?<=^.{1})-/, '-'),
    fin: '22222222322223333', pp: 'C7', fp: 'C7', ev: [2, 1, 1, 0, 0, 0, 0, 0], holes: 1, fid: [1, 0, 0, 0, 0], linked: true, min: [30, 10], ...o });
  data.pilot = [f({}), f({ f: 'y', c: 'c2', fp: 'D5', fin: '22222222222223333' }), f({ f: 'z', c: 'c2', d: 17, fin: '32222222222223333' }), f({ f: 'w', st: 's' })];
  const Q = C.pilotStats(C.prepare(data), { from: 0, to: 30 });
  assert.deepStrictEqual([Q.forms, Q.done, Q.coaches, Q.joint, Q.cross], [4, 3, 2, 1, 1]);
  assert.strictEqual(Math.round(Q.ind[0].dcVsFinal.exact * 3), 2);   // C1: DC 2 matches the coach's final 2, 2, 3
  assert.strictEqual(Q.ind[8].dcVsFinal.n, 3);             // D1 rated by the DC
  assert.deepStrictEqual([Q.prioJoint.n, Q.prioJoint.same], [1, 0]);
  assert.strictEqual(Q.ev[0].yes, 6);
});
