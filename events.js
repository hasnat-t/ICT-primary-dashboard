// School calendar: coaches record why schools were busy or closed (exams, sports week, holidays, events, closures), so
// managers can read engagement dips against a reason. Anyone can read; adding or removing needs the coach passcode
// (CALENDAR_TOKEN) or the admin password (ADMIN_TOKEN). Stored in Postgres, or a JSON file for local runs.
const fs = require('fs');
const path = require('path');

const TYPES = {
  assessment: 'Student assessments / exams',
  sports: 'Sports week',
  winter: 'Winter holidays',
  summer: 'Summer holidays',
  event: 'School event or celebration',
  closed: 'School closed (unusual reason)',
  other: 'Other',
};
const SCOPES = ['schools', 'sector', 'all'];
const MAX_DAYS = 120;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS school_events (
  id serial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL,
  sector text,
  schools jsonb NOT NULL DEFAULT '[]',
  date_from date NOT NULL,
  date_to date NOT NULL,
  type text NOT NULL,
  reason text,
  note text,
  coach text NOT NULL,
  deleted_at timestamptz
);`;

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Validate an entry from the page. schools = EMIS codes (stable across refreshes). Returns { error } or { row }.
function validate(b, known) {
  if (!b || typeof b !== 'object') return { error: 'Nothing was sent.' };
  const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const coach = clip(b.coach, 80);
  if (coach.length < 2) return { error: 'Please choose or type your name.' };
  const type = TYPES[b.type] ? b.type : null;
  if (!type) return { error: 'Please choose a reason.' };
  const reason = clip(b.reason, 160);
  if (type === 'other' && reason.length < 3) return { error: 'Please write the reason.' };
  if (!isDate(b.from) || !isDate(b.to)) return { error: 'Please give the dates.' };
  if (b.to < b.from) return { error: 'The end date is before the start date.' };
  if ((Date.parse(b.to) - Date.parse(b.from)) / 86400000 + 1 > MAX_DAYS) return { error: `An entry can cover at most ${MAX_DAYS} days.` };
  const scope = SCOPES.includes(b.scope) ? b.scope : null;
  if (!scope) return { error: 'Please choose which schools.' };
  let schools = [], sector = null;
  if (scope === 'schools') {
    schools = [...new Set((Array.isArray(b.schools) ? b.schools : []).map((x) => String(x).trim()).filter((x) => /^[\w-]{1,20}$/.test(x)))].slice(0, 200);
    if (known) schools = schools.filter((x) => known.emis.has(x));
    if (!schools.length) return { error: 'Please choose at least one school.' };
  } else if (scope === 'sector') {
    sector = clip(b.sector, 40);
    if (!sector || (known && !known.sectors.has(sector))) return { error: 'Please choose a sector.' };
  }
  return { row: { scope, sector, schools, date_from: b.from, date_to: b.to, type, reason: type === 'other' ? reason : clip(b.reason, 160) || null, note: clip(b.note, 600) || null, coach } };
}

function createStore({ pool, file }) {
  const out = (r) => ({ id: r.id, created_at: r.created_at, scope: r.scope, sector: r.sector, schools: r.schools || [],
    from: typeof r.date_from === 'string' ? r.date_from.slice(0, 10) : new Date(r.date_from).toISOString().slice(0, 10),
    to: typeof r.date_to === 'string' ? r.date_to.slice(0, 10) : new Date(r.date_to).toISOString().slice(0, 10),
    type: r.type, reason: r.reason, note: r.note, coach: r.coach });
  if (pool) {
    let ready = null;
    const init = () => (ready = ready || pool.query(SCHEMA));
    return {
      async add(r) {
        await init();
        const q = await pool.query(`INSERT INTO school_events (scope, sector, schools, date_from, date_to, type, reason, note, coach)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [r.scope, r.sector, JSON.stringify(r.schools), r.date_from, r.date_to, r.type, r.reason, r.note, r.coach]);
        return out(q.rows[0]);
      },
      async list() {
        await init();
        const q = await pool.query("SELECT id, created_at, scope, sector, schools, to_char(date_from, 'YYYY-MM-DD') AS date_from, to_char(date_to, 'YYYY-MM-DD') AS date_to, type, reason, note, coach FROM school_events WHERE deleted_at IS NULL ORDER BY date_from, id");
        return q.rows.map(out);
      },
      async remove(id) {
        await init();
        const q = await pool.query('UPDATE school_events SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id]);
        return q.rowCount > 0;
      },
    };
  }
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; } };
  const write = (rows) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(rows)); };
  return {
    async add(r) {
      const rows = read();
      const row = { id: rows.reduce((m, x) => Math.max(m, x.id), 0) + 1, created_at: new Date().toISOString(), deleted_at: null, ...r };
      rows.push(row); write(rows);
      return out(row);
    },
    async list() { return read().filter((x) => !x.deleted_at).sort((a, b) => a.date_from.localeCompare(b.date_from) || a.id - b.id).map(out); },
    async remove(id) {
      const rows = read(); const row = rows.find((x) => x.id === id && !x.deleted_at);
      if (!row) return false;
      row.deleted_at = new Date().toISOString(); write(rows); return true;
    },
  };
}

module.exports = { TYPES, SCOPES, MAX_DAYS, validate, createStore };
