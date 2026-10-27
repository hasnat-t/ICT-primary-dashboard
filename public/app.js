// ICT Primary Teachers dashboard page. Loads /api/data once, then every view is computed in the browser by
// calc.js for the chosen period (preset or custom dates), sector and school.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-US');
  const N = (v) => (v === null || v === undefined ? '—' : nf.format(Math.round(v)));
  const P1 = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : `${v.toFixed(1)}%`);
  const ratio = (a, b) => (b ? (100 * a) / b : null);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const S = { data: null, P: null, tab: 'overview', preset: 'all', from: 0, to: 0, gran: 'week', sector: '', school: '', search: '', missing: '', sort: {} };

  const TABS = [
    ['overview', 'Overview'], ['lp', 'Lesson plans'], ['dc', 'DC observations'], ['hitl', 'HITL observations'], ['fico', 'FICO scores'],
    ['quiz', 'Quizzes'], ['exams', 'Exam generator'], ['training', 'Training'], ['schools', 'All schools'], ['teachers', 'Teachers'], ['trends', 'Analytics'],
  ];

  // ---------- dates ----------
  const iso = (d) => Calc.dayToDate(S.data.window_start, d);
  const nice = (d) => { const x = iso(d); return `${+x.slice(8)} ${MONTHS[+x.slice(5, 7) - 1]}`; };
  const niceY = (d) => `${nice(d)} ${iso(d).slice(0, 4)}`;
  function presets() {
    const T = S.data.today, st = S.data.window_start;
    const mon = Calc.mondayOf(st, T);
    const mStart = (d) => Calc.dateToDay(st, `${iso(d).slice(0, 8)}01`);
    const thisM = mStart(T), lastM = mStart(thisM - 1);
    return [
      ['today', 'Today', T, T], ['yesterday', 'Yesterday', T - 1, T - 1],
      ['week', 'This week', mon, T], ['lastweek', 'Last week', mon - 7, mon - 1],
      ['month', 'This month', thisM, T], ['lastmonth', 'Last month', Math.max(lastM, 0), thisM - 1],
      ['30', 'Last 30 days', Math.max(T - 29, 0), T], ['all', 'Since 1 Aug', 0, T], ['custom', 'Custom…', null, null],
    ];
  }
  function setPreset(id) {
    S.preset = id;
    const p = presets().find((x) => x[0] === id);
    if (p && p[2] !== null) { S.from = Math.max(p[2], 0); S.to = p[3]; }
    render();
  }
  const periodText = () => (S.from === S.to ? niceY(S.from) : `${nice(S.from)} – ${niceY(S.to)}`);
  const bucketLabel = (g) => (S.gran === 'day' ? nice(g.from) : S.gran === 'week' ? `w/c ${nice(g.from)}` : `${MONTHS[+iso(g.from).slice(5, 7) - 1]} ${iso(g.from).slice(2, 4)}`);

  // ---------- state in the URL ----------
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (TABS.some((t) => t[0] === h.get('tab'))) S.tab = h.get('tab');
    if (['day', 'week', 'month'].includes(h.get('gran'))) S.gran = h.get('gran');
    if (h.get('sector')) S.sector = h.get('sector');
    if (h.get('school')) S.school = h.get('school');
    if (h.get('p')) S.preset = h.get('p');
    if (S.preset === 'custom' && h.get('from') && h.get('to')) {
      S.from = Calc.dateToDay(S.data.window_start, h.get('from')); S.to = Calc.dateToDay(S.data.window_start, h.get('to'));
    }
  }
  function writeHash() {
    const h = new URLSearchParams({ tab: S.tab, p: S.preset, gran: S.gran });
    if (S.preset === 'custom') { h.set('from', iso(S.from)); h.set('to', iso(S.to)); }
    if (S.sector) h.set('sector', S.sector);
    if (S.school !== '') h.set('school', S.school);
    try { history.replaceState(null, '', `#${h}`); } catch { /* ignore */ }
  }

  // ---------- small renderers ----------
  function card(id, title, note, body, extra = '') {
    return `<section class="card" id="${id}"><div class="card-h"><h2>${esc(title)}</h2><button class="dl" data-dl="${id}" title="Save this section as a PNG">Download image</button></div>${note ? `<p class="note">${note}</p>` : ''}${extra}${body}</section>`;
  }
  const kpiP = (k, p, s = '', cls = '') => kpi(k, P1(p), s, `${cls} kb ${band(p)}`);
  const kpi = (k, v, s = '', cls = '') => `<div class="kpi ${cls}"><span class="k">${esc(k)}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  // Performance bands, the same as the STEPS dashboard's levels, for every percentage on the page.
  const BANDS = [[80, 'b4', 'Exemplary', '80% and above'], [70, 'b3', 'Proficient', '70–79.9%'], [60, 'b2', 'Developing', '60–69.9%'], [-Infinity, 'b1', 'Needs support', 'below 60%']];
  const band = (p) => (p === null || p === undefined || !isFinite(p) ? '' : BANDS.find((b) => p >= b[0])[1]);
  const bandName = (p) => { const c = band(p); const b = BANDS.find((x) => x[1] === c); return b ? b[2] : ''; };
  const sc = (p, extra = '') => (p === null || p === undefined || !isFinite(p) ? '<span class="dim">—</span>' : `<span class="sc ${band(p)}" title="${bandName(p)}">${P1(p)}</span>${extra}`);
  const legend = () => `<div class="legend bands">${BANDS.map((b) => `<span><i class="${b[1]}"></i>${b[2]} <span class="dim">${b[3]}</span></span>`).join('')}<span><i class="zero"></i>None in this period</span></div>`;
  const cov = (p) => (p === null ? '<span class="dim">—</span>' : `<span class="cov">${sc(p)}<span class="b"><span class="${band(p)}" style="width:${Math.min(100, Math.max(0, p))}%"></span></span></span>`);
  // A teacher's own count: zero is highlighted, since it is the thing to follow up.
  const cnt = (r, v) => (r.t && !v ? '<span class="zero">0</span>' : N(v));
  const kidsNote = () => (S.data && Calc.childBucket(S.data.window_start, S.data.today, S.from, S.to) ? ''
    : ' <b>Children</b> (distinct) are shown only for a single day, a whole week, a whole month or the full period, because a child who sits quizzes on several days must be counted once — pick one of those to see them. Sittings are shown for any period.');

  // ---------- tables ----------
  // cols: {k, label, src?, num?, val(row) -> sortable value, fmt?(row) -> html, levels?: ['sector','school','teacher']}
  function table(id, cols, rows, opt = {}) {
    const level = opt.level;
    cols = cols.filter((c) => !c.levels || c.levels.includes(level));
    const sort = S.sort[id] || opt.sort || { k: cols[0].k, dir: 1 };
    const c0 = cols.find((c) => c.k === sort.k) || cols[0];
    const sorted = rows.slice().sort((a, b) => {
      const x = c0.val(a), y = c0.val(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
    });
    const head = cols.map((c) => `<th class="${c.num ? 'n' : ''} ${c.src ? `col-${c.src}` : ''}" ${c.title ? `title="${esc(c.title)}"` : ''}><button data-sort="${id}:${c.k}">${esc(c.label)}${sort.k === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}${c.src ? `<span class="src">${c.src === 'dc' ? 'DC' : 'HITL'}</span>` : ''}</button></th>`).join('');
    const body = sorted.map((r) => `<tr class="${opt.onRow ? 'click' : ''}" ${opt.onRow ? `tabindex="0" data-row="${id}:${opt.rowKey(r)}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'n' : ''} ${c.k === 'name' ? 'name' : ''}">${c.fmt ? c.fmt(r) : esc(c.val(r))}</td>`).join('')}</tr>`).join('');
    const foot = opt.foot ? `<tfoot><tr>${cols.map((c, i) => `<td class="${c.num ? 'n' : ''}">${i === 0 ? esc(opt.footLabel || 'Total') : c.fmt ? c.fmt(opt.foot) : esc(c.val(opt.foot))}</td>`).join('')}</tr></tfoot>` : '';
    rowHandlers[id] = opt.onRow;
    return `${opt.noLegend ? '' : legend()}<div class="scroll"><table class="t" id="tbl-${id}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="empty">Nothing to show for this selection.</td></tr>`}</tbody>${foot}</table></div>`;
  }
  const rowHandlers = {};

  // The rows one level below the current selection: sectors, then a sector's schools, then a school's teachers.
  function levelRows(R) {
    if (S.school !== '') return { level: 'teacher', rows: R.teachers.map((t) => Object.assign(Calc.asGroup(t), { t, name: t.name, key: t.i })), what: 'teachers' };
    if (S.sector) return { level: 'school', rows: [...R.schools.values()].map((g) => Object.assign(g, { name: S.data.schools[g.s].name, emis: S.data.schools[g.s].emis, key: g.s })), what: 'schools' };
    return { level: 'sector', rows: [...R.sectors.entries()].map(([n, g]) => Object.assign(g, { name: n, key: n })), what: 'sectors' };
  }
  function drill(level, key) {
    if (level === 'sector') { S.sector = key; S.school = ''; render(); }
    else if (level === 'school') { S.school = String(key); render(); }
    else openTeacher(+key);
  }
  const nameCol = (level) => ({ k: 'name', label: level === 'sector' ? 'Sector' : level === 'school' ? 'School' : 'Teacher',
    val: (r) => r.name, fmt: (r) => `${esc(r.name)}${r.emis ? ` <span class="dim">EMIS ${esc(r.emis)}</span>` : ''}${r.t && r.t.lv.length > 1 ? ' <span class="dim">(also middle/high)</span>' : ''}` });
  const yn = (b) => (b ? '<span class="yes">Yes</span>' : '<span class="zero">No</span>');
  const fpct = (f) => Calc.pct(f);

  // ---------- column sets ----------
  const COL = {
    schools: { k: 'schools', label: 'Schools', num: true, levels: ['sector'], val: (r) => r.schools, fmt: (r) => N(r.schools) },
    teachers: { k: 'teachers', label: 'Primary teachers', num: true, levels: ['sector', 'school'], val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
    g15: { k: 'g15', label: 'Got a grade 1–5 plan', num: true, title: 'Teachers who got a grade 1–5 lesson plan on WhatsApp or read one in the teacher app in the period', val: (r) => r.g15, fmt: (r) => (r.t ? yn(r.g15) : N(r.g15)) },
    usage: { k: 'usage', label: 'LP usage %', num: true, levels: ['sector', 'school'], title: 'Teachers who got a grade 1–5 plan ÷ primary teachers', val: (r) => ratio(r.g15, r.teachers), fmt: (r) => cov(ratio(r.g15, r.teachers)) },
    plans: { k: 'plans', label: 'Plans received', num: true, title: 'Grade 1–5 lesson plans handed to teachers (lesson_plans rows; app reads before 13 Oct 19:09 are not rows)', val: (r) => r.plans, fmt: (r) => N(r.plans) },
    taught: { k: 'taught', label: 'Plans taught', num: true, title: "Feedback answers 'taught' (lp_feedback.used_in_class), grade 1–5 plans — the teacher's own word", val: (r) => r.taught, fmt: (r) => cnt(r, r.taught) },
    answered: { k: 'answered', label: "Answered 'taught?'", num: true, title: 'Feedback responses that answered whether the plan was used in class', val: (r) => r.answered, fmt: (r) => N(r.answered) },
    tTaught: { k: 'tTaught', label: 'Teachers who taught one', num: true, levels: ['sector', 'school'], val: (r) => r.teachersTaught, fmt: (r) => N(r.teachersTaught) },
    dc: { k: 'dc', label: 'Lessons recorded', src: 'dc', num: true, title: 'Digital Coach self-recordings whose scores came back', val: (r) => r.dc, fmt: (r) => cnt(r, r.dc) },
    dcT: { k: 'dcT', label: 'Teachers recorded', src: 'dc', num: true, levels: ['sector', 'school'], val: (r) => r.dcT, fmt: (r) => N(r.dcT) },
    dcPct: { k: 'dcPct', label: '% of teachers', src: 'dc', num: true, levels: ['sector', 'school'], val: (r) => ratio(r.dcT, r.teachers), fmt: (r) => cov(ratio(r.dcT, r.teachers)) },
    hitl: { k: 'hitl', label: 'Visits held', src: 'hitl', num: true, title: 'HITL coach visits conducted (scored; not cancelled, abandoned, failed or test)', val: (r) => r.hitl, fmt: (r) => cnt(r, r.hitl) },
    hitlT: { k: 'hitlT', label: 'Teachers visited', src: 'hitl', num: true, levels: ['sector', 'school'], val: (r) => r.hitlT, fmt: (r) => N(r.hitlT) },
    hitlPct: { k: 'hitlPct', label: '% visited', src: 'hitl', num: true, levels: ['sector', 'school'], val: (r) => ratio(r.hitlT, r.teachers), fmt: (r) => cov(ratio(r.hitlT, r.teachers)) },
    hitlC: { k: 'hitlC', label: 'Debriefed', src: 'hitl', num: true, title: 'Complete: the teacher got the debrief', val: (r) => r.hitlC, fmt: (r) => N(r.hitlC) },
    hitlP: { k: 'hitlP', label: 'Debrief pending', src: 'hitl', num: true, title: 'Reviewed by the coach, debrief not yet sent', val: (r) => r.hitlP, fmt: (r) => N(r.hitlP) },
    hitlA: { k: 'hitlA', label: 'Awaiting review', src: 'hitl', num: true, val: (r) => r.hitlA, fmt: (r) => N(r.hitlA) },
    made: { k: 'made', label: 'Quizzes made', num: true, title: "Lesson quizzes the bot wrote from the teacher's recorded lesson or lesson plan and sent when she said yes", val: (r) => r.made, fmt: (r) => cnt(r, r.made) },
    madeT: { k: 'madeT', label: 'Teachers who made one', num: true, levels: ['sector', 'school'], val: (r) => r.madeT, fmt: (r) => N(r.madeT) },
    kidsL: { k: 'kidsL', label: 'Children (lesson quizzes)', num: true, title: 'Distinct children who sat a lesson quiz through the teacher’s share link', val: (r) => r.kidsL, fmt: (r) => N(r.kidsL) },
    sitL: { k: 'sitL', label: 'Sittings', num: true, title: 'Lesson-quiz sittings by children', val: (r) => r.sitL, fmt: (r) => N(r.sitL) },
    finL: { k: 'finL', label: 'Finished', num: true, val: (r) => r.finL, fmt: (r) => N(r.finL) },
    kidsV: { k: 'kidsV', label: 'Children (video quizzes)', num: true, val: (r) => r.kidsV, fmt: (r) => N(r.kidsV) },
    sitV: { k: 'sitV', label: 'Video sittings', num: true, val: (r) => r.sitV, fmt: (r) => N(r.sitV) },
    exOk: { k: 'exOk', label: 'Papers delivered', num: true, title: 'Exam papers the /assessment generator produced for the teacher (root paper ready)', val: (r) => r.exOk, fmt: (r) => cnt(r, r.exOk) },
    exReq: { k: 'exReq', label: 'Papers requested', num: true, val: (r) => r.exReq, fmt: (r) => N(r.exReq) },
    exT: { k: 'exT', label: 'Teachers with a paper', num: true, levels: ['sector', 'school'], val: (r) => r.exT, fmt: (r) => N(r.exT) },
    exPct: { k: 'exPct', label: '% of teachers', num: true, levels: ['sector', 'school'], title: 'Teachers who got at least one exam paper ÷ primary teachers', val: (r) => ratio(r.exT, r.teachers), fmt: (r) => cov(ratio(r.exT, r.teachers)) },
    exFail: { k: 'exFail', label: 'Failed', num: true, title: 'The generator failed; the teacher was told and can ask again', val: (r) => r.exFail, fmt: (r) => N(r.exFail) },
    exStuck: { k: 'exStuck', label: 'Never finished', num: true, title: 'Still generating more than an hour after the request', val: (r) => r.exStuck, fmt: (r) => N(r.exStuck) },
    exEdit: { k: 'exEdit', label: 'Edited by teacher', num: true, title: 'Papers the teacher edited afterwards (removed questions, changed marks or wording)', val: (r) => r.exEdit, fmt: (r) => N(r.exEdit) },
    onProg: { k: 'onProg', label: 'On NIETE primary', num: true, title: 'Active niete_primary training assignment', val: (r) => r.onProg, fmt: (r) => (r.t ? yn(r.onProg) : N(r.onProg)) },
    didMod: { k: 'didMod', label: 'Did a module', num: true, levels: ['sector', 'school'], val: (r) => r.didModule, fmt: (r) => N(r.didModule) },
    mods: { k: 'mods', label: 'Modules finished', num: true, title: 'NIETE modules finished, levels 1–4 (171 in all)', val: (r) => (r.t ? r.mods : r.teachers ? r.mods / r.teachers : null), fmt: (r) => (r.t ? `${N(r.mods)} <span class="dim">of 171</span>` : `${r.teachers ? (r.mods / r.teachers).toFixed(1) : '—'} <span class="dim">avg</span>`) },
  };
  for (let l = 1; l <= 4; l++) {
    COL[`cert${l}`] = { k: `cert${l}`, label: `Level ${l} certificate`, num: true, title: `Holds the NIETE level ${l} certificate (passed the level's grand quiz)`,
      val: (r) => r.cert[l - 1], fmt: (r) => (r.t ? yn(r.cert[l - 1]) : `${N(r.cert[l - 1])} ${sc(ratio(r.cert[l - 1], r.teachers))}`) };
  }
  function ficoCols() {
    const out = [];
    for (const s of Calc.SECTIONS) {
      for (const src of ['dc', 'hitl']) {
        const f = (r) => (src === 'dc' ? r.ficoD : r.ficoH)[s];
        out.push({ k: `${src}-${s}`, label: Calc.SECTION_LABEL[s], src, num: true, title: `${Calc.SECTION_LABEL[s]} — score ÷ maximum, pooled over sessions`,
          val: (r) => fpct(f(r)), fmt: (r) => (f(r)[2] ? sc(fpct(f(r)), ` <span class="dim">n=${N(f(r)[2])}</span>`) : '<span class="dim">—</span>') });
      }
    }
    return out;
  }

  // ---------- trend charts ----------
  // items: [{label, values: [..]}], series: [{name, color}], kind 'bar' | 'line'
  function chart(items, series, kind = 'bar', fmt = N) {
    if (!items.length) return '<p class="empty">No data in this period.</p>';
    const W = 760, H = 220, L = 44, B = 34, T = 10;
    const vals = items.flatMap((i) => i.values).filter((v) => v !== null && v !== undefined);
    let max = Math.max(1, ...vals);
    if (kind === 'line') max = Math.min(100, Math.ceil(max / 10) * 10 || 100);
    const step = (W - L) / items.length;
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let svg = '';
    for (let i = 0; i <= 4; i++) { const v = (max * i) / 4; svg += `<line class="gl" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${kind === 'line' ? `${Math.round(v)}%` : N(v)}</text>`; }
    const every = Math.ceil(items.length / 12);
    items.forEach((it, i) => { if (i % every === 0) svg += `<text x="${L + step * i + step / 2}" y="${H - 12}" text-anchor="middle">${esc(it.label)}</text>`; });
    if (kind === 'bar') {
      const bw = Math.max(2, (step * 0.8) / series.length);
      items.forEach((it, i) => it.values.forEach((v, j) => {
        if (!v) return;
        svg += `<rect x="${L + step * i + step * 0.1 + bw * j}" y="${y(v)}" width="${bw - 1}" height="${H - B - y(v)}" rx="2" fill="${series[j].color}" data-tip="${esc(`${it.label} · ${series[j].name}: ${fmt(v)}`)}"/>`;
      }));
    } else {
      series.forEach((s, j) => {
        const pts = items.map((it, i) => (it.values[j] === null || it.values[j] === undefined ? null : [L + step * i + step / 2, y(it.values[j]), it]));
        let d = '';
        pts.forEach((p, i) => { if (p) d += `${d && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; });
        svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
        pts.forEach((p) => { if (p) svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${s.color}" data-tip="${esc(`${p[2].label} · ${s.name}: ${P1(p[2].values[j])}`)}"/>`; });
      });
    }
    const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `${legend}<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${svg}</svg></div>`;
  }
  const GREEN = '#47BA7D', NAVY = '#333847', GREY = '#8A90A2', SOFT = '#8FD3AE';
  const granSeg = () => `<div class="seg" role="group" aria-label="Group by">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => `<button data-gran="${k}" aria-pressed="${S.gran === k}">${l}</button>`).join('')}</div>`;
  function seriesNow() { return Calc.series(S.P, sel(), S.gran); }
  const sel = () => ({ from: S.from, to: S.to, sector: S.sector, school: S.school });

  // ---------- views ----------
  function scopeName() {
    if (S.school !== '') { const s = S.data.schools[+S.school]; return `${s.name} (${s.sector})`; }
    return S.sector || 'All ICT';
  }
  function crumbs() {
    const parts = [`<button data-crumb="all">All ICT</button>`];
    if (S.sector) parts.push(S.school !== '' ? `<button data-crumb="sector">${esc(S.sector)}</button>` : `<b>${esc(S.sector)}</b>`);
    if (S.school !== '') parts.push(`<b>${esc(S.data.schools[+S.school].name)}</b>`);
    return `<div class="crumbs">${parts.join(' › ')}</div>`;
  }

  function viewOverview(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const k = `<div class="kpis">
      ${kpi('Primary teachers', N(a.teachers), `${N(a.schools)} schools`)}
      ${kpiP('LP usage', ratio(a.g15, a.teachers), `${N(a.g15)} got a grade 1–5 plan`)}
      ${kpi('Plans taught', N(a.taught), `${N(a.teachersTaught)} teachers said so`)}
      ${kpi('DC observations', N(a.dc), `${N(a.dcT)} teachers recorded`, 'src-dc')}
      ${kpi('HITL observations', N(a.hitl), `${N(a.hitlT)} teachers observed`, 'src-hitl')}
      ${kpi('Quizzes made', N(a.made), `${N(a.madeT)} teachers`)}
      ${kpi('Children quizzed', N(a.kidsL), `${N(a.sitL)} lesson-quiz sittings`)}
      ${kpi('Exam generator', N(a.exOk), `papers · ${N(a.exT)} teachers got one`)}
      ${kpi('On NIETE primary training', N(a.onProg), `${N(a.cert[0])} hold level 1 · all time`)}
    </div>`;
    const cols = [nameCol(level), COL.schools, COL.teachers, COL.usage, COL.taught, COL.dc, COL.dcPct, COL.hitl, COL.hitlPct, COL.made, COL.kidsL, COL.exOk, COL.exPct, COL.onProg, COL.cert1];
    return card('c-over', `${scopeName()} · ${periodText()}`, `Everything below counts primary teachers only.${kidsNote()} Training is all-time.`, k)
      + card('c-over-t', `By ${level}`, `Click a row to drill down (sector → school → teacher).`,
        table('over', cols, rows, { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a, footLabel: 'Total' }));
  }

  function viewLp(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-lp', `Lesson plans · ${scopeName()} · ${periodText()}`,
      'Got a plan = a grade 1–5 plan sent on WhatsApp or read in the teacher app. LP usage % = primary teachers who got one ÷ primary teachers. <b>Taught</b> is the teacher\'s own answer in plan feedback, asked only after a thumbs-up with a voice note, so read it as "N of the M who answered".',
      `<div class="kpis">${kpiP('LP usage', ratio(a.g15, a.teachers), `${N(a.g15)} of ${N(a.teachers)} teachers`)}
        ${kpi('Plans received', N(a.plans), 'grade 1–5')}${kpi('Plans taught', N(a.taught), `of ${N(a.answered)} answers`)}
        ${kpi('Teachers who taught one', N(a.teachersTaught))}${kpi('Any plan incl. grade 6–12', N(a.lpAny), 'teachers')}</div>`)
      + card('c-lp-trend', `Lesson plans over time`, '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.teachersWithPlan, g.taught] })),
        [{ name: 'Teachers who got a plan', color: GREEN }, { name: 'Plans taught', color: NAVY }]), granSeg())
      + card('c-lp-t', `By ${level}`, '', table('lp', [nameCol(level), COL.teachers, COL.g15, COL.usage, COL.plans, COL.taught, COL.answered, COL.tTaught], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewDc(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-dc', `DC observations · ${scopeName()} · ${periodText()}`, 'A teacher records her own lesson and the Digital Coach scores it. Counted when the scores came back. Never added to coach visits.',
      `<div class="kpis">${kpi('Lessons recorded', N(a.dc), '', 'src-dc')}${kpi('Teachers who recorded', N(a.dcT), `${P1(ratio(a.dcT, a.teachers))} of ${N(a.teachers)}`, 'src-dc')}
        ${kpi('Per recording teacher', a.dcT ? (a.dc / a.dcT).toFixed(1) : '—', 'lessons', 'src-dc')}${kpi('Never recorded', N(a.teachers - a.dcT), 'teachers in this period')}</div>`)
      + card('c-dc-trend', 'DC observations over time', '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.dc, g.teachersDc] })),
        [{ name: 'Lessons recorded', color: GREEN }, { name: 'Teachers who recorded', color: NAVY }]), granSeg())
      + card('c-dc-t', `By ${level}`, '', table('dc', [nameCol(level), COL.teachers, COL.dc, COL.dcT, COL.dcPct, ...ficoCols().filter((c) => c.src === 'dc')], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewHitl(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-hitl', `HITL observations · ${scopeName()} · ${periodText()}`, 'A coach observes the lesson in person. Held = conducted (scored, not cancelled, abandoned, failed or a test). Held = debriefed + debrief pending + awaiting review. <code>/observe2</code> visits use another rubric and are left out.',
      `<div class="kpis">${kpi('Visits held', N(a.hitl), '', 'src-hitl')}${kpi('Teachers visited', N(a.hitlT), `${P1(ratio(a.hitlT, a.teachers))} of ${N(a.teachers)}`, 'src-hitl')}
        ${kpi('Debriefed', N(a.hitlC), P1(ratio(a.hitlC, a.hitl)), 'src-hitl')}${kpi('Debrief pending', N(a.hitlP), '', 'src-hitl')}${kpi('Awaiting review', N(a.hitlA), '', 'src-hitl')}</div>
        <p class="note">${N(S.data.observe2_excluded || 0)} /observe2 visits (all time since 1 Aug, all schools shown) are not counted here.</p>`)
      + card('c-hitl-trend', 'HITL observations over time', '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.hitl, g.teachersHitl] })),
        [{ name: 'Visits held', color: NAVY }, { name: 'Teachers visited', color: GREY }]), granSeg())
      + card('c-hitl-t', `By ${level}`, '', table('hitl', [nameCol(level), COL.teachers, COL.hitl, COL.hitlT, COL.hitlPct, COL.hitlC, COL.hitlP, COL.hitlA, ...ficoCols().filter((c) => c.src === 'hitl')], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function ficoBlock(a) {
    const rowsH = Calc.SECTIONS.map((s) => {
      const d = a.ficoD[s], h = a.ficoH[s];
      return `<tr><td class="name">${esc(Calc.SECTION_LABEL[s])}</td><td class="n col-dc">${d[2] ? sc(fpct(d)) : '—'} <span class="dim">n=${N(d[2])}</span></td><td class="n col-hitl">${h[2] ? sc(fpct(h)) : '—'} <span class="dim">n=${N(h[2])}</span></td></tr>`;
    }).join('');
    return `${legend()}<div class="scroll"><table class="t"><thead><tr><th><button>Section</button></th><th class="n col-dc"><button>DC observations<span class="src">Digital Coach, self-recorded</span></button></th><th class="n col-hitl"><button>HITL observations<span class="src">coach visits</span></button></th></tr></thead><tbody>${rowsH}</tbody></table></div>`;
  }
  function viewFico(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    const odd = a.odd ? `<p class="note warn">${N(a.odd)} section scores on an unexpected scale were left out.</p>` : '';
    return card('c-fico', `FICO section scores · ${scopeName()} · ${periodText()}`,
      'Score ÷ maximum, pooled over sessions. Digital Coach and coach visits are never pooled. <b>Subject knowledge changed on 8 Sep (FICO v3)</b>: subject items now count only when they apply, so the two versions are shown separately and must not be compared. Lesson-plan fidelity counts only lessons with a plan attached. n = sessions.',
      ficoBlock(a) + odd)
      + card('c-fico-trend', 'Digital Coach section scores over time', 'Teaching practices, student engagement and lesson-plan fidelity, Digital Coach only.',
        chart(ser.map((g) => ({ label: bucketLabel(g), values: ['hlp', 'se', 'lpf'].map((s) => fpct(g.ficoD[s])) })),
          [{ name: 'Teaching practices', color: GREEN }, { name: 'Student engagement', color: NAVY }, { name: 'Lesson-plan fidelity', color: GREY }], 'line'), granSeg())
      + card('c-fico-t', `By ${level}`, 'Green edge = Digital Coach, grey edge = coach visits.', table('fico', [nameCol(level), COL.teachers, COL.dc, COL.hitl, ...ficoCols()], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewQuiz(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-quiz', `Quizzes · ${scopeName()} · ${periodText()}`,
      `Quizzes made = lesson quizzes written from the teacher's recorded lesson or plan and sent when she said yes. Children = distinct children who sat one through her share link (her own test runs are not children). Lesson and video quizzes are kept apart. Counts only — no child is ever listed.${kidsNote()} <b>Quiz scores</b> are not shown yet: there is no governed rule for them (request TKT-20261027-c75041).`,
      `<div class="kpis">${kpi('Quizzes made', N(a.made), `${N(a.madeT)} teachers`)}${kpi('Children (lesson quizzes)', N(a.kidsL), `${N(a.sitL)} sittings, ${N(a.finL)} finished`)}
        ${kpi('Children (video quizzes)', N(a.kidsV), `${N(a.sitV)} sittings`)}${kpi('Teachers whose children took one', N(a.quizT))}</div>`)
      + card('c-quiz-trend', 'Quizzes over time', S.gran === 'day' || S.gran === 'week' || S.gran === 'month' ? 'Children per bucket are distinct within that day, week or month.' : '',
        chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.made, g.kidsL] })), [{ name: 'Quizzes made', color: NAVY }, { name: 'Children (lesson quizzes)', color: GREEN }]), granSeg())
      + card('c-quiz-t', `By ${level}`, level === 'sector' ? 'A child quizzed by teachers in two sectors is counted in each sector but once in the total.' : '',
        table('quiz', [nameCol(level), COL.teachers, COL.made, COL.madeT, COL.kidsL, COL.sitL, COL.finL, COL.kidsV, COL.sitV], rows,
          { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewExams(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-ex', `Exam generator · ${scopeName()} · ${periodText()}`,
      'A teacher asks Rumi (<code>/assessment</code> on WhatsApp, or the portal) for an exam paper on a grade 1–5 textbook chapter and gets a printable paper with its answer key. Live since 5 Sep 2026. <b>Delivered</b> = the paper came out (on WhatsApp: stored and sent; in the portal: ready to download). Requested = delivered + failed + never finished. Nothing records whether the class sat the paper or how pupils scored.',
      `<div class="kpis">${kpi('Papers delivered', N(a.exOk), `of ${N(a.exReq)} requested`)}${kpiP('Teachers with a paper', ratio(a.exT, a.teachers), `${N(a.exT)} of ${N(a.teachers)} teachers`)}
        ${kpi('Per teacher with a paper', a.exT ? (a.exOk / a.exT).toFixed(1) : '—', 'papers')}${kpi('Failed', N(a.exFail), `${N(a.exStuck)} never finished`)}${kpi('Edited by teacher', N(a.exEdit), P1(ratio(a.exEdit, a.exOk)) + ' of delivered')}</div>`)
      + card('c-ex-trend', 'Exam generator over time', '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.exOk, g.teachersEx] })),
        [{ name: 'Papers delivered', color: NAVY }, { name: 'Teachers with a paper', color: GREEN }]), granSeg())
      + card('c-ex-t', `By ${level}`, '', table('ex', [nameCol(level), COL.teachers, COL.exOk, COL.exT, COL.exPct, COL.exReq, COL.exFail, COL.exStuck, COL.exEdit], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewTraining(R) {
    const a = R.all, { level, rows } = levelRows(R);
    return card('c-tr', `NIETE primary training · ${scopeName()} · all time`,
      'The <b>niete_primary</b> programme: NIETE levels 1–4, 171 modules. There is no training-status column — these steps are the status: on the programme → finished a module → holds a level certificate (each NIETE level ends with a grand quiz, pass mark 80%). All time; the period filter does not apply.',
      `<div class="kpis">${kpi('On NIETE primary', N(a.onProg), `of ${N(a.teachers)} primary teachers`)}${kpi('Finished a module', N(a.didModule), 'any NIETE level')}
        ${[1, 2, 3, 4].map((l) => kpi(`Level ${l} certificate`, N(a.cert[l - 1]), P1(ratio(a.cert[l - 1], a.teachers)), `kb ${band(ratio(a.cert[l - 1], a.teachers))}`)).join('')}</div>`)
      + card('c-tr-t', `By ${level}`, '', table('tr', [nameCol(level), COL.teachers, COL.onProg, COL.didMod, COL.mods, COL.cert1, COL.cert2, COL.cert3, COL.cert4], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewSchools(R) {
    const rows = [...R.schools.values()].map((g) => Object.assign(g, { name: S.data.schools[g.s].name, emis: S.data.schools[g.s].emis, sector: S.data.schools[g.s].sector, key: g.s }));
    const q = S.search.toLowerCase();
    const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.emis.includes(q));
    const cols = [nameCol('school'), { k: 'sector', label: 'Sector', val: (r) => r.sector }, COL.teachers, COL.usage, COL.taught, COL.dc, COL.dcPct,
      ...ficoCols().filter((c) => c.k === 'dc-hlp' || c.k === 'hitl-hlp'), COL.hitl, COL.hitlPct, COL.made, COL.kidsL, COL.exOk, COL.onProg, COL.cert1];
    return card('c-sch', `All schools · ${S.sector || 'All ICT'} · ${periodText()}`, `${N(shown.length)} schools with primary teachers. One complete row per school; click for its teachers.`,
      table('sch', cols, shown, { level: 'school', onRow: (k) => { S.school = String(k); S.sector = S.data.schools[+k].sector; S.tab = 'teachers'; render(); }, rowKey: (r) => r.key }),
      `<div class="row"><input class="inp" type="search" id="search" placeholder="Search school or EMIS" value="${esc(S.search)}"></div>`);
  }

  const MISSING = [
    ['', 'Everyone'], ['plan', 'No grade 1–5 plan'], ['taught', 'No plan taught'], ['dc', 'No Digital Coach lesson'], ['hitl', 'No coach visit'],
    ['quiz', 'No quiz made'], ['exam', 'No exam paper'], ['prog', 'Not on NIETE primary'], ['l1', 'No level 1 certificate'],
  ];
  function viewTeachers(R) {
    const q = S.search.toLowerCase();
    const miss = { plan: (t) => !t.g15, taught: (t) => !t.taught, dc: (t) => !t.dc, hitl: (t) => !t.hitl, quiz: (t) => !t.made, exam: (t) => !t.exOk, prog: (t) => !t.onProg, l1: (t) => !t.certs.includes('1') }[S.missing];
    const rows = R.teachers.filter((t) => (!q || t.name.toLowerCase().includes(q) || S.data.schools[t.s].name.toLowerCase().includes(q)) && (!miss || miss(t)))
      .map((t) => Object.assign(Calc.asGroup(t), { t, name: t.name, key: t.i, school: S.data.schools[t.s].name, sector: S.data.schools[t.s].sector }));
    const cols = [nameCol('teacher'), { k: 'school', label: 'School', val: (r) => r.school, fmt: (r) => `${esc(r.school)} <span class="dim">${esc(r.sector)}</span>` },
      COL.g15, COL.plans, COL.taught, COL.dc, ...ficoCols().filter((c) => c.k === 'dc-hlp' || c.k === 'dc-tsk3'), COL.hitl, COL.made, COL.kidsL, COL.exOk, COL.onProg, COL.mods, COL.cert1, COL.cert2];
    const tools = `<div class="row"><input class="inp" type="search" id="search" placeholder="Search teacher or school" value="${esc(S.search)}">
      <select class="sel" id="missing" aria-label="Show">${MISSING.map(([k, l]) => `<option value="${k}" ${S.missing === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    return card('c-tch', `Teachers · ${scopeName()} · ${periodText()}`, `${N(rows.length)} of ${N(R.teachers.length)} primary teachers. Click a teacher for the scorecard. Contains teacher names — internal use only.`,
      table('tch', cols, rows, { level: 'teacher', onRow: (k) => openTeacher(+k), rowKey: (r) => r.key }), tools);
  }

  function viewTrends() {
    const ser = seriesNow();
    const items = (f) => ser.map((g) => ({ label: bucketLabel(g), values: f(g) }));
    return `<div class="cards2">`
      + card('c-a1', 'Teachers who got a lesson plan', '', chart(items((g) => [g.teachersWithPlan]), [{ name: 'Teachers', color: GREEN }]), granSeg())
      + card('c-a2', 'Plans taught', 'Teachers\' own answers in plan feedback.', chart(items((g) => [g.taught]), [{ name: 'Plans taught', color: NAVY }]), granSeg())
      + card('c-a3', 'Classroom observations', 'DC and HITL observations side by side, never added.', chart(items((g) => [g.dc, g.hitl]), [{ name: 'DC observations', color: GREEN }, { name: 'HITL observations', color: NAVY }]), granSeg())
      + card('c-a4', 'Teaching practices score', 'FICO section C, score ÷ maximum.', chart(items((g) => [fpct(g.ficoD.hlp), fpct(g.ficoH.hlp)]), [{ name: 'DC observations', color: GREEN }, { name: 'HITL observations', color: NAVY }], 'line'), granSeg())
      + card('c-a5', 'Subject knowledge score', 'FICO v2 to 7 Sep and v3 from 8 Sep are different measures: two lines, never one.',
        chart(items((g) => [fpct(g.ficoD.tsk2), fpct(g.ficoD.tsk3), fpct(g.ficoH.tsk2), fpct(g.ficoH.tsk3)]),
          [{ name: 'DC v2', color: SOFT }, { name: 'DC v3', color: GREEN }, { name: 'HITL v2', color: GREY }, { name: 'HITL v3', color: NAVY }], 'line'), granSeg())
      + card('c-a7', 'Exam generator', 'Papers delivered by the exam generator, and the teachers who got one.', chart(items((g) => [g.exOk, g.teachersEx]), [{ name: 'Papers delivered', color: NAVY }, { name: 'Teachers with a paper', color: GREEN }]), granSeg())
      + card('c-a6', 'Quizzes', 'Children are distinct within each day, week or month.', chart(items((g) => [g.made, g.kidsL]), [{ name: 'Quizzes made', color: NAVY }, { name: 'Children (lesson quizzes)', color: GREEN }]), granSeg())
      + `</div>`;
  }

  // ---------- teacher scorecard ----------
  function openTeacher(ti) {
    const T = S.data.teachers[ti], sc = S.data.schools[T.s];
    const R = Calc.rollup(S.P, { from: S.from, to: S.to, school: T.s });
    const t = R.teachers.find((x) => x.i === ti);
    const g = Calc.asGroup(t);
    const ser = Calc.series(S.P, { from: S.from, to: S.to, school: T.s }, S.gran);
    // per-teacher series from the raw rows
    const by = new Map(ser.map((b) => [b.key, { label: bucketLabel(b), plan: 0, dc: 0, hitl: 0 }]));
    const keyOf = (d) => (S.gran === 'day' ? d : S.gran === 'week' ? Math.max(Calc.mondayOf(S.data.window_start, d), 0) : Calc.monthKey(S.data.window_start, d));
    for (const r of S.P.lp[ti]) if (r[1] >= S.from && r[1] <= S.to && by.has(keyOf(r[1]))) by.get(keyOf(r[1])).plan += r[2] || r[3] ? 1 : 0;
    for (const r of S.P.obs[ti]) if (r[1] >= S.from && r[1] <= S.to && by.has(keyOf(r[1]))) by.get(keyOf(r[1]))[r[2] === 'D' ? 'dc' : 'hitl']++;
    $('#m-title').textContent = T.name;
    $('#m-sub').textContent = `${sc.name} · EMIS ${sc.emis} · ${sc.sector} · teaches ${T.lv.split('').map((c) => ({ P: 'primary', M: 'middle', H: 'high' }[c])).join(' + ')} · ${periodText()}`;
    $('#m-body').innerHTML = `<section class="card" id="c-tc"><div class="card-h"><h2>Scorecard</h2><button class="dl" data-dl="c-tc">Download image</button></div>
      <div class="kpis">${kpi('Days with a lesson plan', N(t.lpDays))}${kpi('Plans received', N(t.plans), 'grade 1–5')}${kpi('Plans taught', N(t.taught), `of ${N(t.answered)} answers`)}
      ${kpi('DC observations', N(t.dc), 'lessons recorded', 'src-dc')}${kpi('HITL observations', N(t.hitl), `${N(t.hitlC)} debriefed`, 'src-hitl')}
      ${kpi('Quizzes made', N(t.made))}${kpi('Exam generator', N(t.exOk), `papers · ${N(t.exReq)} requested`)}${kpi('Children (lesson quizzes)', N(t.kidsL), `${N(t.sitL)} sittings`)}
      ${kpi('NIETE training', t.onProg ? 'On programme' : 'Not assigned', `${N(g.mods)} of 171 modules · certificates: ${t.certs ? t.certs.split('').map((l) => `L${l}`).join(', ') : 'none'}`)}</div>
      <h2>FICO section scores</h2>${ficoBlock(g)}
      <h2>Activity over time</h2>${chart([...by.values()].map((b) => ({ label: b.label, values: [b.plan, b.dc, b.hitl] })),
        [{ name: S.gran === 'day' ? 'Got a plan' : 'Days with a plan', color: SOFT }, { name: 'DC observations', color: GREEN }, { name: 'HITL observations', color: NAVY }])}
      <p class="note">Contains teacher names — internal use only.${kidsNote()}</p></section>`;
    const m = $('#modal');
    if (!m.open) m.showModal();
  }

  // ---------- render ----------
  function render() {
    if (!S.data) return;
    writeHash();
    const pr = presets();
    $('#presets').innerHTML = pr.map(([k, l]) => `<button data-preset="${k}" aria-pressed="${S.preset === k}">${l}</button>`).join('');
    $('#custom').hidden = S.preset !== 'custom';
    $('#from').value = iso(S.from); $('#to').value = iso(S.to);
    $('#from').min = $('#to').min = iso(0); $('#from').max = $('#to').max = iso(S.data.today);
    const sectors = [...new Set(S.data.schools.map((s) => s.sector))].sort();
    $('#sector').innerHTML = `<option value="">All sectors</option>${sectors.map((s) => `<option ${S.sector === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}`;
    const schools = S.data.schools.map((s, i) => [i, s]).filter(([, s]) => !S.sector || s.sector === S.sector).sort((a, b) => a[1].name.localeCompare(b[1].name));
    $('#school').innerHTML = `<option value="">All schools</option>${schools.map(([i, s]) => `<option value="${i}" ${S.school === String(i) ? 'selected' : ''}>${esc(s.name)} (${esc(s.emis)})</option>`).join('')}`;
    $('#period').innerHTML = `Showing <b>${periodText()}</b>`;
    $('#tabs').innerHTML = TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('');
    const R = Calc.rollup(S.P, sel());
    const missing = Object.entries(S.P.parts).filter(([, ok]) => !ok).map(([k]) => k);
    const warn = missing.length ? `<p class="note warn">Some data could not be loaded in the last refresh (${missing.join(', ')}); those figures show as blank or zero.</p>` : '';
    const views = { overview: viewOverview, lp: viewLp, dc: viewDc, hitl: viewHitl, fico: viewFico, quiz: viewQuiz, exams: viewExams, training: viewTraining, schools: viewSchools, teachers: viewTeachers, trends: viewTrends };
    const focus = document.activeElement && document.activeElement.id === 'search' ? document.activeElement.selectionStart : null;
    $('#main').innerHTML = `<div class="grid">${crumbs()}${warn}${views[S.tab](R)}</div>`;
    if (focus !== null && $('#search')) { $('#search').focus(); $('#search').setSelectionRange(focus, focus); }
  }

  async function download(id) {
    const el = document.getElementById(id);
    if (!el || !window.htmlToImage) return;
    el.classList.add('snapping');
    try {
      const url = await htmlToImage.toPng(el, { backgroundColor: getComputedStyle(document.body).backgroundColor, pixelRatio: 2 });
      const a = document.createElement('a');
      const title = (el.querySelector('h2') || {}).textContent || 'section';
      a.download = `${title.replace(/[^A-Za-z0-9 –-]+/g, ' ').replace(/\s+/g, '-').slice(0, 80)}.png`;
      a.href = url; a.click();
    } finally { el.classList.remove('snapping'); }
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, tr.click');
    if (!b) return;
    if (b.dataset.preset) { if (b.dataset.preset === 'custom') { S.preset = 'custom'; render(); } else setPreset(b.dataset.preset); }
    else if (b.dataset.tab) { S.tab = b.dataset.tab; S.search = ''; render(); }
    else if (b.dataset.gran) { S.gran = b.dataset.gran; render(); }
    else if (b.dataset.dl) download(b.dataset.dl);
    else if (b.dataset.crumb) { if (b.dataset.crumb === 'all') S.sector = ''; S.school = ''; render(); }
    else if (b.dataset.sort) {
      const [id, k] = b.dataset.sort.split(':');
      const cur = S.sort[id];
      S.sort[id] = { k, dir: cur && cur.k === k ? -cur.dir : (k === 'name' || k === 'school' || k === 'sector' ? 1 : -1) };
      render();
    } else if (b.dataset.row) { const i = b.dataset.row.indexOf(':'); const h = rowHandlers[b.dataset.row.slice(0, i)]; if (h) h(b.dataset.row.slice(i + 1)); }
    else if (b.id === 'm-x') $('#modal').close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr.click')) e.target.click(); });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'sector') { S.sector = t.value; S.school = ''; render(); }
    else if (t.id === 'school') { S.school = t.value; if (t.value !== '') S.sector = S.data.schools[+t.value].sector; render(); }
    else if (t.id === 'missing') { S.missing = t.value; render(); }
    else if (t.id === 'from' || t.id === 'to') {
      let f = Calc.dateToDay(S.data.window_start, $('#from').value || iso(0)), to = Calc.dateToDay(S.data.window_start, $('#to').value || iso(S.data.today));
      f = Math.max(0, Math.min(f, S.data.today)); to = Math.max(0, Math.min(to, S.data.today));
      if (f > to) [f, to] = [to, f];
      S.from = f; S.to = to; S.preset = 'custom'; render();
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'search') { S.search = e.target.value; render(); } });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') e.target.close(); });
  // A pasted or edited link (replaceState in writeHash does not fire this).
  window.addEventListener('hashchange', () => {
    if (!S.data) return;
    readHash();
    if (S.preset !== 'custom') { const p = presets().find((x) => x[0] === S.preset); if (p) { S.from = Math.max(p[2], 0); S.to = p[3]; } }
    S.from = Math.max(0, Math.min(S.from, S.data.today)); S.to = Math.max(S.from, Math.min(S.to, S.data.today));
    render();
  });
  // chart tooltips
  document.addEventListener('mousemove', (e) => {
    const tip = document.getElementById('tip') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'tip', className: 'chart tip' });
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.textContent = t.getAttribute('data-tip');
    Object.assign(tip.style, { display: 'block', position: 'fixed', left: `${Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8)}px`, top: `${e.clientY + 12}px` });
  });

  // ---------- load ----------
  async function load() {
    try {
      const r = await fetch('/api/data', { cache: 'no-cache' });
      if (r.status === 503) { $('#main').innerHTML = '<div class="loading">The first refresh is still running; this page will fill in by itself in a few minutes.</div>'; setTimeout(load, 20000); return; }
      S.data = await r.json();
      S.P = Calc.prepare(S.data);
      S.from = 0; S.to = S.data.today;
      readHash();
      if (S.preset !== 'custom') { const p = presets().find((x) => x[0] === S.preset) || presets().find((x) => x[0] === 'all'); S.preset = p[0]; S.from = Math.max(p[2], 0); S.to = p[3]; }
      S.from = Math.max(0, Math.min(S.from, S.data.today)); S.to = Math.max(S.from, Math.min(S.to, S.data.today));
      const a = Calc.rollup(S.P, { from: 0, to: S.data.today }).all;
      $('#headline').innerHTML = `<b>${N(a.teachers)}</b> primary teachers in <b>${N(a.schools)}</b> schools across <b>${new Set(S.data.schools.map((s) => s.sector)).size}</b> ICT sectors. Data from 1 Aug 2026 to ${niceY(S.data.today)}; updated ${esc(S.data.as_of)}.`;
      $('#rule').textContent = S.data.rule_version || '';
      render();
      status();
    } catch (e) {
      console.error(e);
      $('#main').innerHTML = '<div class="loading">Could not load the data. Retrying…</div>';
      setTimeout(load, 15000);
    }
  }
  async function status() {
    try {
      const s = await (await fetch('/api/status', { cache: 'no-store' })).json();
      const el = $('#status');
      el.className = s.last_error ? 'warn' : '';
      el.textContent = s.last_error ? `Last refresh had a problem (${s.last_error.slice(0, 160)}); showing data from ${s.as_of}.` : `Refreshes automatically every day at ${(s.schedule_pkt || []).join(' and ')} PKT.`;
    } catch { /* ignore */ }
  }
  load();
})();
