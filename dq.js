// Data quality: gaps in the source data that make dashboard figures less accurate, and who can fix them. Built from
// sql/data_quality.sql (one row per programme school, all teacher levels) and sql/dq_coaches.sql (coach accounts with
// no school). Its own school list, like mh, so it does not depend on the primary roster. The page reads data.dq.
const { records } = require('./unpack');

const MIN_DQ_SCHOOLS = 300;   // 415 programme schools on 2026-11-08; fewer means a partial answer

// { schools: [[emis, sector, name, teachers, coaches (names, ", "), ncoach]],
//   teachers: [[school, name, flags]] (flags: L no level, N blank name, D same name twice at the school),
//   coaches: [name] (coach accounts with no school assigned) }
// Coach names come as "id8=name"; config/coach-overrides.json renames by id and its `hide` list (owner, 2026-10-28 and
// 2026-11-12: staff accounts that hold the coach role, e.g. Hasnat Tariq, Amena Ahmed, Haroon Yaseen, Rifat Yasmeen)
// are not coaches here: left out of each school's coaches and of the coach accounts with no school.
function coachList(s, ov) {
  const out = [];
  for (const e of String(s || '').split(', ').map((x) => x.trim()).filter(Boolean)) {
    const m = e.match(/^([0-9a-f]{8})=(.*)$/);
    if (m && (ov.hide || {})[m[1]]) continue;
    const name = m ? (ov.rename || {})[m[1]] || m[2].trim() : e;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}
function buildDq(rows, coachRows, minSchools = MIN_DQ_SCHOOLS, ov = require('./config/coach-overrides.json')) {
  if (rows.length < minSchools) throw new Error(`data_quality: only ${rows.length} schools returned`);
  const schools = [], teachers = [];
  for (const r of rows) {
    const co = coachList(r.coaches, ov);
    const si = schools.push([String(r.emis ?? ''), String(r.sector || '(no sector)'), String(r.school_name || ''),
      Number(r.teachers) || 0, co.join(', '), co.length]) - 1;
    for (const p of records('data_quality', r, '|')) {
      if (p.length !== 3) throw new Error('data_quality: malformed record');
      if (!/^L?N?D?$/.test(p[2]) || !p[2]) throw new Error(`data_quality: unexpected flags "${p[2]}"`);
      teachers.push([si, p[1], p[2]]);
    }
  }
  const coaches = [];
  for (const r of coachRows || []) {
    for (const p of records('dq_coaches', r, '|')) {
      if (p.length !== 2) throw new Error('dq_coaches: malformed record');
      if ((ov.hide || {})[p[0]]) continue;
      coaches.push((ov.rename || {})[p[0]] || p[1]);
    }
  }
  return { schools, teachers, coaches };
}

module.exports = { buildDq, MIN_DQ_SCHOOLS };
