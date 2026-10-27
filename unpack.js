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
      if (p.length !== 12) throw new Error('observations: malformed record');
      const ti = teacherOf(ro, r.school_id, p[0], miss);
      if (ti === undefined) continue;
      // teacher, day, src (D/H), stage (-/C/P/A), then score,max for TSK, HLP, SE, LPF (null when not scored)
      out.push([ti, +p[1], p[2], p[3], ...p.slice(4).map(num)]);
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

module.exports = { records, buildRoster, buildLp, buildObservations, buildQuizzes, buildQuizSectors, buildExams, buildTraining, rosterSig, MIN_SCHOOLS };
