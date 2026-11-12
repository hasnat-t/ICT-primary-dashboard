// Coach school check (owner request 2026-11-12): each coach marks, for every school assigned to them in the app
// (leader_schools, via the data-quality refresh), whether it really is their school, and can add a school they visit
// that is missing. Only the owner and the coaches use it: every request needs the check password
// (COACH_CHECK_PASSWORD on Railway, never in code). Wrong passwords are limited per visitor.
// One row per coach x school: answer 'yes' | 'no' | 'add' (a school the coach says is theirs but is not assigned).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ANSWERS = ['yes', 'no', 'add'];
const SCHEMA = `
CREATE TABLE IF NOT EXISTS coach_school_checks (
  coach text NOT NULL,
  emis text NOT NULL,
  answer text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach, emis)
);`;

// The schools from the data-quality refresh: [emis, sector, name, teachers, "Coach A, Coach B", ncoach].
function schoolIndex(dqSchools) {
  const m = new Map();
  for (const r of dqSchools || []) m.set(String(r[0]), { emis: String(r[0]), coaches: String(r[4] || '').split(', ').map((x) => x.trim()).filter(Boolean) });
  return m;
}

// { row } | { error }. answer '' clears the coach's answer for that school.
function validate(b, idx) {
  if (!b || typeof b !== 'object') return { error: 'Nothing was sent.' };
  const coach = typeof b.coach === 'string' ? b.coach.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const emis = String(b.emis ?? '').trim();
  const answer = b.answer === '' ? '' : ANSWERS.includes(b.answer) ? b.answer : null;
  if (answer === null) return { error: 'Please choose Yes or No.' };
  if (!/^[\w-]{1,20}$/.test(emis)) return { error: 'Unknown school.' };
  const s = idx.get(emis);
  if (!s) return { error: 'Unknown school.' };
  const coaches = new Set([...idx.values()].flatMap((x) => x.coaches));
  if (!coaches.has(coach)) return { error: 'Please choose your name.' };
  const assigned = s.coaches.includes(coach);
  if ((answer === 'yes' || answer === 'no') && !assigned) return { error: 'This school is not assigned to you; use “Add a school”.' };
  if (answer === 'add' && assigned) return { error: 'This school is already in your list.' };
  return { row: { coach, emis, answer } };
}

function createStore({ pool, file }) {
  if (pool) {
    let ready = null;
    const init = () => (ready = ready || pool.query(SCHEMA));
    return {
      async set(r) {
        await init();
        if (!r.answer) { await pool.query('DELETE FROM coach_school_checks WHERE coach = $1 AND emis = $2', [r.coach, r.emis]); return; }
        await pool.query(`INSERT INTO coach_school_checks (coach, emis, answer) VALUES ($1,$2,$3)
          ON CONFLICT (coach, emis) DO UPDATE SET answer = EXCLUDED.answer, updated_at = now()`, [r.coach, r.emis, r.answer]);
      },
      async list() {
        await init();
        const q = await pool.query('SELECT coach, emis, answer, updated_at FROM coach_school_checks ORDER BY coach, emis');
        return q.rows.map((x) => ({ coach: x.coach, emis: x.emis, answer: x.answer, updated_at: new Date(x.updated_at).toISOString() }));
      },
    };
  }
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; } };
  const write = (rows) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(rows)); };
  return {
    async set(r) {
      const rows = read().filter((x) => !(x.coach === r.coach && x.emis === r.emis));
      if (r.answer) rows.push({ ...r, updated_at: new Date().toISOString() });
      write(rows);
    },
    async list() { return read().sort((a, b) => a.coach.localeCompare(b.coach) || a.emis.localeCompare(b.emis)); },
  };
}

// Constant-time password check, plus a block after `max` wrong tries per visitor in an hour.
function createGate(password, max = 10) {
  const fails = new Map();
  const key = (ip) => crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
  return (got, ip) => {
    if (!password) return 'off';
    const k = key(ip), now = Date.now();
    const list = (fails.get(k) || []).filter((t) => now - t < 3600000);
    if (list.length >= max) { fails.set(k, list); return 'blocked'; }
    const a = Buffer.from(String(got || '')), b = Buffer.from(String(password));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return 'ok';
    list.push(now); fails.set(k, list);
    if (fails.size > 5000) for (const [x, v] of fails) if (!v.some((t) => now - t < 3600000)) fails.delete(x);
    return 'wrong';
  };
}

module.exports = { ANSWERS, schoolIndex, validate, createStore, createGate };
