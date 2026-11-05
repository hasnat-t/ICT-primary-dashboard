// Middle & high teachers' training. Its own roster, because the main roster holds primary teachers only: every ICT
// teacher whose level includes MIDDLE or HIGH, in any combination, primary included. All time. Built from
// sql/mh_training.sql (one row per school) and sql/mh_catalog.sql (the levels); the page reads data.mh.
const { records } = require('./unpack');

const MIN_MH_SCHOOLS = 100;   // 263 schools on 2026-11-05; fewer means a partial answer

// [{ id, vendor, order, modules, pass }]
function buildMhCatalog(rows) {
  if (!rows.length) throw new Error('mh_catalog: no levels returned');
  return rows.map((r) => ({ id: Number(r.level_id), vendor: String(r.vendor), order: Number(r.order_index), modules: Number(r.modules), pass: Number(r.passing_pct) }));
}

// { levels, schools: [[emis, sector, name]], teachers: [[school, name, levels 'PMH', on programme 0/1, {levelId: modules}, [certified level ids]]] }
function buildMh(rows, levels, minSchools = MIN_MH_SCHOOLS) {
  if (rows.length < minSchools) throw new Error(`mh_training: only ${rows.length} schools returned`);
  const known = new Set(levels.map((l) => l.id));
  const schools = [], teachers = [];
  for (const r of rows) {
    const si = schools.push([String(r.emis ?? ''), String(r.sector || '(no sector)'), String(r.school_name || '')]) - 1;
    for (const p of records('mh_training', r, '|')) {
      if (p.length !== 6) throw new Error('mh_training: malformed record');
      if (!/^P?M?H?$/.test(p[2]) || !/[MH]/.test(p[2])) throw new Error(`mh_training: unexpected levels "${p[2]}"`);
      const mods = {};
      for (const x of p[4] ? p[4].split(',') : []) {
        const [id, n] = x.split(':').map(Number);
        if (!known.has(id) || !Number.isFinite(n)) throw new Error(`mh_training: unknown level or count "${x}"`);
        mods[id] = n;
      }
      const certs = p[5] ? p[5].split(',').map(Number) : [];
      if (certs.some((id) => !known.has(id))) throw new Error(`mh_training: unknown certificate level in "${p[5]}"`);
      teachers.push([si, p[1], p[2], p[3] === '1' ? 1 : 0, mods, certs]);
    }
  }
  return { levels, schools, teachers };
}

module.exports = { buildMh, buildMhCatalog, MIN_MH_SCHOOLS };
