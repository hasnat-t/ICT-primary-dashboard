// Dashboard usage (owner request 2026-11-11): how many people open the dashboard each day and week, and which tabs
// they use. Each browser keeps a random id (localStorage); only its hash is stored, never an IP address or a name.
// One row per Pakistan day x visitor x tab with a view count; tab '_open' = the page was opened.
// Anyone can record a view (rate-limited, bots ignored); only the admin (ADMIN_TOKEN) can read the report.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OPEN = '_open';
const BOT = /bot|crawl|spider|headless|preview|slack|whatsapp|facebookexternal|telegram|discord|curl|wget|python|node-fetch|axios|go-http|uptime|monitor/i;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS usage_daily (
  day date NOT NULL,
  visitor text NOT NULL,
  tab text NOT NULL,
  views int NOT NULL DEFAULT 0,
  device text,
  PRIMARY KEY (day, visitor, tab)
);`;

const sha = (s) => crypto.createHash('sha256').update(`usage:${s}`).digest('hex').slice(0, 24);

// A view from the page -> { row } or { skip } (bots, bad input).
function validate(b, ua) {
  if (BOT.test(String(ua || ''))) return { skip: 'bot' };
  if (!b || typeof b !== 'object') return { skip: 'empty' };
  if (typeof b.v !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(b.v)) return { skip: 'id' };
  const tab = b.open ? OPEN : typeof b.tab === 'string' && /^[a-z0-9]{1,24}$/.test(b.tab) ? b.tab : null;
  if (!tab) return { skip: 'tab' };
  return { row: { visitor: sha(b.v), tab, device: b.d === 'm' ? 'm' : 'd' } };
}

function createStore({ pool, file }) {
  if (pool) {
    let ready = null;
    const init = () => (ready = ready || pool.query(SCHEMA));
    return {
      async add(day, r) {
        await init();
        await pool.query(`INSERT INTO usage_daily (day, visitor, tab, views, device) VALUES ($1,$2,$3,1,$4)
          ON CONFLICT (day, visitor, tab) DO UPDATE SET views = usage_daily.views + 1, device = EXCLUDED.device`, [day, r.visitor, r.tab, r.device]);
      },
      async all() {
        await init();
        const q = await pool.query("SELECT to_char(day, 'YYYY-MM-DD') AS day, visitor, tab, views, device FROM usage_daily ORDER BY day");
        return q.rows;
      },
    };
  }
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; } };
  const write = (rows) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(rows)); };
  return {
    async add(day, r) {
      const rows = read();
      const x = rows.find((y) => y.day === day && y.visitor === r.visitor && y.tab === r.tab);
      if (x) { x.views++; x.device = r.device; } else rows.push({ day, visitor: r.visitor, tab: r.tab, views: 1, device: r.device });
      write(rows);
    },
    async all() { return read().sort((a, b) => a.day.localeCompare(b.day)); },
  };
}

// Day arithmetic on 'YYYY-MM-DD' strings (UTC midnight, so no time-zone drift).
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

// The report for the last `days` days to `today`. A visitor = one browser; opens = times the page was opened.
function summarize(rows, today, days = 60) {
  const from = addDays(today, -(days - 1));
  const first = new Map();
  for (const r of rows) if (!first.has(r.visitor) || r.day < first.get(r.visitor)) first.set(r.visitor, r.day);
  const inR = rows.filter((r) => r.day >= from && r.day <= today);
  const byDay = new Map();
  for (let d = from; d <= today; d = addDays(d, 1)) byDay.set(d, { day: d, v: new Set(), opens: 0, views: 0, fresh: new Set() });
  const byWeek = new Map(), tabs = new Map(), dev = { m: new Set(), d: new Set() }, daysSeen = new Map();
  for (const r of inR) {
    const D = byDay.get(r.day);
    D.v.add(r.visitor);
    if (first.get(r.visitor) === r.day) D.fresh.add(r.visitor);
    if (r.tab === OPEN) D.opens += r.views; else D.views += r.views;
    const wk = mondayOf(r.day);
    if (!byWeek.has(wk)) byWeek.set(wk, { mon: wk, v: new Set(), opens: 0, days: new Set() });
    const W = byWeek.get(wk); W.v.add(r.visitor); if (r.tab === OPEN) W.opens += r.views; W.days.add(r.day);
    if (r.tab !== OPEN) {
      if (!tabs.has(r.tab)) tabs.set(r.tab, { tab: r.tab, v: new Set(), views: 0 });
      const T = tabs.get(r.tab); T.v.add(r.visitor); T.views += r.views;
    }
    (dev[r.device] || dev.d).add(r.visitor);
    if (!daysSeen.has(r.visitor)) daysSeen.set(r.visitor, new Set());
    daysSeen.get(r.visitor).add(r.day);
  }
  const all = new Set(inR.map((r) => r.visitor));
  return {
    today, from, days,
    tracking_since: rows.length ? rows[0].day : null,
    daily: [...byDay.values()].map((D) => ({ day: D.day, visitors: D.v.size, new: D.fresh.size, opens: D.opens, views: D.views })),
    weekly: [...byWeek.values()].sort((a, b) => b.mon.localeCompare(a.mon)).map((W) => ({ mon: W.mon, visitors: W.v.size, opens: W.opens, days: W.days.size })),
    tabs: [...tabs.values()].map((T) => ({ tab: T.tab, visitors: T.v.size, views: T.views })).sort((a, b) => b.visitors - a.visitors || b.views - a.views),
    devices: { phone: [...dev.m].filter((v) => !dev.d.has(v)).length, computer: [...dev.d].filter((v) => !dev.m.has(v)).length, both: [...dev.m].filter((v) => dev.d.has(v)).length },
    visitors: all.size,
    returning: [...daysSeen.values()].filter((s) => s.size >= 2).length,
  };
}

module.exports = { OPEN, validate, createStore, summarize, mondayOf, addDays };
