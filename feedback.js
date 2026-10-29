// User feedback: anyone can send it from the dashboard; only the admin (ADMIN_TOKEN) can read and triage it.
// Stored in Postgres when DATABASE_URL is set, otherwise in a JSON file next to the cache (local runs).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TYPES = { change: 'Change or new view', design: 'Design / ease of use', bug: 'Something is broken', data: 'Data looks wrong', other: 'Other' };
const STATUSES = ['new', 'approved', 'declined', 'later', 'done'];
const LIMITS = { message: [10, 3000], name: 80, contact: 120, tab: 40, context: 400 };
const PER_VISITOR_HOUR = 8;
const PER_DAY_ALL = 500;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feedback (
  id serial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  message text NOT NULL,
  tab text,
  context text,
  name text,
  contact text,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  updated_at timestamptz
);`;

function createStore({ pool, file }) {
  if (pool) {
    let ready = null;
    const init = () => (ready = ready || pool.query(SCHEMA));
    return {
      async add(r) {
        await init();
        const q = await pool.query('INSERT INTO feedback (type, message, tab, context, name, contact) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at',
          [r.type, r.message, r.tab, r.context, r.name, r.contact]);
        return q.rows[0];
      },
      async list({ status, days }) {
        await init();
        const q = await pool.query(`SELECT * FROM feedback WHERE ($1::text IS NULL OR status = $1) AND created_at >= now() - ($2::int * interval '1 day')
          ORDER BY created_at DESC LIMIT 2000`, [status || null, days]);
        return q.rows;
      },
      async update(id, { status, note }) {
        await init();
        const q = await pool.query('UPDATE feedback SET status = COALESCE($2, status), admin_note = COALESCE($3, admin_note), updated_at = now() WHERE id = $1 RETURNING *',
          [id, status || null, note === undefined ? null : note]);
        return q.rows[0] || null;
      },
    };
  }
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; } };
  const write = (rows) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(rows)); };
  return {
    async add(r) {
      const rows = read();
      const row = { id: (rows.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1, created_at: new Date().toISOString(), status: 'new', admin_note: null, updated_at: null, ...r };
      rows.push(row); write(rows);
      return { id: row.id, created_at: row.created_at };
    },
    async list({ status, days }) {
      const since = Date.now() - days * 86400000;
      return read().filter((x) => (!status || x.status === status) && Date.parse(x.created_at) >= since).sort((a, b) => b.id - a.id);
    },
    async update(id, { status, note }) {
      const rows = read();
      const row = rows.find((x) => x.id === id);
      if (!row) return null;
      if (status) row.status = status;
      if (note !== undefined) row.admin_note = note;
      row.updated_at = new Date().toISOString();
      write(rows);
      return row;
    },
  };
}

// Validate a submission from the page. Returns { error } or { row }.
function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'Please write a message.' };
  if (body.website) return { spam: true };                                        // a hidden field only bots fill in
  const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const type = TYPES[body.type] ? body.type : 'other';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, LIMITS.message[1]) : '';
  if (message.length < LIMITS.message[0]) return { error: 'Please write a little more (at least 10 characters).' };
  return { row: { type, message, tab: clip(body.tab, LIMITS.tab), context: clip(body.context, LIMITS.context), name: clip(body.name, LIMITS.name), contact: clip(body.contact, LIMITS.contact) } };
}

// In-memory limits: per visitor (hashed address, never stored) per hour, and all visitors per day.
function createLimiter() {
  const hits = new Map();
  let day = '', dayCount = 0;
  return (ip) => {
    const now = Date.now(), d = new Date().toISOString().slice(0, 10);
    if (d !== day) { day = d; dayCount = 0; }
    if (dayCount >= PER_DAY_ALL) return false;
    const k = crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
    const list = (hits.get(k) || []).filter((t) => now - t < 3600000);
    if (list.length >= PER_VISITOR_HOUR) { hits.set(k, list); return false; }
    list.push(now); hits.set(k, list); dayCount++;
    if (hits.size > 5000) for (const [key, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(key);
    return true;
  };
}

// Constant-time token check; admin endpoints are closed when no token is configured.
function isAdmin(req, token) {
  if (!token) return false;
  const got = Buffer.from(String(req.headers['x-admin-token'] || ''));
  const want = Buffer.from(token);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

module.exports = { TYPES, STATUSES, createStore, validate, createLimiter, isAdmin };
