// Write a synthetic data/data.json (made-up schools and teachers, realistic volumes) so the page can be tried
// locally without the data service: node scripts/fixture.js && node server.js
const fs = require('fs');
const path = require('path');

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const today = Math.round((Date.parse(new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10)) - Date.parse('2026-08-01')) / 86400000);
const sectors = ['B.K', 'Nilore', 'Sihala', 'Tarnol', 'Urban-I', 'Urban-II'];
const schools = [], teachers = [], exams = [], lp = [], obs = [], made = [], sit = [], buckets = [], training = [];
for (let s = 0; s < 354; s++) {
  schools.push({ emis: String(100 + s), sector: sectors[s % 6], name: `Sample School ${s + 1}`, n: 0 });
}
schools.sort((a, b) => a.sector.localeCompare(b.sector));
schools.forEach((sc, si) => {
  const n = 3 + Math.floor(rnd() * 15);
  sc.n = n;
  for (let k = 0; k < n; k++) {
    const ti = teachers.length;
    teachers.push({ s: si, name: `Teacher ${ti + 1}`, lv: rnd() < 0.2 ? 'PM' : 'P' });
    const keen = rnd();
    for (let d = 0; d <= today; d++) {
      if (rnd() < keen * 0.5) lp.push([ti, d, 1, rnd() < 0.1 ? 1 : 0, 1 + Math.floor(rnd() * 2), rnd() < 0.3 ? 1 : 0, rnd() < 0.4 ? 1 : 0]);
      if (rnd() < keen * 0.12) {
        const v3 = d >= 38;
        obs.push([ti, d, 'D', '-', v3 ? 12 + Math.round(rnd() * 10) : 14 + Math.round(rnd() * 14), v3 ? pick([24, 24, 24, 20, 28]) : 32,
          20 + Math.round(rnd() * 26), 48, 12 + Math.round(rnd() * 15), 28, rnd() < 0.5 ? 15 + Math.round(rnd() * 24) : null, rnd() < 0.5 ? 40 : null]);
        if (obs[obs.length - 1][10] === null) obs[obs.length - 1][11] = null;
      }
      if (rnd() < 0.015) {
        const v3 = d >= 38;
        obs.push([ti, d, 'H', pick(['C', 'C', 'C', 'P', 'A']), v3 ? 14 : 18, v3 ? 24 : 32, 28, 48, 18, 28, 22, 40]);
      }
      if (d > 36 && rnd() < keen * 0.05) { const ok = rnd() < 0.95 ? 1 : 0; exams.push([ti, d, 1, ok, 1 - ok, 0, rnd() < 0.1 ? 1 : 0]); }
      if (d > 30 && rnd() < keen * 0.08) {
        made.push([ti, d, 1]);
        const kids = 5 + Math.floor(rnd() * 25);
        sit.push([ti, d, 'L', kids, Math.floor(kids * 0.8), kids]);
      }
    }
    if (rnd() < 0.85) training.push([ti, 1, 46, Math.floor(rnd() * 47), Math.floor(rnd() * 20), 0, rnd() < 0.8 ? (rnd() < 0.6 ? '12' : '1') : '']);
  }
});
// Whole-period, monthly and weekly children per teacher (fixture: assume a class of fixed children).
const kidsBy = new Map();
for (const r of sit) kidsBy.set(r[0], Math.max(kidsBy.get(r[0]) || 0, r[5]));
for (const [ti, k] of kidsBy) buckets.push([ti, 'a', '', 'L', k]);
const quiz_sectors = { ALL: [['a', '', 'L', [...kidsBy.values()].reduce((a, b) => a + b, 0)]] };
const subs = ['urdu', 'english', 'math', 'general_science', 'islamiat'];
const lessons = [{ id: '', grade: '', subject: '', title: 'Typed topic (no curriculum lesson)' }];
for (let i = 0; i < 80; i++) { const g = 1 + (i % 5), sb = subs[i % 5]; lessons.push({ id: `grade_${g}_${sb}_ch${1 + (i % 7)}_seg${i}`, grade: String(g), subject: sb, title: `Sample lesson ${i + 1}` }); }
const gen = [], taughtL = [];
for (const r of lp) { if (!r[2]) continue; const li = rnd() < 0.06 ? 0 : 1 + Math.floor(rnd() * rnd() * 80); gen.push([r[0], r[1], 7 + Math.floor(rnd() * rnd() * 16), li, r[4]]); if (li && rnd() < 0.06) taughtL.push([r[0], r[1] + 1, li, 1]); }
const qscore = [];
const qg = ['1', '2', '3', '4', '5', '1-2', '3-5'], qsub = ['urdu', 'maths', 'english', 'science', 'sst'];
for (const r of sit) { const f = r[4]; if (!f) continue; const ans = f * 8, cor = Math.round(ans * (0.6 + rnd() * 0.35)); const m = Math.round(f * cor / ans * 0.8); const n = Math.round((f - m) * 0.4); qscore.push([r[0], r[1], pick(qg), pick(qsub), f, cor, ans, m, f - m - n, n]); }
const exd = [];
for (const r of exams) exd.push([r[0], r[1], 8 + Math.floor(rnd() * 12), String(1 + Math.floor(rnd() * 5)), pick(['english', 'maths', 'urdu', 'science', 'islamiat']), pick(['s', 's', 'b', 'u']), pick(['w', 'p']), rnd() < 0.3 ? String(1 + Math.floor(rnd() * 8)) : '', r[2], r[3], 15, 12, 3, r[1] > 75 && rnd() < 0.3 ? pick(['f', 'f', 'f', 'c', 'p']) : '']);
const data = { as_of: 'fixture', window_start: '2026-08-01', today, rule_version: 'fixture', schools, teachers, roster_sig: 'fixture', errors: [],
  lp, obs, observe2_excluded: 12, quiz: { made, sit, buckets }, quiz_sectors, exams, training, qscore, exd, lpd: { lessons, gen, taught: taughtL } };
fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'data.json'), JSON.stringify(data));
console.log(`fixture: ${schools.length} schools, ${teachers.length} teachers, ${lp.length} LP days, ${obs.length} observations, today=${today}`);
