// Targets (owner request 2026-11-09): a goal for one measure, for All ICT, a sector or a school, by a date - e.g.
// "80% LP engagement by 31 Dec". The page works out progress and a forecast from the data it already has.
// Same rules as the school calendar: anyone with the link can read, add and remove (removal is a soft delete),
// changes are rate-limited per visitor. Stored in Postgres, or a JSON file for local runs.
const fs = require('fs');
const path = require('path');

// The measures a target can use (the page computes them; keep the keys in step with TARGET_METRICS in calc.js).
const METRICS = ['lp', 'dc', 'hitl', 'dcfico', 'ex'];
const SCOPES = ['all', 'sector', 'school'];
const MAX_DAYS_AHEAD = 730;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dashboard_targets (
  id serial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  metric text NOT NULL,
  scope text NOT NULL,
  sector text,
  school text,
  target real NOT NULL,
  deadline date NOT NULL,
  note text,
  owner text NOT NULL,
  deleted_at timestamptz
);`;

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Validate a target from the page. school = EMIS code (stable across refreshes). today = 'YYYY-MM-DD' (Pakistan).
// Returns { error } or { row }.
function validate(b, known, today) {
  if (!b || typeof b !== 'object') return { error: 'Nothing was sent.' };
  const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const owner = clip(b.owner, 80);
  if (owner.length < 2) return { error: 'Please type your name.' };
  if (!METRICS.includes(b.metric)) return { error: 'Please choose what to measure.' };
  const target = Number(b.target);
  if (!Number.isFinite(target) || target <= 0 || target > 100) return { error: 'The goal must be a percentage between 1 and 100.' };
  if (!isDate(b.deadline)) return { error: 'Please choose the date.' };
  if (today && b.deadline <= today) return { error: 'The date must be in the future.' };
  if (today && (Date.parse(b.deadline) - Date.parse(today)) / 86400000 > MAX_DAYS_AHEAD) return { error: 'The date can be at most two years ahead.' };
  const scope = SCOPES.includes(b.scope) ? b.scope : null;
  if (!scope) return { error: 'Please choose for whom.' };
  let sector = null, school = null;
  if (scope === 'sector') {
    sector = clip(b.sector, 40);
    if (!sector || (known && !known.sectors.has(sector))) return { error: 'Please choose a sector.' };
  } else if (scope === 'school') {
    school = clip(String(b.school ?? ''), 20);
    if (!/^[\w-]{1,20}$/.test(school) || (known && !known.emis.has(school))) return { error: 'Please choose a school.' };
  }
  return { row: { metric: b.metric, scope, sector, school, target: Math.round(target * 10) / 10, deadline: b.deadline, note: clip(b.note, 300) || null, owner } };
}

function createStore({ pool, file }) {
  const day = (v) => (typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));
  const out = (r) => ({ id: r.id, created_at: r.created_at, metric: r.metric, scope: r.scope, sector: r.sector, school: r.school,
    target: Number(r.target), deadline: day(r.deadline), note: r.note, owner: r.owner });
  if (pool) {
    let ready = null;
    const init = () => (ready = ready || pool.query(SCHEMA));
    return {
      async add(r) {
        await init();
        const q = await pool.query(`INSERT INTO dashboard_targets (metric, scope, sector, school, target, deadline, note, owner)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [r.metric, r.scope, r.sector, r.school, r.target, r.deadline, r.note, r.owner]);
        return out(q.rows[0]);
      },
      async list() {
        await init();
        const q = await pool.query("SELECT id, created_at, metric, scope, sector, school, target, to_char(deadline, 'YYYY-MM-DD') AS deadline, note, owner FROM dashboard_targets WHERE deleted_at IS NULL ORDER BY deadline, id");
        return q.rows.map(out);
      },
      async remove(id) {
        await init();
        const q = await pool.query('UPDATE dashboard_targets SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id]);
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
    async list() { return read().filter((x) => !x.deleted_at).sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id - b.id).map(out); },
    async remove(id) {
      const rows = read(); const row = rows.find((x) => x.id === id && !x.deleted_at);
      if (!row) return false;
      row.deleted_at = new Date().toISOString(); write(rows); return true;
    },
  };
}

module.exports = { METRICS, SCOPES, validate, createStore };
