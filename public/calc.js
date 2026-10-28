// Roll-ups for the ICT Primary dashboard, shared by the page and the Node tests. Every figure is built from the
// compact arrays in /api/data for a chosen date range (day indexes since data.window_start, Pakistan dates):
//   lp   [teacher, day, g15, g612, plans, taught, answered]
//   obs  [teacher, day, src D|H, stage L|-|C|P|A (DC L = taught a recent Rumi plan), tsk_s, tsk_m, hlp_s, hlp_m, se_s, se_m, lpf_s, lpf_m]
//   quiz.made [teacher, day, n]; quiz.sit [who, day, kind L|V, sittings, finished, children];
//   quiz.buckets [who, w|o|a, bucket, kind, children]   (who < 0 = the whole school -1-who)
//   quiz_sectors {sector|ALL: [[d|w|o|a, bucket, kind, children]]}
//   exams [teacher, day, requested, delivered, failed, never finished, edited]
//   training [teacher, on programme, m1, m2, m3, m4, levels certified]
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const DAY = 86400000;
  // FICO section maxima. Only Subject knowledge changed (v2 out of 32 to 7 Sep; v3 out of 20/24/28 from 8 Sep,
  // by the subject items that apply), so it is kept as two separate sections; anything else is an unknown scale.
  const MAX_OK = { hlp: [48], se: [28], lpf: [40] };
  const TSK_V2 = [32];
  const TSK_V3 = [20, 24, 28];
  const SECTIONS = ['lpf', 'tsk3', 'tsk2', 'hlp', 'se'];
  const SECTION_LABEL = {
    lpf: 'Lesson-plan fidelity', tsk3: 'Subject knowledge (FICO v3, from 8 Sep)', tsk2: 'Subject knowledge (FICO v2, to 7 Sep)',
    hlp: 'Teaching practices', se: 'Student engagement',
  };
  const MODULES = [46, 46, 40, 39];   // NIETE levels 1-4 (niete_primary), live 2026-10-27; replaced by data.modules when present

  function dayToDate(start, i) { return new Date(Date.parse(start) + i * DAY).toISOString().slice(0, 10); }
  function dateToDay(start, iso) { return Math.round((Date.parse(iso) - Date.parse(start)) / DAY); }
  // Monday on or before day i (as a day index). Day 0 is window_start.
  function mondayOf(start, i) {
    const wd = new Date(Date.parse(start) + i * DAY).getUTCDay();   // 0 Sunday
    return i - ((wd + 6) % 7);
  }
  function monthKey(start, i) { return dayToDate(start, i).slice(0, 7).replace('-', ''); }

  // Which exact distinct-children bucket covers [from, to], given data exists only from day 0 to `today`:
  // a single day, a Monday-Sunday week, a calendar month, or the whole period. Otherwise null.
  function childBucket(start, today, from, to) {
    const lo = Math.max(from, 0), hi = Math.min(to, today);
    if (lo > hi) return null;
    if (lo === 0 && hi === today) return { type: 'a', key: '' };
    if (lo === hi) return { type: 'd', key: String(lo) };
    const mon = mondayOf(start, lo);
    if (mondayOf(start, hi) === mon && Math.max(mon, 0) === lo && (hi === mon + 6 || hi === today)) return { type: 'w', key: String(mon) };
    const mk = monthKey(start, lo);
    if (monthKey(start, hi) === mk) {
      const first = dateToDay(start, `${mk.slice(0, 4)}-${mk.slice(4)}-01`);
      const next = new Date(Date.UTC(+mk.slice(0, 4), +mk.slice(4), 1)).toISOString().slice(0, 10);
      const last = dateToDay(start, next) - 1;
      if (Math.max(first, 0) === lo && (hi === last || hi === today)) return { type: 'o', key: mk };
    }
    return null;
  }

  function blankFico() { const o = {}; for (const s of SECTIONS) o[s] = [0, 0, 0]; return o; }   // score sum, max sum, sessions
  function addFico(f, r) {
    const [tS, tM, hS, hM, sS, sM, lS, lM] = r.slice(4);
    let odd = 0;
    if (tS !== null && tM) {
      const k = TSK_V3.includes(tM) ? 'tsk3' : TSK_V2.includes(tM) ? 'tsk2' : null;
      if (k) { f[k][0] += tS; f[k][1] += tM; f[k][2]++; } else odd++;
    }
    for (const [k, s, m] of [['hlp', hS, hM], ['se', sS, sM], ['lpf', lS, lM]]) {
      if (s === null || !m) continue;
      if (MAX_OK[k].includes(m)) { f[k][0] += s; f[k][1] += m; f[k][2]++; } else odd++;
    }
    return odd;
  }
  function mergeFico(a, b) { for (const s of SECTIONS) for (let i = 0; i < 3; i++) a[s][i] += b[s][i]; }
  const pct = (f) => (f[1] ? (100 * f[0]) / f[1] : null);

  function blankTeacher() {
    return { g15: false, g612: false, lpDays: 0, plans: 0, taught: 0, saidTaught: 0, answered: 0,
      dc: 0, hitl: 0, hitlC: 0, hitlP: 0, hitlA: 0, ficoD: blankFico(), ficoH: blankFico(), odd: 0,
      made: 0, sitL: 0, finL: 0, sitV: 0, finV: 0, kidsL: null, kidsV: null, exReq: 0, exOk: 0, exFail: 0, exStuck: 0, exEdit: 0, qF: 0, qC: 0, qA: 0, qM: 0, qD: 0, qN: 0 };
  }

  // Index the rows by teacher once per data load.
  function prepare(data) {
    const nT = data.teachers.length;
    const by = (rows) => { const a = Array.from({ length: nT }, () => []); for (const r of rows || []) if (r[0] >= 0) a[r[0]].push(r); return a; };
    const schoolSit = Array.from({ length: data.schools.length }, () => []);
    const schoolBk = Array.from({ length: data.schools.length }, () => []);
    const q = data.quiz || { made: [], sit: [], buckets: [] };
    for (const r of q.sit) if (r[0] < 0) schoolSit[-1 - r[0]].push(r);
    for (const r of q.buckets) if (r[0] < 0) schoolBk[-1 - r[0]].push(r);
    const training = new Array(nT).fill(null);
    for (const r of data.training || []) training[r[0]] = r;
    const modules = data.modules || MODULES;
    return { data, lp: by(data.lp), obs: by(data.obs), ex: by(data.exams), qs: by(data.qscore), made: by(q.made), sit: by(q.sit), bk: by(q.buckets), schoolSit, schoolBk, training, modules,
      parts: { lp: !!data.lp, obs: !!data.obs, exams: !!data.exams, quiz_scores: !!data.qscore, quiz: !!data.quiz, quiz_sectors: !!data.quiz_sectors, training: !!data.training } };
  }

  function kidsFrom(buckets, sits, b, from, to) {
    // Exact distinct children for bucket b from bucket rows, or from daily sitting rows for a single day.
    const out = { L: 0, V: 0 };
    if (!b) return null;
    if (b.type === 'd') { for (const r of sits) if (r[1] === +b.key) out[r[2]] += r[5]; return out; }
    for (const r of buckets) if (r[1] === b.type && r[2] === b.key && (r[3] === 'L' || r[3] === 'V')) out[r[3]] += r[4];
    return out;
  }

  function teacherStats(P, ti, from, to, b) {
    const t = blankTeacher();
    for (const r of P.lp[ti]) {
      if (r[1] < from || r[1] > to) continue;
      if (r[2]) t.g15 = true;
      if (r[3]) t.g612 = true;
      if (r[2] || r[3]) t.lpDays++;
      t.plans += r[4]; t.saidTaught += r[5]; t.answered += r[6];
    }
    for (const r of P.obs[ti]) {
      if (r[1] < from || r[1] > to) continue;
      if (r[2] === 'D') { t.dc++; if (r[3] === 'L') t.taught++; t.odd += addFico(t.ficoD, r); }
      else { t.hitl++; if (r[3] === 'C') t.hitlC++; else if (r[3] === 'P') t.hitlP++; else t.hitlA++; t.odd += addFico(t.ficoH, r); }
    }
    for (const r of P.made[ti]) if (r[1] >= from && r[1] <= to) t.made += r[2];
    for (const r of P.qs[ti]) {
      if (r[1] < from || r[1] > to) continue;
      t.qF += r[4]; t.qC += r[5]; t.qA += r[6]; t.qM += r[7]; t.qD += r[8]; t.qN += r[9];
    }
    for (const r of P.ex[ti]) {
      if (r[1] < from || r[1] > to) continue;
      t.exReq += r[2]; t.exOk += r[3]; t.exFail += r[4]; t.exStuck += r[5]; t.exEdit += r[6];
    }
    for (const r of P.sit[ti]) {
      if (r[1] < from || r[1] > to) continue;
      if (r[2] === 'L') { t.sitL += r[3]; t.finL += r[4]; } else { t.sitV += r[3]; t.finV += r[4]; }
    }
    const k = kidsFrom(P.bk[ti], P.sit[ti], b);
    if (k) { t.kidsL = k.L; t.kidsV = k.V; }
    const tr = P.training[ti];
    t.onProg = !!(tr && tr[1]);
    t.mods = tr ? [tr[2], tr[3], tr[4], tr[5]] : [0, 0, 0, 0];
    t.certs = tr ? tr[6] : '';
    return t;
  }

  function blankGroup() {
    return { teachers: 0, g15: 0, lpAny: 0, plans: 0, taught: 0, answered: 0, teachersTaught: 0,
      dc: 0, dcT: 0, hitl: 0, hitlT: 0, hitlC: 0, hitlP: 0, hitlA: 0, ficoD: blankFico(), ficoH: blankFico(), odd: 0,
      made: 0, madeT: 0, sitL: 0, finL: 0, sitV: 0, finV: 0, quizT: 0, quizLT: 0, kidsL: null, kidsV: null,
      exReq: 0, exOk: 0, exFail: 0, exStuck: 0, exEdit: 0, exT: 0, qF: 0, qC: 0, qA: 0, qM: 0, qD: 0, qN: 0, qT: 0,
      onProg: 0, didModule: 0, cert: [0, 0, 0, 0], mods: 0, schools: 0 };
  }
  function addToGroup(g, t) {
    g.teachers++;
    if (t.g15) g.g15++;
    if (t.g15 || t.g612) g.lpAny++;
    g.plans += t.plans; g.taught += t.taught; g.answered += t.answered; if (t.taught) g.teachersTaught++;
    g.dc += t.dc; if (t.dc) g.dcT++;
    g.hitl += t.hitl; if (t.hitl) g.hitlT++; g.hitlC += t.hitlC; g.hitlP += t.hitlP; g.hitlA += t.hitlA;
    mergeFico(g.ficoD, t.ficoD); mergeFico(g.ficoH, t.ficoH); g.odd += t.odd;
    g.made += t.made; if (t.made) g.madeT++;
    g.sitL += t.sitL; g.finL += t.finL; g.sitV += t.sitV; g.finV += t.finV; if (t.sitL || t.sitV) g.quizT++; if (t.sitL) g.quizLT++;
    g.qF += t.qF; g.qC += t.qC; g.qA += t.qA; g.qM += t.qM; g.qD += t.qD; g.qN += t.qN; if (t.qF) g.qT++;
    g.exReq += t.exReq; g.exOk += t.exOk; g.exFail += t.exFail; g.exStuck += t.exStuck; g.exEdit += t.exEdit; if (t.exOk) g.exT++;
    if (t.onProg) g.onProg++;
    const m = t.mods[0] + t.mods[1] + t.mods[2] + t.mods[3];
    if (m) g.didModule++;
    g.mods += m;
    for (let l = 1; l <= 4; l++) if (t.certs.includes(String(l))) g.cert[l - 1]++;
  }

  // One teacher's figures in the same shape as a group, so tables can share column definitions.
  function asGroup(t) { const g = blankGroup(); addToGroup(g, t); g.kidsL = t.kidsL; g.kidsV = t.kidsV; return g; }

  // Everything for one date range and filter: per teacher, per school, per sector and for the selection.
  function rollup(P, opts) {
    const { data } = P;
    const from = opts.from, to = opts.to;
    const b = childBucket(data.window_start, data.today, from, to);
    const teachers = [];
    const schools = new Map();
    const sectors = new Map();
    const all = blankGroup();
    for (let ti = 0; ti < data.teachers.length; ti++) {
      const T = data.teachers[ti];
      const S = data.schools[T.s];
      if (opts.sector && S.sector !== opts.sector) continue;
      if (opts.school !== undefined && opts.school !== null && opts.school !== '' && T.s !== +opts.school) continue;
      const t = teacherStats(P, ti, from, to, b);
      t.i = ti; t.name = T.name; t.s = T.s; t.lv = T.lv;
      teachers.push(t);
      if (!schools.has(T.s)) { const g = blankGroup(); g.s = T.s; schools.set(T.s, g); }
      if (!sectors.has(S.sector)) sectors.set(S.sector, blankGroup());
      addToGroup(schools.get(T.s), t); addToGroup(sectors.get(S.sector), t); addToGroup(all, t);
    }
    // Distinct children: a school's own bucket, a sector's and all ICT's from quiz_sectors - never summed from below.
    for (const [si, g] of schools) {
      const k = kidsFrom(P.schoolBk[si], P.schoolSit[si], b);
      if (k) { g.kidsL = k.L; g.kidsV = k.V; }
    }
    const qs = data.quiz_sectors || {};
    const secKids = (area) => {
      const rows = qs[area];
      if (!b || !rows) return null;
      const o = { L: 0, V: 0 };
      for (const r of rows) if (r[0] === b.type && r[1] === b.key && (r[2] === 'L' || r[2] === 'V')) o[r[2]] += r[3];
      return o;
    };
    for (const [name, g] of sectors) {
      const k = secKids(name); if (k) { g.kidsL = k.L; g.kidsV = k.V; }
      g.schools = [...schools.values()].filter((s) => data.schools[s.s].sector === name).length;
    }
    all.schools = schools.size;
    const whole = !opts.sector && (opts.school === undefined || opts.school === null || opts.school === '');
    if (whole) { const k = secKids('ALL'); if (k) { all.kidsL = k.L; all.kidsV = k.V; } }
    else if (opts.school !== undefined && opts.school !== null && opts.school !== '') { const g = schools.get(+opts.school); if (g) { all.kidsL = g.kidsL; all.kidsV = g.kidsV; } }
    else if (opts.sector) { const g = sectors.get(opts.sector); if (g) { all.kidsL = g.kidsL; all.kidsV = g.kidsV; } }
    return { teachers, schools, sectors, all, bucket: b };
  }

  // Time series at day / week / month grain over [from, to] for the filtered teachers.
  function series(P, opts, gran) {
    const { data } = P;
    const start = data.window_start;
    const from = Math.max(opts.from, 0), to = Math.min(opts.to, data.today);
    const keyOf = (d) => (gran === 'day' ? d : gran === 'week' ? Math.max(mondayOf(start, d), 0) : monthKey(start, d));
    const order = [];
    const map = new Map();
    for (let d = from; d <= to; d++) {
      const k = keyOf(d);
      if (!map.has(k)) {
        const lo = d;
        map.set(k, { key: k, from: lo, to: lo, plans: 0, taught: 0, tPlan: new Set(), dc: 0, tDc: new Set(), hitl: 0, tHitl: new Set(),
          ficoD: blankFico(), ficoH: blankFico(), made: 0, sitL: 0, sitV: 0, kidsL: null, kidsV: null, exOk: 0, tEx: new Set(), qC: 0, qA: 0, qF: 0 });
        order.push(k);
      }
      map.get(k).to = d;
    }
    const inScope = (ti) => {
      const T = data.teachers[ti]; const S = data.schools[T.s];
      if (opts.sector && S.sector !== opts.sector) return false;
      if (opts.school !== undefined && opts.school !== null && opts.school !== '' && T.s !== +opts.school) return false;
      return true;
    };
    const at = (d) => (d >= from && d <= to ? map.get(keyOf(d)) : null);
    for (const r of data.lp || []) { const g = at(r[1]); if (!g || !inScope(r[0])) continue; g.plans += r[4]; if (r[2]) g.tPlan.add(r[0]); }
    for (const r of data.obs || []) {
      const g = at(r[1]); if (!g || !inScope(r[0])) continue;
      if (r[2] === 'D') { g.dc++; if (r[3] === 'L') g.taught++; g.tDc.add(r[0]); addFico(g.ficoD, r); } else { g.hitl++; g.tHitl.add(r[0]); addFico(g.ficoH, r); }
    }
    for (const r of data.qscore || []) { const g = at(r[1]); if (!g || !inScope(r[0])) continue; g.qF += r[4]; g.qC += r[5]; g.qA += r[6]; }
    for (const r of data.exams || []) { const g = at(r[1]); if (!g || !inScope(r[0])) continue; g.exOk += r[3]; if (r[3]) g.tEx.add(r[0]); }
    const q = data.quiz || { made: [], sit: [] };
    for (const r of q.made) { const g = at(r[1]); if (g && inScope(r[0])) g.made += r[2]; }
    for (const r of q.sit) { if (r[0] < 0) continue; const g = at(r[1]); if (!g || !inScope(r[0])) continue; if (r[2] === 'L') g.sitL += r[3]; else g.sitV += r[3]; }
    // Distinct children per bucket where an exact count exists for this selection.
    for (const k of order) {
      const g = map.get(k);
      const b = childBucket(start, data.today, g.from, g.to);
      let kids = null;
      if (!opts.sector && (opts.school === undefined || opts.school === null || opts.school === '')) kids = sectorKids(data, 'ALL', b);
      else if (opts.school !== undefined && opts.school !== null && opts.school !== '') kids = kidsFrom(P.schoolBk[+opts.school], P.schoolSit[+opts.school], b);
      else kids = sectorKids(data, opts.sector, b);
      if (kids) { g.kidsL = kids.L; g.kidsV = kids.V; }
    }
    return order.map((k) => {
      const g = map.get(k);
      return { key: k, from: g.from, to: g.to, plans: g.plans, taught: g.taught, teachersWithPlan: g.tPlan.size, dc: g.dc, teachersDc: g.tDc.size,
        hitl: g.hitl, teachersHitl: g.tHitl.size, ficoD: g.ficoD, ficoH: g.ficoH, made: g.made, sitL: g.sitL, sitV: g.sitV, kidsL: g.kidsL, kidsV: g.kidsV, exOk: g.exOk, teachersEx: g.tEx.size, qF: g.qF, qScore: g.qA ? (100 * g.qC) / g.qA : null };
    });
  }

  function sectorKids(data, area, b) {
    const rows = (data.quiz_sectors || {})[area];
    if (!b || !rows) return null;
    const o = { L: 0, V: 0 };
    for (const r of rows) if (r[0] === b.type && r[1] === b.key && (r[2] === 'L' || r[2] === 'V')) o[r[2]] += r[3];
    return o;
  }

  // Lesson-plan analytics for a period and filter, from data.lpd (lessons, gen [teacher, day, hour, lesson, plans],
  // taught [teacher, day, lesson, times]): by subject, grade, weekday, hour and lesson.
  const SUBJECT = {
    urdu: 'Urdu', english: 'English', math: 'Mathematics', maths: 'Mathematics', general_science: 'General science', islamiat: 'Islamiat',
    general_knowledge: 'General knowledge (English)', general_knowledge_en: 'General knowledge (English)', general_knowledge_ur: 'General knowledge (Urdu)',
    social_studies_en: 'Social studies (English)', social_studies_ur: 'Social studies (Urdu)', social_studies: 'Social studies (Urdu)', '': 'Typed topic (no subject)',
  };
  const subjectName = (code) => SUBJECT[code] || code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  function lessonStats(P, opts) {
    const { data } = P;
    const d = data.lpd;
    if (!d) return null;
    const from = Math.max(opts.from, 0), to = Math.min(opts.to, data.today);
    const ok = (ti, day) => {
      if (day < from || day > to) return false;
      const T = data.teachers[ti], S = data.schools[T.s];
      if (opts.sector && S.sector !== opts.sector) return false;
      if (opts.school !== undefined && opts.school !== null && opts.school !== '' && T.s !== +opts.school) return false;
      return true;
    };
    const weekday = (day) => (new Date(Date.parse(data.window_start) + day * DAY).getUTCDay() + 6) % 7;   // 0 Monday
    const subj = new Map(), grade = new Map(), lesson = new Map();
    const wd = new Array(7).fill(0), wdDays = new Array(7).fill(0), hrs = new Array(24).fill(0);
    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (let day = from; day <= to; day++) wdDays[weekday(day)]++;
    const bump = (m, k) => { if (!m.has(k)) m.set(k, { key: k, gen: 0, taught: 0, tg: new Set(), tt: new Set() }); return m.get(k); };
    let genTotal = 0, taughtTotal = 0;
    const genTeachers = new Set();
    for (const [ti, day, hr, li, n] of d.gen) {
      if (!ok(ti, day)) continue;
      const L = d.lessons[li];
      genTotal += n; genTeachers.add(ti);
      const w = weekday(day);
      wd[w] += n; hrs[hr] += n; heat[w][hr] += n;
      for (const g of [bump(subj, subjectName(L.subject)), bump(grade, L.grade ? `Grade ${L.grade}` : 'No grade'), bump(lesson, li)]) { g.gen += n; g.tg.add(ti); }
    }
    for (const [ti, day, li, n] of d.taught) {
      if (!ok(ti, day)) continue;
      const L = d.lessons[li];
      taughtTotal += n;
      for (const g of [bump(subj, subjectName(L.subject)), bump(grade, L.grade ? `Grade ${L.grade}` : 'No grade'), bump(lesson, li)]) { g.taught += n; g.tt.add(ti); }
    }
    const flat = (m) => [...m.values()].map((g) => ({ key: g.key, gen: g.gen, taught: g.taught, teachersGen: g.tg.size, teachersTaught: g.tt.size }));
    const lessons = flat(lesson).map((g) => Object.assign(g, { lesson: d.lessons[g.key], subject: subjectName(d.lessons[g.key].subject) }));
    return { genTotal, taughtTotal, teachers: genTeachers.size, subjects: flat(subj), grades: flat(grade), lessons, wd, wdDays, hrs, heat };
  }

  // Children's quiz scores by quiz grade x subject for a period and filter. Score = correct / answered, pooled.
  const QSUBJECT = { maths: 'Mathematics', math: 'Mathematics', english: 'English', urdu: 'Urdu', science: 'Science', sst: 'Social studies',
    genk: 'General knowledge', islamiat: 'Islamiat', islamiyat: 'Islamiat' };
  const quizSubject = (s) => QSUBJECT[s] || 'Other';
  const quizGrade = (g) => { if (!g) return 'No grade'; const m = g.match(/^(\d+)\s*-\s*(\d+)$/); return m ? `Grades ${m[1]}–${m[2]} (exact grade not recorded)` : /^\d+$/.test(g) ? `Grade ${g}` : g; };
  function quizGrid(P, opts) {
    const { data } = P;
    if (!data.qscore) return null;
    const from = Math.max(opts.from, 0), to = Math.min(opts.to, data.today);
    const cells = new Map(), rows = new Map(), cols = new Map();
    const all = { f: 0, c: 0, a: 0, m: 0, d: 0, n: 0 };
    const add = (o, r) => { o.f += r[4]; o.c += r[5]; o.a += r[6]; o.m += r[7]; o.d += r[8]; o.n += r[9]; };
    const get = (m, k) => { if (!m.has(k)) m.set(k, { f: 0, c: 0, a: 0, m: 0, d: 0, n: 0 }); return m.get(k); };
    for (const r of data.qscore) {
      if (r[1] < from || r[1] > to) continue;
      const T = data.teachers[r[0]], S = data.schools[T.s];
      if (opts.sector && S.sector !== opts.sector) continue;
      if (opts.school !== undefined && opts.school !== null && opts.school !== '' && T.s !== +opts.school) continue;
      const g = quizGrade(r[2]), s = quizSubject(r[3]);
      add(get(cells, `${g}|${s}`), r); add(get(rows, g), r); add(get(cols, s), r); add(all, r);
    }
    // a range sits after the last grade it covers: Grade 1, Grade 2, Grades 1–2, Grade 3 ...
    const order = (g) => { const m = g.match(/(\d+)(?:–(\d+))?/); return m ? (m[2] ? +m[2] * 10 + 5 : +m[1] * 10) : 999; };
    return { cells, rows, cols, all, grades: [...rows.keys()].sort((a, b) => order(a) - order(b)), subjects: [...cols.keys()].sort((a, b) => cols.get(b).f - cols.get(a).f) };
  }

  return { quizGrid, lessonStats, subjectName, dayToDate, dateToDay, mondayOf, monthKey, childBucket, prepare, rollup, series, asGroup, pct, SECTIONS, SECTION_LABEL, MODULES, blankFico };
}));
