// School calendar: coaches record why schools were busy or closed (exams, sports week, holidays, events, closures), so
// managers can read engagement dips against a reason. Anyone with the link can read, add and remove (no passcode,
// owner decision 2026-10-30); removal is a soft delete. Stored in Postgres, or a JSON file for local runs.
const fs = require('fs');
const path = require('path');

const TYPES = {
  national: 'National / public holiday',
  assessment: 'Student assessments / exams',
  sports: 'Sports week',
  winter: 'Winter holidays',
  summer: 'Summer holidays',
  event: 'School event or celebration',
  closed: 'School closed (unusual reason)',
  other: 'Other',
};
const SCOPES = ['schools', 'sector', 'all'];

// Federal public holidays (Cabinet Division), built in and read-only. Verified 2026-10-29:
// 2026 circular of 19 Jan 2026 (public holidays 2026) and the Cabinet Division notification of 21 Aug 2026 that set
// Eid Milad-un-Nabi (12 Rabi-ul-Awwal 1448) to Wed 26 Aug (the circular had 25 Aug). 2027: only the fixed-date holidays;
// the 2027 circular is not out yet, and Islamic holidays (Eids, Ashura, Milad) are added only once notified after
// moon sighting. Local Islamabad closures (District Magistrate) are not here - coaches add those.
const NATIONAL = [
  ['2026-08-14', '2026-08-14', 'Independence Day', 'Cabinet Division 2026 circular'],
  ['2026-08-26', '2026-08-26', 'Eid Milad-un-Nabi (12 Rabi-ul-Awwal)', 'Cabinet Division notification of 21 Aug 2026 (moved from 25 Aug)'],
  ['2026-11-09', '2026-11-09', 'Allama Iqbal Day', 'Cabinet Division 2026 circular'],
  ['2026-12-25', '2026-12-25', 'Quaid-e-Azam Day / Christmas', 'Cabinet Division 2026 circular'],
  ['2026-12-26', '2026-12-26', 'Day after Christmas (Christians only)', 'Cabinet Division 2026 circular - holiday for Christians only; schools open', 'optional'],
  ['2027-02-05', '2027-02-05', 'Kashmir Solidarity Day', 'Fixed date - confirm with the 2027 Cabinet Division circular'],
  ['2027-03-23', '2027-03-23', 'Pakistan Day', 'Fixed date - confirm with the 2027 Cabinet Division circular'],
  ['2027-05-01', '2027-05-01', 'Labour Day', 'Fixed date - confirm with the 2027 Cabinet Division circular'],
  ['2027-05-28', '2027-05-28', 'Youm-e-Takbeer', 'Fixed date - confirm with the 2027 Cabinet Division circular'],
  ['2027-08-14', '2027-08-14', 'Independence Day', 'Fixed date - confirm with the 2027 Cabinet Division circular'],
  ['2027-11-09', '2027-11-09', 'Allama Iqbal Day', 'Fixed date - confirm with the 2027 Cabinet Division circular'],
  ['2027-12-25', '2027-12-25', 'Quaid-e-Azam Day / Christmas', 'Fixed date - confirm with the 2027 Cabinet Division circular'],
].map(([from, to, name, source, optional], i) => ({ id: `n${i + 1}`, official: true, optional: !!optional, created_at: null, scope: optional ? 'none' : 'all',
  sector: null, schools: [], from, to, type: 'national', reason: name, note: source, coach: 'Federal government' }));
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
  const type = TYPES[b.type] && b.type !== 'national' ? b.type : null;   // national holidays are built in
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

module.exports = { TYPES, SCOPES, MAX_DAYS, NATIONAL, validate, createStore };
