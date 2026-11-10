// Thank-you wall (owner request 2026-11-10): team members write sticky notes to thank each other. A note has a colour,
// a font and size, emojis and stickers placed on it, and may name the person's email: that person gets the note by
// email (Gmail app password, version 2). Others react and comment.
// Anyone with the dashboard link can use it (owner 2026-11-10: no team code). There is no login, so a browser keeps a random key: its notes and comments can be removed only by
// it (or by the admin with ADMIN_TOKEN), and it holds one reaction of each kind per note.
// Stored in Postgres, or a JSON file for local runs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COLORS = ['yellow', 'pink', 'mint', 'sky', 'lavender', 'peach', 'lime', 'white'];
const FONTS = ['hand', 'marker', 'neat', 'playful', 'urdu'];
const SIZES = ['s', 'm', 'l'];
const REACTS = ['👏', '❤️', '🎉', '🙌', '🌟'];
const STAMPS = ['THANK YOU', 'WOW!', 'SUPERSTAR', 'BRAVO!', 'TOP JOB', 'HERO', 'شکریہ', 'شاباش', 'زبردست'];
const MAX_STICKERS = 8;
const LIMITS = { name: 80, body: 400, comment: 300, email: 120 };
const EMOJI = /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️]{1,16}$/u;
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|pk|io|info|xyz|app)\b)/i;   // no links: the note may be emailed

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kudos_notes (
  id serial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  from_name text NOT NULL,
  to_name text NOT NULL,
  to_email text,
  body text NOT NULL,
  color text NOT NULL,
  font text NOT NULL,
  size text NOT NULL,
  stickers text NOT NULL DEFAULT '[]',
  owner text NOT NULL,
  email_status text,
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS kudos_reacts (
  note_id int NOT NULL,
  emoji text NOT NULL,
  viewer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, emoji, viewer)
);
CREATE TABLE IF NOT EXISTS kudos_comments (
  id serial PRIMARY KEY,
  note_id int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  body text NOT NULL,
  owner text NOT NULL,
  deleted_at timestamptz
);`;

const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

// Constant-time check of a header against a configured secret; closed when the secret is not set.
function secretOk(got, want) {
  if (!want) return false;
  const a = Buffer.from(String(got || '')), b = Buffer.from(String(want));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// The browser's random key -> the stored owner / viewer id (only its hash is kept).
function viewerOf(req) {
  const k = String(req.headers['x-kudos-key'] || '');
  return /^[A-Za-z0-9_-]{16,64}$/.test(k) ? sha(`kudos:${k}`) : null;
}

function validateNote(b) {
  if (!b || typeof b !== 'object') return { error: 'Nothing was sent.' };
  const from = clip(b.from, LIMITS.name);
  if (from.length < 2) return { error: 'Please type your name.' };
  const to = clip(b.to, LIMITS.name);
  if (to.length < 2) return { error: 'Who is the note for? Please type their name.' };
  let email = clip(b.email, LIMITS.email).toLowerCase();
  if (email && !EMAIL.test(email)) return { error: 'That email address does not look right.' };
  if (!email) email = null;
  const body = typeof b.body === 'string' ? b.body.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.body) : '';
  if (body.length < 2) return { error: 'Please write a note or pick one from the library.' };
  if (LINK.test(body)) return { error: 'Links are not allowed on notes.' };
  const color = COLORS.includes(b.color) ? b.color : 'yellow';
  const font = FONTS.includes(b.font) ? b.font : 'hand';
  const size = SIZES.includes(b.size) ? b.size : 'm';
  const num = (v, lo, hi, def, dp = 10) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== '' ? Math.round(Math.min(hi, Math.max(lo, n)) * dp) / dp : def; };
  const stickers = [];
  for (const s of Array.isArray(b.stickers) ? b.stickers.slice(0, MAX_STICKERS) : []) {
    if (!s || typeof s !== 'object') continue;
    const t = s.t === 's' ? 's' : 'e';
    const v = typeof s.v === 'string' ? s.v : '';
    if (t === 'e' ? !EMOJI.test(v) : !STAMPS.includes(v)) continue;
    stickers.push({ t, v, x: num(s.x, 0, 100, 50), y: num(s.y, 0, 100, 50), r: num(s.r, -30, 30, 0), z: num(s.z, 0.6, 2.5, 1, 100) });
  }
  return { row: { from, to, email, body, color, font, size, stickers } };
}
function validateComment(b) {
  if (!b || typeof b !== 'object') return { error: 'Nothing was sent.' };
  const name = clip(b.name, LIMITS.name);
  if (name.length < 2) return { error: 'Please type your name.' };
  const body = clip(b.body, LIMITS.comment);
  if (body.length < 1) return { error: 'Please write a comment.' };
  if (LINK.test(body)) return { error: 'Links are not allowed in comments.' };
  return { row: { name, body } };
}

// Per-visitor-per-hour and all-visitors-per-day limits (in memory; visitor = hashed address).
function createLimiter(perHour, perDay) {
  const hits = new Map();
  let day = '', dayCount = 0;
  return (who) => {
    const now = Date.now(), d = new Date().toISOString().slice(0, 10);
    if (d !== day) { day = d; dayCount = 0; }
    if (dayCount >= perDay) return false;
    const k = sha(who);
    const list = (hits.get(k) || []).filter((t) => now - t < 3600000);
    if (list.length >= perHour) { hits.set(k, list); return false; }
    list.push(now); hits.set(k, list); dayCount++;
    if (hits.size > 5000) for (const [key, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(key);
    return true;
  };
}

// What the page sees of a note: never the email address or the owner hash.
function shape(n, reacts, comments, viewer) {
  const counts = {}, mine = [];
  for (const r of reacts) { counts[r.emoji] = (counts[r.emoji] || 0) + 1; if (r.viewer === viewer) mine.push(r.emoji); }
  let stickers = [];
  try { stickers = typeof n.stickers === 'string' ? JSON.parse(n.stickers) : n.stickers || []; } catch (e) { stickers = []; }
  return {
    id: n.id, created_at: new Date(n.created_at).toISOString(), from: n.from_name, to: n.to_name, emailed: !!n.to_email, email_status: n.email_status || null,
    body: n.body, color: n.color, font: n.font, size: n.size, stickers, mine: n.owner === viewer, reacts: counts, my_reacts: mine,
    comments: comments.map((c) => ({ id: c.id, created_at: new Date(c.created_at).toISOString(), name: c.name, body: c.body, mine: c.owner === viewer })),
  };
}

function createStore({ pool, file }) {
  if (pool) {
    let ready = null;
    const init = () => (ready = ready || pool.query(SCHEMA));
    const one = async (id, viewer) => (await api.list(viewer, id))[0] || null;
    const api = {
      async add(r, owner) {
        await init();
        const q = await pool.query(`INSERT INTO kudos_notes (from_name, to_name, to_email, body, color, font, size, stickers, owner, email_status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [r.from, r.to, r.email, r.body, r.color, r.font, r.size, JSON.stringify(r.stickers), owner, r.email ? 'pending' : null]);
        return one(q.rows[0].id, owner);
      },
      async list(viewer, only = null) {
        await init();
        const n = await pool.query(`SELECT * FROM kudos_notes WHERE deleted_at IS NULL AND ($1::int IS NULL OR id = $1) ORDER BY id DESC LIMIT 400`, [only]);
        if (!n.rows.length) return [];
        const ids = n.rows.map((x) => x.id);
        const r = await pool.query('SELECT note_id, emoji, viewer FROM kudos_reacts WHERE note_id = ANY($1::int[])', [ids]);
        const c = await pool.query('SELECT id, note_id, created_at, name, body, owner FROM kudos_comments WHERE deleted_at IS NULL AND note_id = ANY($1::int[]) ORDER BY id', [ids]);
        return n.rows.map((x) => shape(x, r.rows.filter((y) => y.note_id === x.id), c.rows.filter((y) => y.note_id === x.id), viewer));
      },
      async get(id, viewer) { return one(id, viewer); },
      async react(id, emoji, viewer) {
        await init();
        const ok = await pool.query('SELECT 1 FROM kudos_notes WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (!ok.rowCount) return null;
        const del = await pool.query('DELETE FROM kudos_reacts WHERE note_id = $1 AND emoji = $2 AND viewer = $3', [id, emoji, viewer]);
        if (!del.rowCount) await pool.query('INSERT INTO kudos_reacts (note_id, emoji, viewer) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, emoji, viewer]);
        return one(id, viewer);
      },
      async comment(id, r, owner) {
        await init();
        const ok = await pool.query('SELECT 1 FROM kudos_notes WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (!ok.rowCount) return null;
        await pool.query('INSERT INTO kudos_comments (note_id, name, body, owner) VALUES ($1,$2,$3,$4)', [id, r.name, r.body, owner]);
        return one(id, owner);
      },
      // admin = true removes anyone's; otherwise only the owner's own. Returns 'ok' | 'notfound' | 'forbidden'.
      async removeNote(id, viewer, admin) {
        await init();
        const q = await pool.query('SELECT owner FROM kudos_notes WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (!q.rowCount) return 'notfound';
        if (!admin && q.rows[0].owner !== viewer) return 'forbidden';
        await pool.query('UPDATE kudos_notes SET deleted_at = now() WHERE id = $1', [id]);
        return 'ok';
      },
      async removeComment(id, viewer, admin) {
        await init();
        const q = await pool.query('SELECT owner, note_id FROM kudos_comments WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (!q.rowCount) return { status: 'notfound' };
        if (!admin && q.rows[0].owner !== viewer) return { status: 'forbidden' };
        await pool.query('UPDATE kudos_comments SET deleted_at = now() WHERE id = $1', [id]);
        return { status: 'ok', note: q.rows[0].note_id };
      },
      async emailOf(id) {
        await init();
        const q = await pool.query('SELECT * FROM kudos_notes WHERE id = $1', [id]);
        return q.rows[0] || null;
      },
      async setEmailStatus(id, status) { await init(); await pool.query('UPDATE kudos_notes SET email_status = $2 WHERE id = $1', [id, status]); },
    };
    return api;
  }
  const empty = { notes: [], reacts: [], comments: [] };
  const read = () => { try { return { ...empty, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { return { notes: [], reacts: [], comments: [] }; } };
  const write = (db) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); };
  const next = (rows) => rows.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const view = (db, n, viewer) => shape(n, db.reacts.filter((y) => y.note_id === n.id), db.comments.filter((y) => y.note_id === n.id && !y.deleted_at), viewer);
  const live = (db, id) => db.notes.find((x) => x.id === id && !x.deleted_at);
  return {
    async add(r, owner) {
      const db = read();
      const n = { id: next(db.notes), created_at: new Date().toISOString(), from_name: r.from, to_name: r.to, to_email: r.email, body: r.body, color: r.color, font: r.font, size: r.size,
        stickers: JSON.stringify(r.stickers), owner, email_status: r.email ? 'pending' : null, deleted_at: null };
      db.notes.push(n); write(db);
      return view(db, n, owner);
    },
    async list(viewer) { const db = read(); return db.notes.filter((x) => !x.deleted_at).sort((a, b) => b.id - a.id).slice(0, 400).map((n) => view(db, n, viewer)); },
    async get(id, viewer) { const db = read(); const n = live(db, id); return n ? view(db, n, viewer) : null; },
    async react(id, emoji, viewer) {
      const db = read(); const n = live(db, id);
      if (!n) return null;
      const i = db.reacts.findIndex((y) => y.note_id === id && y.emoji === emoji && y.viewer === viewer);
      if (i >= 0) db.reacts.splice(i, 1); else db.reacts.push({ note_id: id, emoji, viewer, created_at: new Date().toISOString() });
      write(db); return view(db, n, viewer);
    },
    async comment(id, r, owner) {
      const db = read(); const n = live(db, id);
      if (!n) return null;
      db.comments.push({ id: next(db.comments), note_id: id, created_at: new Date().toISOString(), name: r.name, body: r.body, owner, deleted_at: null });
      write(db); return view(db, n, owner);
    },
    async removeNote(id, viewer, admin) {
      const db = read(); const n = live(db, id);
      if (!n) return 'notfound';
      if (!admin && n.owner !== viewer) return 'forbidden';
      n.deleted_at = new Date().toISOString(); write(db); return 'ok';
    },
    async removeComment(id, viewer, admin) {
      const db = read(); const c = db.comments.find((x) => x.id === id && !x.deleted_at);
      if (!c) return { status: 'notfound' };
      if (!admin && c.owner !== viewer) return { status: 'forbidden' };
      c.deleted_at = new Date().toISOString(); write(db); return { status: 'ok', note: c.note_id };
    },
    async emailOf(id) { return read().notes.find((x) => x.id === id) || null; },
    async setEmailStatus(id, status) { const db = read(); const n = db.notes.find((x) => x.id === id); if (n) { n.email_status = status; write(db); } },
  };
}

// ---------- email (version 2) ----------
const HEX = { yellow: '#FFF3A3', pink: '#FFD1DC', mint: '#C8F1DA', sky: '#CDE7FF', lavender: '#E3D7FF', peach: '#FFDCC2', lime: '#E4F7A8', white: '#FFFFFF' };
const FONT_CSS = { hand: "'Caveat', 'Segoe Print', 'Comic Sans MS', cursive", marker: "'Permanent Marker', 'Segoe Print', 'Comic Sans MS', cursive", neat: "Arial, Helvetica, sans-serif",
  playful: "'Patrick Hand', 'Comic Sans MS', cursive", urdu: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', serif" };
const PX = { s: 18, m: 22, l: 28 };
const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The email for one note (n = a stored row). Text is escaped; links in it were refused when it was written.
function emailFor(n, boardUrl) {
  let st = [];
  try { st = JSON.parse(n.stickers || '[]'); } catch (e) { st = []; }
  const emojis = st.filter((s) => s.t === 'e').map((s) => s.v).join(' ');
  const stamps = st.filter((s) => s.t === 's').map((s) => `<span style="display:inline-block;border:2px solid #C0392B;color:#C0392B;border-radius:6px;padding:2px 8px;margin:4px;font:bold 13px Arial,sans-serif;transform:rotate(-6deg)">${escH(s.v)}</span>`).join('');
  const subject = `${n.from_name} left you a thank-you note 💛`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F3F4F1;font-family:Arial,Helvetica,sans-serif;color:#1C2230">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%">
<tr><td style="padding:0 0 14px;font-size:15px">Hi ${escH(n.to_name)}, <b>${escH(n.from_name)}</b> put a thank-you note for you on the NIETE ICT team's thank-you wall.</td></tr>
<tr><td style="background:${HEX[n.color] || HEX.yellow};padding:26px 24px 18px;border-radius:4px;box-shadow:0 8px 18px rgba(0,0,0,.15)">
<div style="font-size:13px;color:#555;margin-bottom:8px">To ${escH(n.to_name)}</div>
<div dir="auto" style="font-family:${FONT_CSS[n.font] || FONT_CSS.hand};font-size:${PX[n.size] || 22}px;line-height:1.35;white-space:pre-wrap;color:#1C2230">${escH(n.body)}</div>
${emojis ? `<div style="font-size:30px;margin-top:12px">${escH(emojis)}</div>` : ''}${stamps ? `<div style="margin-top:8px">${stamps}</div>` : ''}
<div style="text-align:right;font-size:14px;color:#444;margin-top:12px">— ${escH(n.from_name)}</div></td></tr>
<tr><td style="padding:16px 0 0;font-size:13px;color:#5A6371">See it, react and reply on the wall: <a href="${escH(boardUrl)}" style="color:#1E7A4C">open the thank-you wall</a>.<br>Sent from the ICT Dashboard. Please do not reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hi ${n.to_name},\n\n${n.from_name} put a thank-you note for you on the NIETE ICT team's thank-you wall:\n\n"${n.body}"${emojis ? `\n${emojis}` : ''}\n\n— ${n.from_name}\n\nSee it on the wall: ${boardUrl}\n`;
  return { subject, html, text };
}

// Gmail through an app password (GMAIL_USER, GMAIL_APP_PASSWORD on Railway). Returns null when not set up.
function createMailer({ user, pass, transport = null }) {
  if (!transport && (!user || !pass)) return null;
  let tx = transport;
  const get = () => (tx = tx || require('nodemailer').createTransport({ service: 'gmail', auth: { user, pass: String(pass).replace(/\s+/g, '') } }));
  return {
    async send(n, boardUrl) {
      const m = emailFor(n, boardUrl);
      await get().sendMail({ from: { name: 'NIETE Thank-you Wall', address: user || 'no-reply@example.org' }, to: n.to_email, subject: m.subject, html: m.html, text: m.text });
    },
  };
}

module.exports = { COLORS, FONTS, SIZES, REACTS, STAMPS, MAX_STICKERS, validateNote, validateComment, createStore, createLimiter, createMailer, emailFor, secretOk, viewerOf };
