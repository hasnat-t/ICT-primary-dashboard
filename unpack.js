// Unpacks and checks the per-school packed query results (records joined by "~", fields by ":") into the compact
// arrays the page reads. Anything malformed, withheld by the data service or not matching the roster throws, so a
// bad refresh never replaces good data.
const MIN_SCHOOLS = 300;                         // refuse to publish a roster smaller than this (354 on 2026-10-27)

// Split a school row's packed records, checking the count and that nothing was withheld.
function records(name, r, sep = ':') {
  const t = r.t || '';
  if (t.includes('redacted')) throw new Error(`${name}: data withheld by the data service`);
  const recs = t ? t.split('~') : [];
  if (recs.length !== Number(r.n)) throw new Error(`${name}: record count mismatch at school ${r.school_id}`);
  return recs.map((x) => x.split(sep));
}

const num = (v) => (v === '' || v === undefined ? null : Number(v));

function buildRoster(rows, minSchools = MIN_SCHOOLS) {
  if (rows.length < minSchools) throw new Error(`roster: only ${rows.length} schools returned`);
  const schools = [];
  const teachers = [];
  const index = new Map();                       // "school_id:tid8" -> teacher index
  const schoolIndex = new Map();
  rows.sort((a, b) => (a.sector || '').localeCompare(b.sector || '') || (a.school_name || '').localeCompare(b.school_name || ''));
  for (const r of rows) {
    const si = schools.length;
    schoolIndex.set(r.school_id, si);
    schools.push({ emis: String(r.emis || ''), sector: r.sector || '(none)', name: (r.school_name || '').trim() || `EMIS ${r.emis}`, n: Number(r.n) });
    for (const p of records('roster', r, '|')) {
      if (p.length !== 3) throw new Error('roster: malformed teacher record');
      const key = `${r.school_id}:${p[0]}`;
      if (index.has(key)) throw new Error('roster: duplicate teacher key');
      index.set(key, teachers.length);
      teachers.push({ s: si, name: p[1].trim() || '(no name)', lv: p[2] });
    }
  }
  return { schools, teachers, index, schoolIndex };
}

// Look up the teacher a record belongs to; records for teachers outside the roster are counted, not dropped silently.
function teacherOf(ro, schoolId, tid, miss) {
  const i = ro.index.get(`${schoolId}:${tid}`);
  if (i === undefined) miss.n++;
  return i;
}

function buildLp(rows, ro) {
  const out = [];
  const miss = { n: 0 };
  for (const r of rows) {
    for (const p of records('lp', r)) {
      if (p.length !== 7) throw new Error('lp: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti === undefined) continue;
      out.push([ti, +p[1], +p[2], +p[3], +p[4], +p[5], +p[6]]);   // teacher, day, g15, g612, plans, taught, answered
    }
  }
  if (miss.n) throw new Error(`lp: ${miss.n} records for teachers not in the roster`);
  return out;
}

function buildObservations(rows, ro) {
  const out = [];
  const miss = { n: 0 };
  let observe2 = 0;
  for (const r of rows) {
    observe2 += Number(r.observe2_excluded) || 0;
    for (const p of records('observations', r)) {
      if (p.length !== 16) throw new Error('observations: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti === undefined) continue;
      // teacher, day, src (D/H), stage (-/C/P/A), score,max for TSK, HLP, SE, LPF (null when not scored), DC lesson subject code,
      // plan grade (r<g> Rumi plan, t<g> typed in the plan, '' none), HITL coach id8 and form edit state (u/n/r)
      out.push([ti, +p[1], p[2], p[3], ...p.slice(4, 12).map(num), p[12], p[13], p[14], p[15]]);
    }
  }
  if (miss.n) throw new Error(`observations: ${miss.n} records for teachers not in the roster`);
  return { rows: out, observe2_excluded: observe2 };
}

function buildQuizzes(rows, ro) {
  const made = [];      // [teacher, day, quizzes made]
  const sit = [];       // [teacher or -1-school, day, kind, sittings, finished, children]
  const buckets = [];   // [teacher or -1-school, type w/o/a, bucket, kind, children]
  const miss = { n: 0 };
  for (const r of rows) {
    const si = ro.schoolIndex.get(r.school_id);
    if (si === undefined) { miss.n++; continue; }
    for (const p of records('quizzes', r)) {
      const who = p[1] === '*' ? -1 - si : teacherOf(ro, r.school_id, p[1], miss);
      if (who === undefined) continue;
      if (p[0] === 'm' && p.length === 4) made.push([who, +p[2], +p[3]]);
      else if (p[0] === 's' && p.length === 7) sit.push([who, +p[2], p[3], +p[4], +p[5], +p[6]]);
      else if ((p[0] === 'w' || p[0] === 'o') && p.length === 5) buckets.push([who, p[0], p[2], p[3], +p[4]]);
      else if (p[0] === 'a' && p.length === 4) buckets.push([who, 'a', '', p[2], +p[3]]);
      else throw new Error('quizzes: malformed record');
    }
  }
  if (miss.n) throw new Error(`quizzes: ${miss.n} records for teachers or schools not in the roster`);
  return { made, sit, buckets };
}

function buildQuizSectors(rows) {
  const out = {};
  for (const r of rows) {
    const recs = records('quiz_sectors', { ...r, school_id: r.area });
    out[r.area] = recs.map((p) => {
      if (p[0] === 'a' && p.length === 3) return ['a', '', p[1], +p[2]];
      if (['d', 'w', 'o'].includes(p[0]) && p.length === 4) return [p[0], p[1], p[2], +p[3]];
      throw new Error('quiz_sectors: malformed record');
    });
  }
  if (!out.ALL) throw new Error('quiz_sectors: no all-ICT line');
  return out;
}

function buildExams(rows, ro) {
  const out = [];
  const miss = { n: 0 };
  for (const r of rows) {
    for (const p of records('exams', r)) {
      if (p.length !== 7) throw new Error('exams: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti === undefined) continue;
      out.push([ti, +p[1], +p[2], +p[3], +p[4], +p[5], +p[6]]);   // teacher, day, requested, delivered, failed, never finished, edited
    }
  }
  if (miss.n) throw new Error(`exams: ${miss.n} records for teachers not in the roster`);
  return out;
}

// Lesson catalogue: [{ id, grade, subject, title }], one row per subject packed "lesson_id|grade|title".
function buildLessons(rows) {
  const out = [];
  for (const r of rows) {
    for (const p of records('lp_lessons', { ...r, school_id: r.subject }, '|')) {
      if (p.length !== 3) throw new Error('lp_lessons: malformed record');
      out.push({ id: p[0], grade: p[1], subject: r.subject === '(none)' ? '' : r.subject, title: p[2].trim() });
    }
  }
  if (out.length < 100) throw new Error(`lp_lessons: only ${out.length} lessons`);
  return out;
}

// Lesson-plan detail. lessons[0] is "no curriculum lesson" (a typed plan); a lesson missing from the catalogue is added
// with the grade and subject read from its id (grade_5_math_ch4_seg7).
function buildLpDetail(rows, ro, catalogue) {
  const lessons = [{ id: '', grade: '', subject: '', title: 'Typed topic (no curriculum lesson)' }, ...catalogue];
  const idx = new Map(lessons.map((l, i) => [l.id, i]));
  const lessonOf = (id) => {
    if (!idx.has(id)) {
      const m = id.match(/^grade_(\d+)_(.+?)_ch\d+/);
      idx.set(id, lessons.length);
      lessons.push({ id, grade: m ? m[1] : '', subject: m ? m[2] : '', title: '' });
    }
    return idx.get(id);
  };
  const gen = [];     // [teacher, day, hour, lesson, plans]
  const taught = [];  // [teacher, day, lesson, times taught]
  const miss = { n: 0 };
  for (const r of rows) {
    for (const p of records('lp_detail', r)) {
      const ti = teacherOf(ro, r.school_id, p[1], miss);
      if (ti === undefined) continue;
      if (p[0] === 'p' && p.length === 6) gen.push([ti, +p[2], +p[3], lessonOf(p[4]), +p[5]]);
      else if (p[0] === 't' && p.length === 5) taught.push([ti, +p[2], lessonOf(p[3]), +p[4]]);
      else throw new Error('lp_detail: malformed record');
    }
  }
  if (miss.n) throw new Error(`lp_detail: ${miss.n} records for teachers not in the roster`);
  return { lessons, gen, taught };
}

// Children's finished lesson-quiz results: [teacher, day, grade, subject, finished, correct, answered, mastered,
// developing, needs practice]. Aggregates only.
function buildQuizScores(rows, ro) {
  const out = [];
  const miss = { n: 0 };
  for (const r of rows) {
    for (const p of records('quiz_scores', r)) {
      if (p.length !== 10) throw new Error('quiz_scores: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti === undefined) continue;
      out.push([ti, +p[1], p[2], p[3], ...p.slice(4).map(Number)]);
    }
  }
  if (miss.n) throw new Error(`quiz_scores: ${miss.n} records for teachers not in the roster`);
  return out;
}

// Exam-generator detail: [teacher, day, hour, grade, subject, source s|u|b, surface w|p, chapter, requested, generated,
// questions asked, objective questions, subjective questions, board kind ('' regular | f | c | p | o board format)].
function buildExamDetail(rows, ro) {
  const out = [];
  const miss = { n: 0 };
  for (const r of rows) {
    for (const p of records('exam_detail', r)) {
      if (p.length !== 14) throw new Error('exam_detail: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti === undefined) continue;
      out.push([ti, +p[1], +p[2], p[3], p[4], p[5], p[6], p[7], +p[8], +p[9], +p[10], +p[11], +p[12], p[13]]);
    }
  }
  if (miss.n) throw new Error(`exam_detail: ${miss.n} records for teachers not in the roster`);
  return out;
}

// Roster grades per teacher: [teacher, 'grade,grade'] (1..12, ey = early years). Teachers with no class are absent.
function buildTeacherGrades(rows, ro) {
  const out = [];
  const miss = { n: 0 };
  for (const r of rows) {
    for (const p of records('teacher_grades', r, '|')) {
      if (p.length !== 2) throw new Error('teacher_grades: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti !== undefined) out.push([ti, p[1]]);
    }
  }
  if (miss.n) throw new Error(`teacher_grades: ${miss.n} records for teachers not in the roster`);
  return out;
}

// HITL observers: [{ id: id8, name, role }]; a repeated id8 would merge two coaches, so it fails the part.
function buildCoaches(rows) {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    for (const p of records('coaches', r, '|')) {
      if (p.length !== 3) throw new Error('coaches: malformed record');
      if (seen.has(p[0])) throw new Error('coaches: duplicate coach key');
      seen.add(p[0]);
      out.push({ id: p[0], name: p[1].trim(), role: p[2] });
    }
  }
  return out;
}

function buildTraining(rows, ro) {
  const out = [];
  const miss = { n: 0 };
  for (const r of rows) {
    for (const p of records('training', r)) {
      if (p.length !== 7) throw new Error('training: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti === undefined) continue;
      out.push([ti, +p[1], +p[2], +p[3], +p[4], +p[5], p[6]]);   // teacher, on programme, modules L1-L4, levels certified
    }
  }
  if (miss.n) throw new Error(`training: ${miss.n} records for teachers not in the roster`);
  return out;
}

function rosterSig(ro) {
  let h = 0;
  const s = ro.teachers.map((t) => `${ro.schools[t.s].emis}|${t.name}`).join('\n');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${ro.teachers.length}:${h}`;
}

module.exports = { records, buildRoster, buildLp, buildObservations, buildQuizzes, buildQuizSectors, buildExams, buildTraining, buildLessons, buildLpDetail, buildQuizScores, buildExamDetail, buildTeacherGrades, buildCoaches, rosterSig, MIN_SCHOOLS };
