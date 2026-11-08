// Data quality: gaps in the source data that make dashboard figures less accurate, and who can fix them. Built from
// sql/data_quality.sql (one row per programme school, all teacher levels) and sql/dq_coaches.sql (coach accounts with
// no school). Its own school list, like mh, so it does not depend on the primary roster. The page reads data.dq.
const { records } = require('./unpack');

const MIN_DQ_SCHOOLS = 300;   // 415 programme schools on 2026-11-08; fewer means a partial answer

// { schools: [[emis, sector, name, teachers, coaches (names, ", "), ncoach]],
//   teachers: [[school, name, flags]] (flags: L no level, N blank name, D same name twice at the school),
//   coaches: [name] (coach accounts with no school assigned) }
function buildDq(rows, coachRows, minSchools = MIN_DQ_SCHOOLS) {
  if (rows.length < minSchools) throw new Error(`data_quality: only ${rows.length} schools returned`);
  const schools = [], teachers = [];
  for (const r of rows) {
    const si = schools.push([String(r.emis ?? ''), String(r.sector || '(no sector)'), String(r.school_name || ''),
      Number(r.teachers) || 0, String(r.coaches || ''), Number(r.ncoach) || 0]) - 1;
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
      coaches.push(p[1]);
    }
  }
  return { schools, teachers, coaches };
}

module.exports = { buildDq, MIN_DQ_SCHOOLS };
