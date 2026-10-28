// ICT Primary Teachers dashboard: serves the page and refreshes its data from the Taleemabad data service
// (MCP over HTTP) at set times each day. Every sql/*.sql query is run, unpacked and checked here; the page
// does the date filtering and roll-ups in the browser from the compact arrays in /api/data.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require('./db');
const { buildRoster, buildLp, buildObservations, buildQuizzes, buildQuizSectors, buildExams, buildTraining, buildLessons, buildLpDetail, buildQuizScores, buildExamDetail, buildTeacherGrades, buildCoaches, buildDebriefs, buildObserve2, buildPilot, rosterSig } = require('./unpack');

const PORT = Number(process.env.PORT) || 3000;
// The Taleemabad data service (MCP over HTTP). Set it in the host's environment; it is never kept in the code.
const MCP_URL = process.env.MCP_URL || '';
const MCP_USER = process.env.TALEEMABAD_USER || '';
const MCP_TOKEN = process.env.TALEEMABAD_API_TOKEN || ''; // only needed if the data service turns on strict auth
const RULE_VERSION = process.env.RULE_VERSION || 'v0.39.3';
const REFRESH_TOKEN = process.env.REFRESH_TOKEN || '';
const PAGE_SIZE = Math.min(Math.max(Number(process.env.PAGE_SIZE) || 50, 10), 100);
// Daily refresh times in Pakistan time, "HH:MM" comma-separated.
const REFRESH_TIMES_PKT = (process.env.REFRESH_TIMES_PKT || '07:13,14:13')
  .split(',').map((t) => t.trim().match(/^(\d{1,2}):(\d{2})$/)).filter(Boolean)
  .map((m) => ({ h: Number(m[1]), m: Number(m[2]) }))
  .filter((t) => t.h < 24 && t.m < 60);
if (!REFRESH_TIMES_PKT.length) throw new Error('REFRESH_TIMES_PKT has no valid HH:MM times');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const WINDOW_START = '2026-08-01';               // day 0 of every "day" index in the queries
const COMMON = fs.readFileSync(path.join(__dirname, 'sql', '_common.sql'), 'utf8').trim();
const loadSql = (name) => fs.readFileSync(path.join(__dirname, 'sql', `${name}.sql`), 'utf8').replace('{{COMMON}}', COMMON);
const SQL = Object.fromEntries(['roster', 'lp', 'lp_detail', 'lp_lessons', 'observations', 'quizzes', 'quiz_sectors', 'quiz_scores', 'exams', 'exam_detail', 'teacher_grades', 'coaches', 'debriefs', 'observe2', 'pilot', 'training'].map((n) => [n, loadSql(n)]));

let state = { data: null, gz: null, as_of: null, last_attempt: null, last_error: null, refreshing: false };

function log(...a) { console.log(new Date().toISOString(), ...a); }

function pktStamp(d = new Date()) {
  const p = new Date(d.getTime() + 5 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.getUTCFullYear()}-${pad(p.getUTCMonth() + 1)}-${pad(p.getUTCDate())} ${pad(p.getUTCHours())}:${pad(p.getUTCMinutes())} PKT`;
}
// Today's day index (days since WINDOW_START, Pakistan date).
const todayIndex = () => Math.round((Date.parse(pktStamp().slice(0, 10)) - Date.parse(WINDOW_START)) / 86400000);

// The data service answers either plain JSON or a server-sent-events stream.
async function readRpc(res) {
  const text = await res.text();
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    const datas = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
    for (let i = datas.length - 1; i >= 0; i--) {
      try { const j = JSON.parse(datas[i]); if (j.result || j.error) return j; } catch { /* keep looking */ }
    }
    throw new Error('no JSON-RPC result in event stream');
  }
  return JSON.parse(text);
}

async function executeQuery(sql, question) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-Taleemabad-User': MCP_USER,
    'X-Taleemabad-Surface': 'railway-dashboard',
  };
  if (MCP_TOKEN) headers.Authorization = `Bearer ${MCP_TOKEN}`;
  const body = {
    jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
    params: { name: 'execute_query', arguments: { sql, question, rule_version: RULE_VERSION, asked_by: MCP_USER, surface: 'railway-dashboard' } },
  };
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(240000) });
  if (!res.ok) throw new Error(`data service HTTP ${res.status}`);
  const rpc = await readRpc(res);
  if (rpc.error) throw new Error(`data service error: ${rpc.error.message || JSON.stringify(rpc.error)}`);
  const content = rpc.result && rpc.result.content && rpc.result.content[0];
  if (!content || content.type !== 'text') throw new Error('unexpected tool result shape');
  if (rpc.result.isError) throw new Error(`query failed: ${content.text.slice(0, 300)}`);
  let out = JSON.parse(content.text);
  if (typeof out.result === 'string') out = JSON.parse(out.result);
  if (out.status !== 'ok') throw new Error(`query status ${out.status}: ${JSON.stringify(out).slice(0, 300)}`);
  if (out.truncated) throw new Error('result truncated');
  return out.rows || [];
}

const QUESTIONS = {
  roster: 'scheduled refresh: ICT Primary Teachers dashboard, primary teachers per programme school (teacher headcount 1e, PRIMARY level)',
  lp: 'scheduled refresh: ICT Primary Teachers dashboard, lesson plans got and taught per primary teacher per day since 1 Aug 2026',
  observations: 'scheduled refresh: ICT Primary Teachers dashboard, Digital Coach and coach-visit observations with FICO section scores per primary teacher since 1 Aug 2026',
  quizzes: 'scheduled refresh: ICT Primary Teachers dashboard, quizzes made and children taking quizzes per primary teacher since 1 Aug 2026 (counts only)',
  quiz_sectors: 'scheduled refresh: ICT Primary Teachers dashboard, distinct children taking quizzes per sector since 1 Aug 2026 (counts only)',
  lp_detail: 'scheduled refresh: ICT Primary Teachers dashboard, lesson plans generated per primary teacher by day, hour and curriculum lesson, and lessons taught in DC, since 1 Aug 2026',
  lp_lessons: 'scheduled refresh: ICT Primary Teachers dashboard, curriculum lesson catalogue (lesson, grade, subject, title)',
  quiz_scores: 'scheduled refresh: ICT Primary Teachers dashboard, children\'s finished lesson-quiz scores per primary teacher, day, grade and subject since 1 Aug 2026 (aggregates only, provisional)',
  pilot: 'scheduled refresh: ICT Primary Teachers dashboard, FICO /observe2 pilot field forms - provisional, DC and final levels, evidence check marks, priorities (study design of 7 Oct 2026)',
  observe2: 'scheduled refresh: ICT Primary Teachers dashboard, /observe2 (fico17) coach visits of primary teachers since 1 Aug 2026 - levels, priorities, children\'s thinking',
  debriefs: 'scheduled refresh: ICT Primary Teachers dashboard, HITL debrief reports per primary teacher since 1 Aug 2026 (summary, strengths, growth areas, action plan, focus area; no verbatim classroom quotes)',
  coaches: 'scheduled refresh: ICT Primary Teachers dashboard, coaches who held HITL observations of primary teachers since 1 Aug 2026, with names (internal use only)',
  teacher_grades: 'scheduled refresh: ICT Primary Teachers dashboard, the grades each primary teacher teaches on the class roster, for DC observations by grade',
  exam_detail: 'scheduled refresh: ICT Primary Teachers dashboard, exam papers per primary teacher by day, hour, grade, subject, seen/unseen, surface and chapter since 1 Aug 2026',
  exams: 'scheduled refresh: ICT Primary Teachers dashboard, exam papers from the /assessment generator per primary teacher per day since 1 Aug 2026',
  training: 'scheduled refresh: ICT Primary Teachers dashboard, NIETE primary training per primary teacher, all time',
};

// Run a per-school packed query page by page (stable ORDER BY school_id) until a short page comes back.
// Pages by school id (keyset), not OFFSET: the data can change between page queries during a refresh, and an
// OFFSET then shifts, repeating or skipping a school. Each page asks for the schools after the last one seen.
async function runPaged(name, size = PAGE_SIZE) {
  const base = SQL[name].replace(/\s*LIMIT \{\{LIMIT\}\} OFFSET \{\{OFFSET\}\}\s*$/, '');
  if (base === SQL[name]) throw new Error(`${name}: query has no LIMIT/OFFSET placeholder`);
  const rows = [];
  let after = '';
  for (let page = 1; ; page++) {
    if (!/^[0-9a-f-]*$/i.test(after)) throw new Error(`${name}: unexpected school id`);
    const sql = `SELECT * FROM (
${base}
) WHERE school_id > '${after}' ORDER BY school_id LIMIT ${size}`;
    const got = await executeQuery(sql, `${QUESTIONS[name]} (page ${page})`);
    rows.push(...got);
    if (got.length < size) break;
    after = String(got[got.length - 1].school_id);
    if (page > 400) throw new Error(`${name}: too many pages`);
  }
  if (new Set(rows.map((r) => r.school_id)).size !== rows.length) throw new Error(`${name}: a school came back twice across pages`);
  return rows;
}

// Teacher indexes are only stable within one roster, so a failed part keeps its earlier values only when the
// roster signature is unchanged (prev is null otherwise) and the part is left empty instead.
function carryPart(prev, part) {
  if (!prev || !prev[part]) return null;
  return prev[part];
}

async function refresh(reason) {
  if (state.refreshing) return;
  state.refreshing = true;
  state.last_attempt = new Date().toISOString();
  const t0 = Date.now();
  log(`refresh start (${reason})`);
  try {
    if (!MCP_USER) throw new Error('TALEEMABAD_USER is not set');
    if (!MCP_URL) throw new Error('MCP_URL is not set');
    // Build the whole refresh off to the side and swap it in once.
    const ro = buildRoster(await runPaged('roster'));
    const prev = state.data && state.data.roster_sig === rosterSig(ro) ? state.data : null;
    const next = { as_of: pktStamp(), window_start: WINDOW_START, today: todayIndex(), rule_version: RULE_VERSION,
      schools: ro.schools, teachers: ro.teachers, roster_sig: rosterSig(ro), errors: [] };
    const parts = [
      ['lp', async () => ({ lp: buildLp(await runPaged('lp'), ro) })],
      ['observations', async () => { const o = buildObservations(await runPaged('observations'), ro); return { obs: o.rows, observe2_excluded: o.observe2_excluded }; }],
      ['quizzes', async () => ({ quiz: buildQuizzes(await runPaged('quizzes'), ro) })],
      ['quiz_sectors', async () => ({ quiz_sectors: buildQuizSectors(await executeQuery(SQL.quiz_sectors, QUESTIONS.quiz_sectors)) })],
      ['quiz_scores', async () => ({ qscore: buildQuizScores(await runPaged('quiz_scores'), ro) })],
      ['exams', async () => ({ exams: buildExams(await runPaged('exams'), ro) })],
      ['exam_detail', async () => ({ exd: buildExamDetail(await runPaged('exam_detail'), ro) })],
      ['teacher_grades', async () => ({ tgr: buildTeacherGrades(await runPaged('teacher_grades'), ro) })],
      ['coaches', async () => ({ coaches: buildCoaches(await executeQuery(SQL.coaches, QUESTIONS.coaches)) })],
      ['pilot', async () => ({ pilot: buildPilot(await executeQuery(SQL.pilot, QUESTIONS.pilot), ro) })],
      ['observe2', async () => ({ o2: buildObserve2(await runPaged('observe2'), ro) })],
      ['debriefs', async () => ({ deb: buildDebriefs(await runPaged('debriefs', 10), ro) })],
      ['lp_detail', async () => {
        const lessons = buildLessons(await executeQuery(SQL.lp_lessons, QUESTIONS.lp_lessons));
        return { lpd: buildLpDetail(await runPaged('lp_detail', Math.min(PAGE_SIZE, 25)), ro, lessons) };
      }],
      ['training', async () => ({ training: buildTraining(await runPaged('training'), ro) })],
    ];
    const KEYS = { lp: ['lp'], observations: ['obs', 'observe2_excluded'], quizzes: ['quiz'], quiz_sectors: ['quiz_sectors'], exams: ['exams'], lp_detail: ['lpd'], quiz_scores: ['qscore'], exam_detail: ['exd'], teacher_grades: ['tgr'], coaches: ['coaches'], debriefs: ['deb'], observe2: ['o2'], pilot: ['pilot'], training: ['training'] };
    for (const [name, run] of parts) {
      try {
        Object.assign(next, await run());
        log(`${name} ok`);
      } catch (e) {
        // Keep the previous values only when the roster is unchanged (teacher indexes must line up).
        for (const k of KEYS[name]) next[k] = carryPart(prev, k);
        next.errors.push(`${name}: ${e.message || e}`);
        log(`${name} failed${prev ? ', keeping previous' : ''}: ${e.message || e}`);
      }
    }
    log(`refresh done in ${Math.round((Date.now() - t0) / 1000)}s: ${ro.schools.length} schools, ${ro.teachers.length} teachers, `
      + `${(next.lp || []).length} LP days, ${(next.obs || []).length} observations, ${next.errors.length} errors`);
    setData(next);
    state.last_error = next.errors.length ? next.errors.join('; ') : null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(next));
    if (db.enabled()) {
      try { await db.saveCache(next); log('saved cache to Postgres'); }
      catch (e) { log(`Postgres save failed (dashboard unaffected): ${e.message || e}`); }
    }
  } catch (e) {
    state.last_error = String(e.message || e);
    log(`refresh failed, keeping previous data: ${state.last_error}`);
    setTimeout(() => refresh('retry'), 30 * 60 * 1000);
  } finally {
    state.refreshing = false;
  }
}

// The debrief text (~9 MB) stays on the server and is served one teacher at a time by /api/debrief.
function setData(data) {
  const { deb, ...pub } = data;
  state.data = data;
  state.deb = deb || null;
  state.as_of = data.as_of;
  state.gz = zlib.gzipSync(JSON.stringify(pub));
}

function msUntilNextRun() {
  const now = new Date();
  let best = Infinity;
  for (const t of REFRESH_TIMES_PKT) {
    const next = new Date(now);
    next.setUTCHours(t.h - 5, t.m, 0, 0); // PKT is UTC+5; negative hours roll back a day
    while (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    best = Math.min(best, next - now);
  }
  return best;
}

function scheduleDaily() {
  const ms = msUntilNextRun();
  log(`next scheduled refresh in ${Math.round(ms / 60000)} min`);
  setTimeout(async () => { await refresh('scheduled'); scheduleDaily(); }, ms);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };

function send(res, code, body, type, extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}

const schedule = () => REFRESH_TIMES_PKT.map((t) => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`);

// index.html with each script and stylesheet stamped by a hash of its content, so browsers never run stale code.
const hashOf = (f) => require('crypto').createHash('sha1').update(fs.readFileSync(path.join(PUBLIC_DIR, f))).digest('hex').slice(0, 10);
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
  .replace('__V_CSS__', hashOf('app.css')).replace('__V_CALC__', hashOf('calc.js')).replace('__V_APP__', hashOf('app.js'));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, JSON.stringify({ as_of: state.as_of, last_attempt: state.last_attempt, last_error: state.last_error,
      refreshing: state.refreshing, schedule_pkt: schedule(), ready: !!state.gz }), 'application/json', { 'Cache-Control': 'no-store' });
  }
  if (req.method === 'GET' && url.pathname === '/api/data') {
    if (!state.gz) return send(res, 503, JSON.stringify({ error: 'loading', last_error: state.last_error }), 'application/json', { 'Cache-Control': 'no-store' });
    const head = { 'Cache-Control': 'no-cache', ETag: `"${state.as_of}"` };
    if (req.headers['if-none-match'] === head.ETag) return send(res, 304, '', 'application/json', head);
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return send(res, 200, state.gz, 'application/json', { ...head, 'Content-Encoding': 'gzip' });
    return send(res, 200, zlib.gunzipSync(state.gz), 'application/json', head);
  }
  if (req.method === 'GET' && url.pathname === '/api/debrief') {
    const t = url.searchParams.get('t');
    if (!/^\d{1,6}$/.test(t || '')) return send(res, 400, '{"error":"bad teacher"}', TYPES['.json']);
    const body = JSON.stringify({ as_of: state.as_of, ready: !!state.deb, items: (state.deb && state.deb[t]) || [] });
    return send(res, 200, body, TYPES['.json'], { 'Cache-Control': 'no-cache' });
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    return send(res, 200, JSON.stringify({ ok: true, teachers: state.data ? state.data.teachers.length : 0, as_of: state.as_of, last_error: state.last_error }), 'application/json');
  }
  if (req.method === 'POST' && url.pathname === '/api/refresh') {
    if (!REFRESH_TOKEN || req.headers['x-refresh-token'] !== REFRESH_TOKEN) return send(res, 403, 'forbidden', 'text/plain');
    refresh('manual');
    return send(res, 202, 'refresh started', 'text/plain');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
  if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, INDEX_HTML, TYPES['.html'], { 'Cache-Control': 'no-cache' });
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'not found', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    const ext = path.extname(file);
    // Page and scripts change with each deploy, so browsers must revalidate them; fonts and images rarely change.
    send(res, 200, buf, TYPES[ext] || 'application/octet-stream',
      { 'Cache-Control': ['.html', '.js', '.css', '.json'].includes(ext) ? 'no-cache' : 'public, max-age=604800' });
  });
});

try {
  setData(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')));
  log(`loaded cached data from ${state.as_of}`);
} catch { /* first boot: no cache yet */ }

(async () => {
  try {
    if (await db.init()) {
      log('Postgres connected');
      if (!state.data) {
        const c = await db.loadCache();
        if (c && c.teachers) { setData(c); log(`loaded cached data from Postgres (${c.as_of})`); }
      }
    } else log('DATABASE_URL not set: startup cache is the local file only');
  } catch (e) {
    log(`Postgres unavailable, continuing without it: ${e.message || e}`);
  }
  server.listen(PORT, () => {
    log(`listening on ${PORT}`);
    refresh('startup');
    scheduleDaily();
  });
})();
