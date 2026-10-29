// The learning assessment (EGRA / EGMA child test): per-test records stay on the server; the page gets masked
// aggregates only (learning-assessment-rules.md §3-§4: counts only, a group of 1-4 children shows "fewer than 5").
const { records } = require('./unpack');

const TASKS = [
  ['ur.letter_names5', 'Urdu', 'Letter names'], ['ur.letter_sounds5', 'Urdu', 'Letter sounds'], ['ur.words4', 'Urdu', 'Reading words'],
  ['ur.story_w3', 'Urdu', 'Reading a passage (words a minute)'], ['ur.story_comp_w3', 'Urdu', 'Understanding the passage'],
  ['en.letter_names5', 'English', 'Letter names'], ['en.letter_sounds5', 'English', 'Letter sounds'], ['en.words4', 'English', 'Reading words'],
  ['en.story_w3', 'English', 'Reading a passage (words a minute)'], ['en.story_comp_w3', 'English', 'Understanding the passage'],
  ['ma.number_id8', 'Maths', 'Number identification'], ['ma.discrimination2', 'Maths', 'Which number is bigger'], ['ma.missing4', 'Maths', 'Missing number'],
  ['ma.add2i', 'Maths', 'Addition'], ['ma.sub2i', 'Maths', 'Subtraction'], ['ma.mul2i', 'Maths', 'Multiplication'], ['ma.fluency1m', 'Maths', 'Number fluency (a minute)'],
];
const MATHS = [10, 11, 12, 13, 14, 15];   // judged against 75% right
const RATE = [3, 8, 16];                   // rates, not items
const MIN_GROUP = 5;

// [{ si, school, sector, d, g, done, counted, child, ur, en, voice, t: [[correct, of] | null x17] }]
function buildEgra(rows, ro) {
  const out = [];
  for (const r of rows) {
    for (const p of records('egra', r)) {
      if (p.length !== 10) throw new Error('egra: malformed record');
      const t = p[9].split(',');
      if (t.length !== 17) throw new Error('egra: malformed subtasks');
      const si = ro.schoolIndex.get(r.school_id);
      const num = (v) => (v === '' ? null : Number(v));
      out.push({ si: si === undefined ? -1 : si, sector: p[5] || '(no sector)', d: +p[0], g: p[1] === '' ? null : +p[1], done: p[2] === '1',
        counted: p[3] === '1', child: p[4], ur: num(p[6]), en: num(p[7]), voice: p[8] === '1',
        t: t.map((x) => { if (!x) return null; const [a, b] = x.split('/'); return [Number(a), b === '' ? null : Number(b)]; }) });
    }
  }
  return out;
}

// { schoolIndex: { cycle|status: count } }
function buildEgraDraws(rows, ro) {
  const out = {};
  for (const r of rows) {
    const si = ro.schoolIndex.get(r.school_id);
    if (si === undefined) continue;
    for (const p of records('egra_draws', r, '|')) {
      if (p.length !== 3) throw new Error('egra_draws: malformed record');
      (out[si] = out[si] || {})[`${p[0]}|${p[1]}`] = +p[2];
    }
  }
  return out;
}

const median = (v) => { const s = v.slice().sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Measures over a set of tests, against the results page's proposed benchmarks.
function measures(tests) {
  const children = new Set(tests.map((x) => x.child)).size;
  if (children < MIN_GROUP) return { masked: true, children: children ? 'fewer than 5' : 0 };
  const lang = (key, ci, compOf) => {
    const w = tests.map((x) => x[key]).filter((v) => v !== null);
    const comp = tests.map((x) => x.t[ci]).filter(Boolean).map(([c, of]) => c / (of || compOf));
    return { scored: w.length, bands: [w.filter((v) => v === 0).length, w.filter((v) => v > 0 && v < 20).length, w.filter((v) => v >= 20 && v < 40).length, w.filter((v) => v >= 40).length],
      median: median(w), compScored: comp.length, compMet: comp.filter((v) => v >= 0.8).length };
  };
  const maths = tests.map((x) => MATHS.filter((i) => x.t[i]).map((i) => x.t[i][0] / x.t[i][1])).filter((a) => a.length);
  const flu = tests.map((x) => x.t[16]).filter(Boolean).map(([v]) => v);
  return {
    children, tests: tests.length, completed: new Set(tests.filter((x) => x.done).map((x) => x.child)).size, voice: tests.filter((x) => x.voice).length,
    ur: lang('ur', 4, 4), en: lang('en', 9, 3),
    maths: { scored: maths.length, met: maths.filter((a) => a.every((v) => v >= 0.75)).length, fluencyMedian: median(flu), fluencyScored: flu.length },
    tasks: TASKS.map(([id, area, label], i) => {
      const v = tests.map((x) => x.t[i]).filter(Boolean);
      if (RATE.includes(i)) return { id, area, label, rate: true, scored: v.length, median: median(v.map(([c]) => c)) };
      return { id, area, label, scored: v.length, pct: v.length ? (100 * v.reduce((s, [c, of]) => s + c / (of || 1), 0)) / v.length : null };
    }),
  };
}

// What the page asks for: a period and an optional sector / school, in day indexes since 2026-08-01.
function egraSummary(all, draws, data, q) {
  const from = Number.isFinite(+q.from) ? +q.from : 0, to = Number.isFinite(+q.to) ? +q.to : Infinity;
  const school = q.school === undefined || q.school === '' ? null : +q.school;
  const inScope = (x) => x.d >= from && x.d <= to && (!q.sector || x.sector === q.sector) && (school === null || x.si === school);
  const tests = all.filter((x) => x.counted && inScope(x));
  const excluded = all.filter((x) => !x.counted && x.d >= from && x.d <= to).length;
  const group = (keyOf) => {
    const m = new Map();
    for (const x of tests) { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return [...m.entries()].map(([key, list]) => ({ key, ...measures(list) }));
  };
  const days = new Map();
  for (const x of tests) { if (!days.has(x.d)) days.set(x.d, new Set()); days.get(x.d).add(x.child); }
  // sampling: the current quarter's draws in scope
  const sample = {};
  const schools = data ? data.schools : [];
  for (const [si, m] of Object.entries(draws || {})) {
    const S = schools[si];
    if (!S || (q.sector && S.sector !== q.sector) || (school !== null && +si !== school)) continue;
    for (const [k, n] of Object.entries(m)) { const [cycle, status] = k.split('|'); (sample[cycle] = sample[cycle] || {})[status] = (sample[cycle][status] || 0) + n; }
  }
  return {
    ready: true, minGroup: MIN_GROUP, excluded, schools: new Set(tests.map((x) => x.si)).size,
    all: measures(tests),
    days: [...days.entries()].sort((a, b) => a[0] - b[0]).map(([d, s]) => ({ d, children: s.size < MIN_GROUP ? 'fewer than 5' : s.size })),
    grades: group((x) => (x.g === null ? 'No grade' : `Grade ${x.g}`)).sort((a, b) => String(a.key).localeCompare(String(b.key))),
    sectors: group((x) => x.sector).sort((a, b) => String(a.key).localeCompare(String(b.key))),
    // schools with at least five tested children only (smaller schools are left out entirely, not masked by name)
    schoolRows: group((x) => x.si).filter((g) => !g.masked && g.key >= 0).map(({ key, children, ur, en, maths }) => ({ key, children, ur, en, maths })),
    sample,
  };
}

module.exports = { TASKS, MIN_GROUP, buildEgra, buildEgraDraws, measures, egraSummary };
