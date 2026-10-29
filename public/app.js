// ICT Primary Dashboard page. Loads /api/data once, then every view is computed in the browser by
// calc.js for the chosen period (preset or custom dates), sector and school.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-US');
  const N = (v) => (v === null || v === undefined ? '—' : nf.format(Math.round(v)));
  const P1 = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : `${v.toFixed(1)}%`);
  const ratio = (a, b) => (b ? (100 * a) / b : null);
  // NIETE training levels in niete_primary (order_index 0-3), from the certificates' level_name_snapshot, 2026-10-27.
  const LEVELS = ['Level 0 · Aspiring Teacher', 'Level 1 · Emerging Practitioner', 'Level 2 · Skilled Practitioner', 'Level 3 · Teacher Leader'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const S = { data: null, P: null, tab: 'overview', preset: 'all', from: 0, to: 0, gran: 'week', sector: '', school: '', search: '', missing: '', sort: {}, mview: 'obs' };

  const NAV = [
    ['', [['overview', 'Overview']]],
    ['Teaching', [['lp', 'Lesson plans'], ['quiz', 'Quizzes'], ['exams', 'Exam generator']]],
    ['Observation', [['dc', 'DC observations'], ['hitl', 'HITL observations'], ['observe2', '/observe2 pilot'], ['fico', 'FICO scores']]],
    ['Children', [['egra', 'Learning assessment']]],
    ['Growth', [['training', 'Training']]],
    ['Directory', [['schools', 'All schools'], ['teachers', 'Teachers']]],
    ['Insights', [['spotlight', 'Leading & support'], ['trends', 'Analytics']]],
  ];
  const TABS = NAV.flatMap(([, items]) => items);

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
  const bucketLabel = (g) => (S.gran === 'day' ? nice(g.from) : S.gran === 'week' ? `w/c ${nice(g.from)}` : `${MONTHS[+iso(g.from).slice(5, 7) - 1]} ${iso(g.from).slice(0, 4)}`);

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
  const kpiP = (k, p, s = '', cls = '') => kpi(k, P1(p), `${s} · <b>${bandName(p) || '—'}</b>`, `${cls} kb ${band(p)}`);
  const kpi = (k, v, s = '', cls = '') => `<div class="kpi ${cls}"><span class="k">${esc(k)}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  // Performance bands, the same as the STEPS dashboard's levels, for every percentage on the page.
  const BANDS = [[80, 'b4', 'Exemplary', '80% and above'], [70, 'b3', 'Proficient', '70–79.9%'], [60, 'b2', 'Developing', '60–69.9%'], [-Infinity, 'b1', 'Needs support', 'below 60%']];
  const band = (p) => (p === null || p === undefined || !isFinite(p) ? '' : BANDS.find((b) => p >= b[0])[1]);
  const bandName = (p) => { const c = band(p); const b = BANDS.find((x) => x[1] === c); return b ? b[2] : ''; };
  const GLYPH = { b4: '✓', b3: '●', b2: '▲', b1: '!' };
  const sc = (p, extra = '') => (p === null || p === undefined || !isFinite(p) ? '<span class="dim">—</span>' : `<span class="sc ${band(p)}" title="${bandName(p)}"><i aria-hidden="true">${GLYPH[band(p)]}</i>${P1(p)}</span>${extra}`);
  const legend = () => `<div class="legend bands">${BANDS.map((b) => `<span><i class="${b[1]}">${GLYPH[b[1]]}</i><b>${b[2]}</b> <span class="dim">${b[3]}</span></span>`).join('')}<span><i class="zero"></i>None in this period</span></div>`;
  const cov = (p) => (p === null ? '<span class="dim">—</span>' : `<span class="cov">${sc(p)}<span class="b"><span class="${band(p)}" style="width:${Math.min(100, Math.max(0, p))}%"></span></span></span>`);
  // A teacher's own count: zero is highlighted, since it is the thing to follow up.
  const cnt = (r, v) => (r.t && !v ? '<span class="zero">0</span>' : N(v));
  const kidsNote = () => (S.data && Calc.childBucket(S.data.window_start, S.data.today, S.from, S.to) ? ''
    : ' <b>Children</b> (distinct) are shown only for a single day, a whole week, a whole month or the full period, because a child who sits quizzes on several days must be counted once — pick one of those to see them. Sittings are shown for any period.');

  // ---------- tables ----------
  // cols: {k, label, src?, num?, val(row) -> sortable value, fmt?(row) -> html, levels?: ['sector','school','teacher']}
  function table(id, cols, rows, opt = {}) {
    const level = opt.level;
    tableCols[id] = cols;
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
  const tableCols = {};

  // The rows one level below the current selection: sectors, then a sector's schools, then a school's teachers.
  function levelRows(R) {
    if (S.school !== '') return { level: 'teacher', rows: R.teachers.map((t) => Object.assign(Calc.asGroup(t), { t, name: t.name, key: t.i })), what: 'teachers' };
    if (S.sector) return { level: 'school', rows: [...R.schools.values()].map((g) => Object.assign(g, { name: S.data.schools[g.s].name, emis: S.data.schools[g.s].emis, key: g.s })), what: 'schools' };
    return { level: 'sector', rows: [...R.sectors.entries()].map(([n, g]) => Object.assign(g, { name: n, key: n })), what: 'sectors' };
  }
  function drill(level, key) {
    const cols = tableCols[S.lastTable];
    if (level === 'sector') modalOpen({ kind: 'sector', key, cols });
    else if (level === 'school') modalOpen({ kind: 'school', key: +key, cols });
    else modalOpen({ kind: 'teacher', key: +key });
  }
  const nameCol = (level) => ({ k: 'name', label: level === 'sector' ? 'Sector' : level === 'school' ? 'School' : 'Teacher',
    val: (r) => r.name, fmt: (r) => `${esc(r.name)}${r.emis ? ` <span class="dim">EMIS ${esc(r.emis)}</span>` : ''}${r.t && r.t.lv.length > 1 ? ' <span class="dim">(also middle/high)</span>' : ''}` });
  const yn = (b) => (b ? '<span class="yes">Yes</span>' : '<span class="zero">No</span>');
  const fpct = (f) => Calc.pct(f);

  // ---------- column sets ----------
  const COL = {
    schools: { k: 'schools', label: 'Schools', num: true, levels: ['sector'], val: (r) => r.schools, fmt: (r) => N(r.schools) },
    teachers: { k: 'teachers', label: 'Primary teachers', num: true, levels: ['sector', 'school'], val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
    g15: { k: 'g15', label: 'Used a grade 1–5 plan', num: true, title: 'Teachers who used a grade 1–5 lesson plan in the period: generated one with Rumi (WhatsApp or portal) or opened one in the teacher app', val: (r) => r.g15, fmt: (r) => (r.t ? yn(r.g15) : N(r.g15)) },
    usage: { k: 'usage', label: 'LP engagement %', num: true, levels: ['sector', 'school'], title: 'Teachers who used a grade 1–5 lesson plan (generated or opened in the teacher app) ÷ primary teachers', val: (r) => ratio(r.g15, r.teachers), fmt: (r) => cov(ratio(r.g15, r.teachers)) },
    opened: { k: 'opened', label: 'Plans opened in the app', num: true, title: 'Grade 1–5 lesson plans opened in the teacher app (reading a plan there counts as using lesson plans, but is not generating one)', val: (r) => r.opened, fmt: (r) => N(r.opened) },
    plans: { k: 'plans', label: 'Plans generated', num: true, title: 'Grade 1–5 lesson plans Rumi generated for the teacher (lesson_plans rows; plans opened only in the teacher app between 12 and 13 Oct are not rows)', val: (r) => r.plans, fmt: (r) => N(r.plans) },
    taught: { k: 'taught', label: 'Plans taught', num: true, title: 'Provisional: DC observations in which the teacher attached one of her recent Rumi lesson plans (the plan she generated was taught and recorded)', val: (r) => r.taught, fmt: (r) => cnt(r, r.taught) },
    tTaught: { k: 'tTaught', label: 'Teachers who taught one', num: true, levels: ['sector', 'school'], val: (r) => r.teachersTaught, fmt: (r) => N(r.teachersTaught) },
    dc: { k: 'dc', label: 'Lessons recorded', src: 'dc', num: true, title: 'Digital Coach self-recordings whose scores came back', val: (r) => r.dc, fmt: (r) => cnt(r, r.dc) },
    dcT: { k: 'dcT', label: 'Teachers recorded', src: 'dc', num: true, levels: ['sector', 'school'], val: (r) => r.dcT, fmt: (r) => N(r.dcT) },
    dcPct: { k: 'dcPct', label: '% of teachers', src: 'dc', num: true, levels: ['sector', 'school'], val: (r) => ratio(r.dcT, r.teachers), fmt: (r) => cov(ratio(r.dcT, r.teachers)) },
    hitl: { k: 'hitl', label: 'HITL observations', src: 'hitl', num: true, title: 'HITL coach visits conducted (scored; not cancelled, abandoned, failed or test)', val: (r) => r.hitl, fmt: (r) => cnt(r, r.hitl) },
    hitlT: { k: 'hitlT', label: 'Teachers observed', title: 'Different teachers with at least one HITL observation in the period (each counted once)', src: 'hitl', num: true, levels: ['sector', 'school'], val: (r) => r.hitlT, fmt: (r) => N(r.hitlT) },
    hitlPct: { k: 'hitlPct', label: '% observed', title: 'Teachers with at least one HITL observation ÷ primary teachers', src: 'hitl', num: true, levels: ['sector', 'school'], val: (r) => ratio(r.hitlT, r.teachers), fmt: (r) => cov(ratio(r.hitlT, r.teachers)) },
    hitlC: { k: 'hitlC', label: 'Debriefed', src: 'hitl', num: true, title: 'Complete: the teacher got the debrief', val: (r) => r.hitlC, fmt: (r) => N(r.hitlC) },
    hitlP: { k: 'hitlP', label: 'Debrief pending', src: 'hitl', num: true, title: 'Reviewed by the coach, debrief not yet sent', val: (r) => r.hitlP, fmt: (r) => N(r.hitlP) },
    hitlA: { k: 'hitlA', label: 'Awaiting review', src: 'hitl', num: true, val: (r) => r.hitlA, fmt: (r) => N(r.hitlA) },
    made: { k: 'made', label: 'Quizzes made', num: true, title: "Lesson quizzes the bot wrote from the teacher's recorded lesson or lesson plan and sent when she said yes", val: (r) => r.made, fmt: (r) => cnt(r, r.made) },
    madeT: { k: 'madeT', label: 'Teachers who made one', num: true, levels: ['sector', 'school'], val: (r) => r.madeT, fmt: (r) => N(r.madeT) },
    kidsL: { k: 'kidsL', label: 'Children (lesson quizzes)', num: true, title: 'Distinct children who sat a lesson quiz through the teacher’s share link', val: (r) => r.kidsL, fmt: (r) => N(r.kidsL) },
    sitL: { k: 'sitL', label: 'Quiz attempts', num: true, title: 'Times children opened and sat a lesson quiz through the teacher’s link; one child can attempt several quizzes', val: (r) => r.sitL, fmt: (r) => N(r.sitL) },
    finL: { k: 'finL', label: 'Finished', num: true, val: (r) => r.finL, fmt: (r) => N(r.finL) },
    kidsV: { k: 'kidsV', label: 'Children (video quizzes)', num: true, val: (r) => r.kidsV, fmt: (r) => N(r.kidsV) },
    sitV: { k: 'sitV', label: 'Video quiz attempts', num: true, val: (r) => r.sitV, fmt: (r) => N(r.sitV) },
    exOk: { k: 'exOk', label: 'Exams generated', num: true, title: 'Exam papers the /assessment generator produced for the teacher (root paper ready)', val: (r) => r.exOk, fmt: (r) => cnt(r, r.exOk) },
    fde: { k: 'fde', label: 'FDE board papers', num: true, title: 'Grade 5 exams generated in the FDE board format (provisional: read from the paper layout, no governed rule)', val: (r) => r.fde, fmt: (r) => N(r.fde) },
    fdeT: { k: 'fdeT', label: 'Teachers with an FDE paper', num: true, levels: ['sector', 'school'], val: (r) => r.fdeT, fmt: (r) => N(r.fdeT) },
    exReq: { k: 'exReq', label: 'Papers requested', num: true, val: (r) => r.exReq, fmt: (r) => N(r.exReq) },
    exT: { k: 'exT', label: 'Teachers with a paper', num: true, levels: ['sector', 'school'], val: (r) => r.exT, fmt: (r) => N(r.exT) },
    exPct: { k: 'exPct', label: '% of teachers', num: true, levels: ['sector', 'school'], title: 'Teachers who generated at least one exam paper ÷ primary teachers', val: (r) => ratio(r.exT, r.teachers), fmt: (r) => cov(ratio(r.exT, r.teachers)) },
    exFail: { k: 'exFail', label: 'Failed', num: true, title: 'The generator failed; the teacher was told and can ask again', val: (r) => r.exFail, fmt: (r) => N(r.exFail) },
    exStuck: { k: 'exStuck', label: 'Never finished', num: true, title: 'Still generating more than an hour after the request', val: (r) => r.exStuck, fmt: (r) => N(r.exStuck) },
    exEdit: { k: 'exEdit', label: 'Edited by teacher', num: true, title: 'Papers the teacher edited afterwards (removed questions, changed marks or wording)', val: (r) => r.exEdit, fmt: (r) => N(r.exEdit) },
    qscore: { k: 'qscore', label: 'Average quiz score', num: true, title: "Children's finished lesson quizzes: correct answers ÷ questions answered (provisional)", val: (r) => (r.qA ? (100 * r.qC) / r.qA : null), fmt: (r) => sc(r.qA ? (100 * r.qC) / r.qA : null) },
    qfin: { k: 'qfin', label: 'Quizzes scored', num: true, val: (r) => r.qF, fmt: (r) => N(r.qF) },
    onProg: { k: 'onProg', label: 'On NIETE primary training', num: true, title: 'Has an active assignment to the niete_primary programme (NIETE levels 0–3)', val: (r) => r.onProg, fmt: (r) => (r.t ? yn(r.onProg) : N(r.onProg)) },
    didMod: { k: 'didMod', label: 'Did a module', num: true, levels: ['sector', 'school'], val: (r) => r.didModule, fmt: (r) => N(r.didModule) },
    mods: { k: 'mods', label: 'Modules finished', num: true, title: 'NIETE modules finished, levels 0–3 (171 in all)', val: (r) => (r.t ? r.mods : r.teachers ? r.mods / r.teachers : null), fmt: (r) => (r.t ? `${N(r.mods)} <span class="dim">of 171</span>` : `${r.teachers ? (r.mods / r.teachers).toFixed(1) : '—'} <span class="dim">avg</span>`) },
  };
  for (let l = 1; l <= 4; l++) {
    COL[`cert${l}`] = { k: `cert${l}`, label: `${LEVELS[l - 1]} certified`, num: true, title: `Primary teachers holding the NIETE ${LEVELS[l - 1]} certificate (passed the level's grand quiz) ÷ primary teachers`,
      val: (r) => (r.t ? r.cert[l - 1] : ratio(r.cert[l - 1], r.teachers)), fmt: (r) => (r.t ? yn(r.cert[l - 1]) : `${sc(ratio(r.cert[l - 1], r.teachers))} <span class="dim">${N(r.cert[l - 1])}</span>`) };
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
  // Charts are placeholders in the HTML, drawn afterwards at their real pixel width so text stays 11px and bars
  // keep a sensible size on any screen; they are redrawn when the window is resized.
  const charts = [];
  function chart(items, series, kind = 'bar', fmt = N) {
    if (!items.length) return '<p class="empty">No data in this period.</p>';
    charts.push({ items, series, kind, fmt });
    const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `${legend}<div class="chart" data-chart="${charts.length - 1}"></div>`;
  }
  // A round axis step (1, 2 or 5 x 10^n) giving about four gridlines.
  function niceMax(v) {
    if (v <= 0) return { max: 4, step: 1 };
    const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw);
    return { max: Math.ceil(v / step) * step, step };
  }
  function drawChart(el, c) {
    const W = Math.max(280, Math.round(el.clientWidth)), H = W < 500 ? 180 : 220;
    const B = 26, T = 8;
    const { items, series, kind, fmt } = c;
    const vals = items.flatMap((i) => i.values).filter((v) => v !== null && v !== undefined);
    let { max, step } = niceMax(Math.max(0, ...vals));
    if (kind === 'line') { max = 100; step = 25; }
    const tick = (v) => (kind === 'line' ? `${v}%` : N(v));
    const L = 10 + 7 * Math.max(...[0, step, max].map((v) => tick(v).length));
    const plotW = W - L - 4, slot = plotW / items.length;
    const y = (v) => T + (H - T - B) * (1 - Math.min(v, max) / max);
    let svg = '';
    for (let v = 0; v <= max + 1e-9; v += step) svg += `<line class="${v ? 'gl' : 'gl0'}" x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${tick(v)}</text>`;
    const every = Math.max(1, Math.ceil(items.length / Math.max(2, Math.floor(plotW / 70))));
    items.forEach((it, i) => { if (i % every === 0) svg += `<text x="${L + slot * i + slot / 2}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`; });
    if (kind === 'bar') {
      const group = Math.min(slot * 0.75, 28 * series.length + 4 * (series.length - 1));
      const bw = (group - 4 * (series.length - 1)) / series.length;
      items.forEach((it, i) => it.values.forEach((v, j) => {
        if (!v) return;
        const x = L + slot * i + (slot - group) / 2 + j * (bw + 4);
        svg += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, bw).toFixed(1)}" height="${(H - B - y(v)).toFixed(1)}" rx="3" fill="${series[j].color}" opacity="${it.faded ? 0.4 : 1}" data-tip="${esc(`${it.label} · ${series[j].name}: ${fmt(v)}${it.faded ? ' (in progress)' : ''}`)}"/>`;
      }));
    } else {
      series.forEach((s, j) => {
        const pts = items.map((it, i) => (it.values[j] === null || it.values[j] === undefined ? null : [L + slot * i + slot / 2, y(it.values[j]), it]));
        let d = '';
        pts.forEach((pt, i) => { if (pt) d += `${d && pts[i - 1] ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`; });
        svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`;
        pts.forEach((pt) => { if (pt) svg += `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="${items.length > 40 ? 2 : 4}" fill="${s.color}" stroke="#FFF" stroke-width="1.5" opacity="${pt[2].faded ? 0.45 : 1}" data-tip="${esc(`${pt[2].label} · ${s.name}: ${P1(pt[2].values[j])}`)}"/>`; });
      });
    }
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">${svg}</svg>`;
  }
  function drawCharts(root = document) { root.querySelectorAll('.chart[data-chart]').forEach((el) => { const c = charts[+el.dataset.chart]; if (c) drawChart(el, c); }); }
  // Chart colours: green for DC (and the first series), amber for HITL (and the second), as in the overview.
  const C1 = '#1F7A4C', C2 = '#C4741C';
  const GREEN = C1, NAVY = C2, GREY = '#8A929E', SOFT = '#8FD3AE';
  const granSeg = () => `<div class="seg" role="group" aria-label="Group by">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => `<button data-gran="${k}" aria-pressed="${S.gran === k}">${l}</button>`).join('')}</div>`;
  function seriesNow() { return Calc.series(S.P, sel(), S.gran); }
  const sel = () => ({ from: S.from, to: S.to, sector: S.sector, school: S.school });

  // ---------- views ----------
  function scopeName() {
    if (S.school !== '') { const s = S.data.schools[+S.school]; return `${s.name} (${s.sector})`; }
    return S.sector || 'All ICT';
  }
  function crumbs() {
    const parts = [S.sector || S.school !== '' ? '<button type="button" data-focus="clear">All ICT</button>' : '<b>All ICT</b>'];
    if (S.sector) parts.push(S.school !== '' ? `<button type="button" data-focus="sector:${esc(S.sector)}">${esc(S.sector)}</button>` : `<b>${esc(S.sector)}</b>`);
    if (S.school !== '') parts.push(`<b>${esc(S.data.schools[+S.school].name)}</b>`);
    return parts.join('<span aria-hidden="true">›</span>');
  }


  // ---------- overview ----------
  const TIER = { b4: ['✓', 'Exemplary'], b3: ['●', 'Proficient'], b2: ['▲', 'Developing'], b1: ['!', 'Needs support'] };
  const tierPill = (p) => { const b = band(p); return b ? `<span class="sc ${b}"><i>${TIER[b][0]}</i>${TIER[b][1]}</span>` : '<span class="pill-t">No data</span>'; };
  const tierBg = (p) => ({ b4: 'var(--t4)', b3: 'var(--t3)', b2: 'var(--t2)', b1: 'var(--t1)' }[band(p)] || 'var(--line)');
  const MET = {
    lp: { label: 'LP engagement', f: (g) => ratio(g.g15, g.teachers) },
    dc: { label: 'DC coverage', f: (g) => ratio(g.dcT, g.teachers) },
    hitl: { label: 'HITL coverage', f: (g) => ratio(g.hitlT, g.teachers) },
    ex: { label: 'Exam generator', f: (g) => ratio(g.exT, g.teachers) },
    l0: { label: 'L0', f: (g) => ratio(g.cert[0], g.teachers) },
    l1: { label: 'L1', f: (g) => ratio(g.cert[1], g.teachers) },
    l2: { label: 'L2', f: (g) => ratio(g.cert[2], g.teachers) },
    l3: { label: 'L3', f: (g) => ratio(g.cert[3], g.teachers) },
  };
  const signed = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function heroCard(key, label, note, g, A, secs, allTime) {
    const f = MET[key].f, v = f(g);
    const vals = secs.map(([, s]) => f(s)).filter((x) => x !== null);
    const lo = Math.max(0, Math.floor((Math.min(v ?? 100, ...vals) - 5) / 10) * 10), hi = 100;
    const pos = (x) => ((x - lo) / (hi - lo)) * 100;
    const scoped = S.sector || S.school !== '';
    const all = f(A);
    const diff = v !== null && all !== null ? v - all : null;
    const cmp = scoped && diff !== null
      ? `<span class="cmp ${diff >= 0 ? 'up' : 'dn'}">${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} pts vs All ICT (${P1(all)})</span>`
      : `<span class="cmp">Sectors range ${P1(Math.min(...vals))} – ${P1(Math.max(...vals))}</span>`;
    const dots = secs.map(([n, s]) => {
      const x = f(s); if (x === null) return '';
      const on = n === S.sector, sz = on ? 16 : 11;
      return `<button class="d ${on ? 'on' : ''}" type="button" data-focus="sector:${esc(n)}" title="${esc(n)}: ${P1(x)}" aria-label="${esc(n)} ${P1(x)}" style="top:${14 - sz / 2}px;left:calc(${pos(x).toFixed(2)}% - ${sz / 2}px);width:${sz}px;height:${sz}px;background:${tierBg(x)}"></button>`;
    }).join('');
    const tick = all !== null ? `<div class="tk" style="left:calc(${pos(all).toFixed(2)}% - 1px)" title="All ICT ${P1(all)}"></div>` : '';
    return `<article class="hcard"><div class="hcard-h"><span class="hcard-l">${esc(label)}</span>${allTime ? '<span class="pill-t">All-time</span>' : ''}</div>
      <div class="hcard-v"><span class="big">${P1(v)}</span>${tierPill(v)}</div><span class="hnote">${note}</span>
      <div class="strip" role="img" aria-label="Sector spread; the grey tick is All ICT"><div class="ln"></div>${tick}${dots}</div>${cmp}</article>`;
  }

  // The last bucket of a series is faded when it is still in progress.
  function partialOf(ser) {
    const last = ser[ser.length - 1];
    if (!last || last.to !== S.data.today || S.gran === 'day') return -1;
    if (S.gran === 'week') return last.to - last.from < 6 ? ser.length - 1 : -1;
    return ser.length - 1;
  }
  function momentum(ser) {
    const view = S.mview || 'obs';
    const part = partialOf(ser);
    const full = ser.filter((_, i) => i !== part);
    const unit = S.gran === 'day' ? 'day' : S.gran === 'week' ? 'week' : 'month';
    const peakIdx = (k) => { let b = 0; full.forEach((g, i) => { if (g[k] > full[b][k]) b = i; }); return b; };
    const items = (f) => ser.map((g, i) => ({ label: bucketLabel(g), values: f(g), faded: i === part }));
    const stats = (k, name, k2, name2) => {
      if (!full.length) return '';
      const p = peakIdx(k), last = full[full.length - 1], pv = full[p][k];
      const ch = pv ? ((last[k] - pv) / pv) * 100 : 0;
      return `<div class="stat"><span class="sl">Peak ${unit}</span><span class="sv">${N(pv)}</span><span class="ss">${name}, ${bucketLabel(full[p])}</span></div>
        <div class="stat"><span class="sl">Latest full ${unit}</span><span class="sv">${N(last[k])}</span><span class="ss">${name} and ${N(last[k2])} ${name2}, ${bucketLabel(last)}</span></div>
        <div class="stat"><span class="sl">Change from peak</span><span class="sv ${ch < -0.5 ? 'dn' : ''}">${full.length > 1 ? signed(ch) : '—'}</span><span class="ss">${name}</span></div>`;
    };
    const say = (k, name) => {
      if (full.length < 2) return `Pick a longer period to see how ${name} change over time.`;
      const p = peakIdx(k), last = full[full.length - 1], pv = full[p][k];
      if (!pv) return `No ${name} in this period.`;
      const ch = ((last[k] - pv) / pv) * 100;
      if (p === full.length - 1) return `${cap(name)} are at their highest in the latest full ${unit} (${bucketLabel(last)}).`;
      if (ch > -10) return `${cap(name)} are holding close to their peak (${bucketLabel(full[p])}).`;
      return `${cap(name)} peaked in ${bucketLabel(full[p])} and the latest full ${unit} is ${Math.abs(ch).toFixed(0)}% lower.`;
    };
    let body;
    if (view === 'obs') {
      body = { insight: say('dc', 'DC recordings'), chart: chart(items((g) => [g.dc, g.hitl]), [{ name: 'DC observations', color: C1 }, { name: 'HITL observations', color: C2 }]), stats: stats('dc', 'DC recordings', 'hitl', 'HITL') };
    } else if (view === 'plans') {
      body = { insight: say('plans', 'plans generated'), chart: chart(items((g) => [g.plans, g.taught]), [{ name: 'Plans generated', color: C1 }, { name: 'Plans taught, seen in DC', color: C2 }]), stats: stats('plans', 'plans generated', 'taught', 'plans taught') };
    } else {
      const d = full.map((g) => fpct(g.ficoD.hlp)).filter((x) => x !== null), h = full.map((g) => fpct(g.ficoH.hlp)).filter((x) => x !== null);
      const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      const rng = (a) => (a.length ? `${P1(Math.min(...a))}–${P1(Math.max(...a))}` : '—');
      body = {
        insight: d.length ? `Teaching practices: DC averages ${P1(avg(d))}${h.length ? ` and HITL ${P1(avg(h))}, ${Math.abs(avg(h) - avg(d)).toFixed(1)} points ${avg(h) >= avg(d) ? 'higher' : 'lower'}` : ''}.` : 'No scored observations in this period.',
        chart: chart(items((g) => [fpct(g.ficoD.hlp), fpct(g.ficoH.hlp)]), [{ name: 'DC observations', color: C1 }, { name: 'HITL observations', color: C2 }], 'line'),
        stats: `<div class="stat"><span class="sl">DC, latest full ${unit}</span><span class="sv">${P1(d.length ? d[d.length - 1] : null)}</span><span class="ss">teaching practices score</span></div>
          <div class="stat"><span class="sl">HITL, latest full ${unit}</span><span class="sv">${P1(h.length ? h[h.length - 1] : null)}</span><span class="ss">teaching practices score</span></div>
          <div class="stat"><span class="sl">Range in period</span><span class="sv" style="font-size:22px">${rng(d)}</span><span class="ss">DC · HITL ${rng(h)}</span></div>`,
      };
    }
    const tabs = [['obs', 'Classroom observations'], ['plans', 'Lesson plans'], ['score', 'Teaching practices score']]
      .map(([k, l]) => `<button type="button" data-mview="${k}" aria-pressed="${view === k}">${l}</button>`).join('');
    return `<section class="card" id="c-mom"><div class="card-h"><div><h2>Momentum</h2><p class="note">${esc(scopeName())} · by ${unit} · ${periodText()}${part >= 0 ? `. The last ${unit} is still in progress and shown faded.` : '.'}</p></div>
      <div class="row"><div class="seg" role="group" aria-label="Momentum metric">${tabs}</div><button class="dl" data-dl="c-mom">Download image</button></div></div>
      <p class="insight">${esc(body.insight)}</p>
      <div class="flexrow"><div class="mom">${body.chart}</div><div class="stats">${body.stats}</div></div></section>`;
  }

  function heatRows(rows, A, kind) {
    const keys = ['lp', 'dc', 'hitl', 'ex', 'l0', 'l1', 'l2', 'l3'];
    const cells = (g, dim) => keys.map((k) => {
      const v = g.teachers ? MET[k].f(g) : null;
      if (v === null) return '<span class="hm-c na">—</span>';
      const b = band(v);
      return `<span class="hm-c ${b} ${dim ? 'dim' : ''}" title="${esc(g.name)} · ${MET[k].label}: ${P1(v)} (${TIER[b][1]})"><i>${TIER[b][0]}</i>${v.toFixed(1)}</span>`;
    }).join('');
    const focused = kind === 'sector' ? S.sector : S.school;
    return rows.map((g) => {
      const on = String(g.key) === String(focused);
      const dim = focused !== '' && !on;
      return `<button class="hm-r" type="button" data-focus="${kind}:${esc(g.key)}" aria-pressed="${on}"><span class="hm-n"><b>${esc(g.name)}</b><span>${esc(g.sub)}</span></span>${cells(g, dim)}</button>`;
    }).join('') + (A ? `<button class="hm-r total" type="button" data-focus="${A.focus}"><span class="hm-n"><b>${esc(A.name)}</b><span>${esc(A.sub)}</span></span>${cells(A, false)}</button>` : '');
  }
  function heatmap(title, note, rowsHtml, id) {
    const heads = ['Lesson plans', 'DC coverage', 'HITL coverage', 'Exam generator', 'L0', 'L1', 'L2', 'L3'];
    const leg = ['b4', 'b3', 'b2', 'b1'].map((b) => `<span><i class="${b}">${TIER[b][0]}</i><b>${TIER[b][1]}</b> ${BANDS.find((x) => x[1] === b)[3]}</span>`).join('');
    return `<section class="card" id="${id}" style="flex:3 1 740px"><div class="card-h"><div><h2>${esc(title)}</h2><p class="note">${note}</p></div><button class="dl" data-dl="${id}">Download image</button></div>
      <div class="legend bands">${leg}</div>
      <div class="xscroll"><div class="hm"><div class="hm-g"><span></span><span class="grp">Classroom reach · this period</span><span class="grp">Certification · all-time</span></div>
      <div class="hm-h"><span>Name</span>${heads.map((h) => `<span>${h}</span>`).join('')}</div><div class="hm-list">${rowsHtml}</div></div></div></section>`;
  }

  function viewOverview(R) {
    const RA = Calc.rollup(S.P, { from: S.from, to: S.to });
    const A = RA.all, g = R.all;
    const secs = [...RA.sectors.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const scoped = S.sector || S.school !== '';
    const lv = [0, 1, 2, 3].map((i) => ratio(g.cert[i], g.teachers));

    const hero = `<section class="hero" aria-label="Headline metrics">
      ${heroCard('lp', 'Lesson-plan engagement', `${N(g.g15)} of ${N(g.teachers)} teachers used a grade 1–5 lesson plan`, g, A, secs)}
      ${heroCard('dc', 'DC coverage', `${N(g.dcT)} teachers recorded a lesson on the Digital Coach`, g, A, secs)}
      ${heroCard('hitl', 'HITL coverage', `${N(g.hitlT)} teachers observed by a coach`, g, A, secs)}
      ${heroCard('l3', 'Teacher Leader certified', `${N(g.cert[3])} teachers hold Level 3`, g, A, secs, true)}</section>`;

    const vol = [[g.dc, 'DC observations'], [g.hitl, 'HITL observations'], [g.taught, 'Plans taught, seen in DC'], [g.made, 'Lesson quizzes made'],
      [g.kidsL, 'Children quizzed'], [g.exOk, 'Exams generated']];
    const volume = `<section class="volume" aria-label="Activity volume">${vol.map(([v, l]) => `<div><span class="vv">${N(v)}</span><span class="vl">${l}</span></div>`).join('')}</section>`;

    const rungs = [['Used a grade 1–5 lesson plan', g.g15], ['Recorded a lesson (DC)', g.dcT], ['Made a lesson quiz', g.madeT], ['Used the exam generator', g.exT],
      ['Observed by a coach (HITL)', g.hitlT], ['Taught a plan, seen in DC', g.teachersTaught], ['Children took one of their lesson quizzes', g.quizLT]]
      .map(([l, n]) => [l, n, ratio(n, g.teachers)]).sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0));
    const ladder = `<section class="card" id="c-ladder" style="flex:3 1 520px"><div class="card-h"><div><h2>Teacher reach ladder</h2><p class="note">${esc(scopeName())} · share of ${N(g.teachers)} primary teachers reached by each part of the programme · ${periodText()}</p></div><button class="dl" data-dl="c-ladder">Download image</button></div>
      <div class="ladder"><div class="lrow"><div class="ll"><span>In the programme</span><span>${N(g.teachers)} teachers</span></div><div class="lbar"><div style="width:100%;background:var(--muted)"></div></div><span class="lpct">100%</span></div>
      ${rungs.map(([l, n, p]) => `<div class="lrow"><div class="ll"><span>${l}</span><span>${N(n)} teachers</span></div><div class="lbar"><div style="width:${p ?? 0}%;background:${tierBg(p)}"></div></div><span class="lpct">${P1(p)}</span></div>`).join('')}</div>
      <p class="note">Each rung is counted on its own, so this is a ladder of reach rather than a funnel.</p></section>`;

    // Needs attention: generated from this period's figures.
    const att = [];
    const serW = Calc.series(S.P, sel(), 'week');
    const fullW = serW.filter((x, i) => !(i === serW.length - 1 && x.to === S.data.today && x.to - x.from < 6));
    if (fullW.length >= 3) {
      let p = 0; fullW.forEach((x, i) => { if (x.dc > fullW[p].dc) p = i; });
      const last = fullW[fullW.length - 1], drop = fullW[p].dc ? ((fullW[p].dc - last.dc) / fullW[p].dc) * 100 : 0;
      if (p < fullW.length - 1 && drop >= 25) att.push({ v: drop >= 50 ? 40 : 65, focus: 'tab:dc', title: `DC recordings have fallen ${drop.toFixed(0)}% since the week of ${nice(fullW[p].from)}`, body: `From ${N(fullW[p].dc)} in the week of ${nice(fullW[p].from)} to ${N(last.dc)} in the week of ${nice(last.from)}.`, tag: 'Open DC observations →' });
    }
    if (!scoped) {
      for (const k of ['hitl', 'dc', 'ex', 'lp']) {
        const vs = secs.map(([n, s]) => [n, MET[k].f(s)]).filter((x) => x[1] !== null).sort((a, b) => a[1] - b[1]);
        if (!vs.length) continue;
        const [lowN, lowV] = vs[0], [hiN, hiV] = vs[vs.length - 1];
        if (hiV < 60) att.push({ v: lowV, focus: `sector:${lowN}`, title: `${MET[k].label} is under ${Math.ceil(hiV / 5) * 5}% in every sector`, body: `All ICT is at ${P1(MET[k].f(A))}. ${lowN} is lowest at ${P1(lowV)}.`, tag: `Focus ${lowN} →` });
        else if (lowV < 70) att.push({ v: lowV, focus: `sector:${lowN}`, title: `${lowN} trails on ${MET[k].label}`, body: `${P1(lowV)} against ${P1(MET[k].f(A))} across ICT; ${hiN} leads at ${P1(hiV)}.`, tag: `Focus ${lowN} →` });
      }
      const best = secs.map(([n, s]) => [n, ((MET.lp.f(s) || 0) + (MET.dc.f(s) || 0)) / 2, s]).sort((a, b) => b[1] - a[1])[0];
      if (best) att.push({ v: 85, focus: `sector:${best[0]}`, title: `${best[0]} leads on lesson plans and recordings`, body: `LP engagement ${P1(MET.lp.f(best[2]))} and DC coverage ${P1(MET.dc.f(best[2]))}.`, tag: `Focus ${best[0]} →` });
    } else {
      for (const k of ['hitl', 'dc', 'ex', 'lp']) {
        const v = MET[k].f(g), a = MET[k].f(A);
        if (v !== null && a !== null && v < a - 3) att.push({ v, focus: `tab:${k === 'ex' ? 'exams' : k}`, title: `${MET[k].label} is below the ICT average`, body: `${P1(v)} here against ${P1(a)} across ICT.`, tag: 'Open details →' });
      }
    }
    let worst = 1; for (let i = 2; i < 4; i++) if ((lv[i - 1] ?? 0) - (lv[i] ?? 0) > (lv[worst - 1] ?? 0) - (lv[worst] ?? 0)) worst = i;
    if (lv[worst] !== null) att.push({ v: lv[worst], focus: 'tab:training', title: `Certification drops ${(lv[worst - 1] - lv[worst]).toFixed(1)} points from Level ${worst - 1} to Level ${worst}`, body: `${P1(lv[worst - 1])} hold ${LEVELS[worst - 1].split(' · ')[1]}, ${P1(lv[worst])} reach ${LEVELS[worst].split(' · ')[1]}.`, tag: 'Open training →' });
    att.sort((a, b) => a.v - b.v);
    const attention = `<section class="card" id="c-att" style="flex:2 1 340px"><div class="card-h"><div><h2>Needs attention</h2><p class="note">Generated from this period's results${scoped ? ` for ${esc(scopeName())}` : ''}. Select one to focus.</p></div></div>
      <div class="atts">${att.slice(0, 5).map((a) => { const b = band(a.v) || 'b2'; return `<button class="att" type="button" data-focus="${esc(a.focus)}"><span class="bd ${b}" aria-hidden="true">${TIER[b][0]}</span><span class="at"><b>${esc(a.title)}</b><span>${esc(a.body)}</span><em>${esc(a.tag)}</em></span></button>`; }).join('') || '<p class="note">Nothing stands out in this period.</p>'}</div></section>`;

    // Heatmaps: the sectors, or a focused sector's schools.
    let heat;
    if (!S.sector) {
      const secRows = secs.map(([n, s]) => Object.assign(s, { name: n, key: n, sub: `${s.schools} schools · ${N(s.teachers)} teachers` }));
      const total = Object.assign({}, A, { name: 'All ICT', sub: `${N(A.schools)} schools · ${N(A.teachers)} teachers`, focus: 'clear' });
      heat = heatmap('Sectors at a glance', `% of each sector's primary teachers · ${periodText()}. Select a sector to focus the page.`, heatRows(secRows, total, 'sector'), 'c-hm');
    } else {
      const RS = S.school !== '' ? Calc.rollup(S.P, { from: S.from, to: S.to, sector: S.sector }) : R;
      const schRows = [...RS.schools.values()].sort((a, b) => S.data.schools[a.s].name.localeCompare(S.data.schools[b.s].name))
        .map((s) => Object.assign(s, { name: S.data.schools[s.s].name, key: s.s, sub: `EMIS ${S.data.schools[s.s].emis} · ${N(s.teachers)} teachers` }));
      const total = Object.assign({}, RS.all, { name: S.sector, sub: `${N(RS.all.schools)} schools · ${N(RS.all.teachers)} teachers`, focus: `sector:${S.sector}` });
      heat = heatmap(`Schools in ${S.sector}`, `% of each school's primary teachers · ${periodText()}. Select a school to focus; its teachers are listed below.`, heatRows(schRows, total, 'school'), 'c-hm');
    }

    const rates = [['Lesson-plan engagement', MET.lp.f(g)], ['DC coverage', MET.dc.f(g)], ['HITL coverage', MET.hitl.f(g)], ['Exam generator use', MET.ex.f(g)], ['Teacher Leader (L3)', MET.l3.f(g)]];
    const fname = S.school !== '' ? S.data.schools[+S.school].name : S.sector || 'All ICT';
    const focus = `<aside class="focus" aria-label="Focus"><div class="focus-h"><div><span class="fk">${S.school !== '' ? 'School focus' : S.sector ? 'Sector focus' : 'Programme focus'}</span><h2>${esc(fname)}</h2>
      <span class="fs">${scoped ? `${N(g.schools)} school${g.schools === 1 ? '' : 's'} · ${N(g.teachers)} primary teachers` : `${secs.length} sectors · ${N(A.schools)} schools · ${periodText()}`}</span></div>
      ${scoped ? '<button class="clr" type="button" data-focus="clear">Clear</button>' : ''}</div>
      <div class="frs">${rates.map(([l, v]) => `<div class="fr"><div><span>${l}</span><span>${P1(v)}</span></div><div class="fb"><div style="width:${v ?? 0}%;background:${v >= 70 ? 'var(--green)' : tierBg(v)}"></div></div></div>`).join('')}</div>
      <div class="fc"><div><b>${N(g.schools)}</b><span>Schools</span></div><div><b>${N(g.teachers)}</b><span>Primary teachers</span></div><div><b>${N(g.kidsL)}</b><span>Children quizzed</span></div><div><b>${N(g.onProg)}</b><span>On NIETE training</span></div></div>
      <button class="cta" type="button" data-focus="tab:${S.school !== '' ? 'teachers' : 'schools'}">${S.school !== '' ? 'Open its teachers →' : `Open ${esc(S.sector || 'all')} schools →`}</button></aside>`;

    // Certification staircase: bars for the selection, dots for the six sectors.
    const H = 240;
    const steps = [0, 1, 2, 3].map((i) => {
      const v = lv[i], prev = i ? lv[i - 1] : null, drop = prev !== null && v !== null ? prev - v : 0;
      const dots = secs.map(([n, s], j) => {
        const x = ratio(s.cert[i], s.teachers); if (x === null) return '';
        const on = n === S.sector, sz = on ? 16 : 11;
        return `<span class="step-dot ${on ? 'on' : ''}" title="${esc(n)}: ${P1(x)}" style="left:calc(${20 + j * 12}% - ${sz / 2}px);bottom:${(x / 100 * H - sz / 2).toFixed(1)}px;width:${sz}px;height:${sz}px"></span>`;
      }).join('');
      const dropB = drop >= 15 ? 'b1' : drop >= 8 ? 'b2' : 'b4';
      return `<div class="step"><div class="step-plot"><div class="step-bar" style="height:${((v ?? 0) / 100 * H).toFixed(1)}px;background:${tierBg(v)}"></div>
        <span class="step-val" style="bottom:${((S.school !== '' ? (v ?? 0) : Math.max(v ?? 0, ...secs.map(([, s]) => ratio(s.cert[i], s.teachers) ?? 0))) / 100 * H + 12).toFixed(1)}px">${P1(v)}</span>${S.school !== '' ? '' : dots}</div>
        <div class="step-t"><span class="lv">Level ${i}</span><span class="nm">${LEVELS[i].split(' · ')[1]}</span><span class="ct">${N(g.cert[i])} teachers</span>
        ${i ? `<span class="drop ${dropB}">−${drop.toFixed(1)} pts from Level ${i - 1}</span>` : ''}</div></div>`;
    }).join('');
    const stairs = `<section class="card" id="c-stairs"><div class="card-h"><div><h2>Certification staircase</h2><p class="note">${esc(scopeName())} · % of primary teachers holding each NIETE level certificate${S.school !== '' ? '' : '. Dots are the six sectors; the dark one is the focused sector'}.</p></div><div class="row"><span class="pill-t">All-time</span><button class="dl" data-dl="c-stairs">Download image</button></div></div>
      <div class="xscroll"><div class="stairs">${steps}</div></div></section>`;

    const { level, rows } = levelRows(R);
    const drillTable = S.school !== '' ? card('c-over-t', 'Teachers', 'Click a teacher for the scorecard. Contains teacher names — internal use only.',
      table('over', [nameCol(level), COL.g15, COL.taught, COL.dc, COL.hitl, COL.made, COL.exOk, COL.onProg, COL.cert1, COL.cert2, COL.cert3, COL.cert4], rows, { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: R.all })) : '';

    return `${hero}${volume}<div class="flexrow">${ladder}${attention}</div>${momentum(Calc.series(S.P, sel(), S.gran))}
      <div class="flexrow">${heat}${focus}</div>${stairs}${drillTable}`;
  }

  // ---------- lesson-plan analytics ----------
  const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hourName = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
  function lpAnalytics() {
    const L = Calc.lessonStats(S.P, sel());
    if (!L) return card('c-lpa', 'Lesson-plan analytics', 'Not available yet: the dashboard may still be refreshing after an update (this takes about four minutes), or the last refresh could not load it. Reload the page shortly.', '');
    if (!L.genTotal && !L.taughtTotal) return card('c-lpa', 'Lesson-plan analytics', `No lesson plans in ${periodText()}.`, '');
    const per100 = (t, g) => (g ? (100 * t) / g : null);

    // subjects
    const subs = L.subjects.slice().sort((a, b) => b.gen - a.gen);
    const maxS = Math.max(1, ...subs.map((s) => s.gen));
    const top = subs[0];
    const subjects = card('c-lps', 'Plans by subject', `Grade 1–5 plans generated and taught (seen in DC) per subject · ${esc(scopeName())} · ${periodText()}. ${top ? `<b>${esc(top.key)}</b> leads with ${P1(ratio(top.gen, L.genTotal))} of plans.` : ''}`,
      `<div class="ladder">${subs.map((s) => `<div class="lrow"><div class="ll"><span>${esc(s.key)}</span><span>${N(s.teachersGen)} teachers · ${N(s.taught)} taught</span></div>
        <div class="lbar"><div style="width:${(100 * s.gen) / maxS}%;background:${C1}"></div></div><span class="lpct">${N(s.gen)}</span></div>`).join('')}</div>
        <p class="note">Bars are plans generated. Typed topics have no curriculum subject.</p>`);

    // grades
    const grs = L.grades.slice().sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
    const grades = card('c-lpg', 'Plans by grade', `Plans generated and taught (seen in DC) per grade · ${periodText()}.`,
      chart(grs.map((g) => ({ label: g.key.replace('Grade ', 'G'), values: [g.gen, g.taught] })), [{ name: 'Plans generated', color: C1 }, { name: 'Plans taught, seen in DC', color: C2 }]));

    // weekdays: average per day, since a period may hold more Mondays than Saturdays
    const avg = L.wd.map((v, i) => (L.wdDays[i] ? v / L.wdDays[i] : 0));
    const busiest = avg.indexOf(Math.max(...avg)), quietest = avg.indexOf(Math.min(...avg));
    const days = card('c-lpw', 'Day of the week', `Average plans generated per day · ${periodText()}. <b>${WD[busiest]}</b> is the busiest (${N(avg[busiest])} a day); ${WD[quietest]} the quietest (${N(avg[quietest])}).`,
      chart(WD.map((w, i) => ({ label: w.slice(0, 3), values: [avg[i]] })), [{ name: 'Plans per day, on average', color: C1 }]));

    // weekday x hour
    const maxH = Math.max(1, ...L.heat.flat());
    const peakH = L.hrs.indexOf(Math.max(...L.hrs));
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const shade = (v) => (v ? `rgba(31, 122, 76, ${(0.12 + 0.88 * (v / maxH)).toFixed(2)})` : 'var(--line-2)');
    const grid = `<div class="xscroll"><div class="hh"><span></span>${hours.map((h) => `<span class="hh-x">${h % 3 === 0 ? hourName(h) : ''}</span>`).join('')}
      ${WD.map((w, i) => `<span class="hh-y">${w.slice(0, 3)}</span>${hours.map((h) => `<span class="hh-c" style="background:${shade(L.heat[i][h])}" data-tip="${w} ${hourName(h)}: ${N(L.heat[i][h])} plans"></span>`).join('')}`).join('')}</div></div>`;
    const heat = card('c-lph', 'When plans are generated', `Plans generated by weekday and hour (Pakistan time) · ${periodText()}. Most plans are generated around <b>${hourName(peakH)}</b>. Darker = more plans.`, grid);

    // lessons
    const lcols = (id) => [
      { k: 'name', label: 'Lesson', val: (r) => r.lesson.title || r.lesson.id, fmt: (r) => `${esc(r.lesson.title || '(no title)')}<br><span class="dim">${esc(r.lesson.id || 'typed topic')}</span>` },
      { k: 'grade', label: 'Grade', num: true, val: (r) => +r.lesson.grade || null, fmt: (r) => esc(r.lesson.grade || '—') },
      { k: 'subject', label: 'Subject', val: (r) => r.subject },
      { k: 'taught', label: 'Taught in DC', num: true, val: (r) => r.taught, fmt: (r) => N(r.taught) },
      { k: 'tt', label: 'Teachers who taught it', num: true, val: (r) => r.teachersTaught, fmt: (r) => N(r.teachersTaught) },
      { k: 'gen', label: 'Plans generated', num: true, val: (r) => r.gen, fmt: (r) => N(r.gen) },
      { k: 'tg', label: 'Teachers who generated it', num: true, val: (r) => r.teachersGen, fmt: (r) => N(r.teachersGen) },
      { k: 'rate', label: 'Taught per 100 plans', num: true, title: 'Times taught in DC ÷ plans generated × 100', val: (r) => per100(r.taught, r.gen), fmt: (r) => (r.gen ? per100(r.taught, r.gen).toFixed(1) : '—') },
    ];
    const curr = L.lessons.filter((x) => x.lesson.id);
    const mostTaught = curr.filter((x) => x.taught).sort((a, b) => b.taught - a.taught || b.teachersTaught - a.teachersTaught).slice(0, 25);
    const mostGen = curr.slice().sort((a, b) => b.gen - a.gen).slice(0, 25);
    const taughtTotal = curr.reduce((n, x) => n + x.taught, 0);
    const noId = L.taughtTotal - taughtTotal;
    const lt = card('c-lpt', 'Most taught lessons (seen in DC)', `The curriculum lessons teachers most often taught with a Rumi plan attached to their DC recording · ${periodText()} · top 25 of ${N(curr.filter((x) => x.taught).length)} lessons taught. Provisional: read from the lesson the recording's plan points to.${noId > 0 ? ` ${N(noId)} recording${noId === 1 ? '' : 's'} named no lesson.` : ''}`,
      table('lpt', lcols('lpt'), mostTaught, { sort: { k: 'taught', dir: -1 }, noLegend: true }));
    const lg = card('c-lpl', 'Most generated lessons', `The curriculum lessons teachers most often generated a plan for · ${periodText()} · top 25 of ${N(curr.length)} lessons.`,
      table('lpl', lcols('lpl'), mostGen, { sort: { k: 'gen', dir: -1 }, noLegend: true }));

    return `<div class="sec-h"><h2>Lesson-plan analytics</h2><p class="note">${N(L.genTotal)} plans generated by ${N(L.teachers)} teachers and ${N(L.taughtTotal)} taught in DC · ${esc(scopeName())} · ${periodText()}</p></div>
      <div class="cards2">${subjects}${grades}</div><div class="cards2">${days}${heat}</div>${lt}${lg}`;
  }

  function viewLp(R) { return viewLpBase(R) + lpAnalytics(); }
  function viewLpBase(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-lp', `Lesson plans · ${scopeName()} · ${periodText()}`,
      'A teacher <b>uses</b> a lesson plan by generating one with Rumi (picking a curriculum lesson or typing a topic, on WhatsApp or the portal) or by <b>opening</b> one in the teacher app. LP engagement % = primary teachers who used at least one grade 1–5 plan in the period ÷ all primary teachers. <b>Plans generated</b> counts only plans Rumi generated for the teacher; <b>Plans opened in the app</b> counts plans read there. <b>Plans taught</b> (provisional) = DC observations in which the teacher attached one of her recent Rumi lesson plans: she generated the plan, taught it, recorded the lesson and submitted that plan with it. The system does not store which plan, so this counts lessons, not named plans; 99.6% of them came within 14 days of the teacher generating a Rumi plan.',
      `<div class="kpis">${kpiP('LP engagement', ratio(a.g15, a.teachers), `${N(a.g15)} of ${N(a.teachers)} teachers`)}
        ${kpi('Plans generated', N(a.plans), 'grade 1–5')}${kpi('Plans taught', N(a.taught), `${P1(ratio(a.taught, a.dc))} of DC observations`)}
        ${kpi('Teachers who taught one', N(a.teachersTaught))}${kpi('Any plan incl. grade 6–12', N(a.lpAny), 'teachers')}</div>`)
      + card('c-lp-trend', `Lesson plans over time`, '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.plans, g.taught] })),
        [{ name: 'Plans generated', color: GREEN }, { name: 'Plans taught, seen in DC', color: NAVY }]), granSeg())
      + card('c-lp-t', `By ${level}`, '', table('lp', [nameCol(level), COL.teachers, COL.g15, COL.usage, COL.plans, COL.opened, COL.taught, COL.tTaught], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewDc(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-dc', `DC observations · ${scopeName()} · ${periodText()}`, 'A teacher records her own lesson and the Digital Coach scores it. Counted when the scores came back. Never added to coach visits.',
      `<div class="kpis">${kpi('Lessons recorded', N(a.dc), '')}${kpi('Teachers who recorded', N(a.dcT), `${P1(ratio(a.dcT, a.teachers))} of ${N(a.teachers)}`)}
        ${kpi('Per recording teacher', a.dcT ? (a.dc / a.dcT).toFixed(1) : '—', 'lessons')}${kpi('Never recorded', N(a.teachers - a.dcT), 'teachers in this period')}</div>`)
      + card('c-dc-trend', 'DC observations over time', '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.dc, g.teachersDc] })),
        [{ name: 'Lessons recorded', color: GREEN }, { name: 'Teachers who recorded', color: NAVY }]), granSeg())
      + card('c-dc-t', `By ${level}`, '', table('dc', [nameCol(level), COL.teachers, COL.dc, COL.dcT, COL.dcPct, ...ficoCols().filter((c) => c.src === 'dc')], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  // DC observations by lesson subject and by the teacher's roster grade, with section scores side by side.
  const DC_SECS = [['hlp', 'Teaching practices'], ['se', 'Student engagement'], ['tsk3', 'Subject knowledge'], ['lpf', 'Lesson-plan fidelity']];
  const DC_MIN = 30;   // fewest lessons for a group to be ranked
  function dcAnalytics() {
    const D = Calc.dcStats(S.P, sel());
    if (!D.n) return '';
    if (!D.hasSubj) return card('c-dcx', 'DC analytics by subject and grade', 'Updating now: the dashboard is refreshing after an update. This part appears by itself when it finishes.', '');
    const sp = (o, k) => (o.fico[k][2] ? fpct(o.fico[k]) : null);
    const cols = (what, share = true) => [
      { k: 'name', label: what, val: (r) => (r.ord !== undefined ? r.ord : r.key), fmt: (r) => esc(r.key) },
      { k: 'n', label: 'Lessons recorded', num: true, val: (r) => r.n, fmt: (r) => N(r.n) },
      ...(share ? [{ k: 'share', label: 'Share of lessons', num: true, val: (r) => r.n / D.n, fmt: (r) => P1(ratio(r.n, D.n)) }] : []),
      { k: 'teachers', label: 'Teachers', num: true, val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
      ...DC_SECS.map(([k, l]) => ({ k, label: l, num: true, val: (r) => sp(r, k), fmt: (r) => sc(sp(r, k)) })),
    ];
    const note = `Average DC score per FICO section · ${esc(scopeName())} · ${periodText()}. Subject knowledge is the v3 rubric (from 8 Sep) only: the earlier v2 scored every lesson on maths and science items, which makes subjects look unequal by design. Lesson-plan fidelity counts only lessons with a plan attached.`;

    // what stands out: best and weakest subject and grade per section, among groups with enough lessons
    const ranked = (arr, k) => arr.filter((r) => r.fico[k][2] >= DC_MIN && !/not recorded|Other|unknown/.test(r.key)).map((r) => ({ key: r.key, v: sp(r, k), n: r.fico[k][2] })).sort((a, b) => b.v - a.v);
    const line = (arr, k, l, what) => {
      const r = ranked(arr, k);
      if (r.length < 2) return '';
      const hi = r[0], lo = r[r.length - 1];
      return `<li><b>${l}</b>: ${what} <b>${esc(hi.key)}</b> scores highest (${P1(hi.v)}), <b>${esc(lo.key)}</b> lowest (${P1(lo.v)}), a gap of ${(hi.v - lo.v).toFixed(1)} points.</li>`;
    };
    const top = D.subjects.filter((r) => !/not recorded/.test(r.key));
    const busiestG = D.grades.filter((r) => r.key !== 'Grade unknown').sort((a, b) => b.n - a.n)[0];
    const facts = `<ul class="facts">
      ${top[0] ? `<li><b>${esc(top[0].key)}</b> is the most recorded subject: ${P1(ratio(top[0].n, D.n))} of DC lessons${top[1] ? `, then ${esc(top[1].key)} (${P1(ratio(top[1].n, D.n))})` : ''}.</li>` : ''}
      ${busiestG ? `<li>Teachers on <b>${esc(busiestG.key)}</b> record the most lessons (${N(busiestG.n)}).</li>` : ''}
      ${DC_SECS.map(([k, l]) => line(D.subjects, k, l, 'by subject,')).join('')}
      ${DC_SECS.map(([k, l]) => line(D.grades, k, l, 'by grade,')).join('')}
    </ul><p class="note">Ranked only where a subject or grade has at least ${DC_MIN} scored lessons.</p>`;

    // grade x subject heatmap: lessons recorded, or one section's average score
    const view = S.dview || 'n';
    const subs = D.subjects.map((r) => r.key);
    const mx = Math.max(1, ...[...D.cells.values()].map((c) => c.n));
    const cell = (o) => {
      if (!o || !o.n) return '<span class="hm-c na">—</span>';
      if (view === 'n') { const a = o.n / mx; return `<span class="hm-c" style="background:rgba(31,122,76,${(0.15 + 0.85 * a).toFixed(2)});color:${a > 0.45 ? '#FFF' : 'var(--fg)'}" title="${N(o.n)} lessons by ${N(o.teachers)} teachers">${N(o.n)}</span>`; }
      const v = sp(o, view);
      if (v === null) return '<span class="hm-c na">—</span>';
      const b = band(v);
      return `<span class="hm-c ${b}${o.fico[view][2] < DC_MIN ? ' thin' : ''}" title="${P1(v)} · ${N(o.fico[view][2])} scored lessons"><span><i>${GLYPH[b]}</i>${P1(v)}<small>${N(o.fico[view][2])} lessons</small></span></span>`;
    };
    const tpl = `grid-template-columns: minmax(130px, 1.1fr) repeat(${subs.length}, minmax(78px, 1fr))`;
    const head = `<div class="qg-r qg-h" style="${tpl}"><span>Grade</span>${subs.map((c) => `<span>${esc(c)}</span>`).join('')}</div>`;
    const body = D.grades.map((g) => `<div class="qg-r" style="${tpl}"><span class="qg-n">${esc(g.key)}</span>${subs.map((c) => cell(D.cells.get(`${g.key}|${c}`))).join('')}</div>`).join('');
    const seg = `<div class="seg" role="group" aria-label="Show">${[['n', 'Lessons recorded'], ...DC_SECS].map(([k, l]) => `<button type="button" data-dview="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>`;

    const G = D.gsrc;
    const gradeNote = `Grade of the lesson, taken in this order: the Rumi lesson plan the teacher attached (${P1(ratio(G.r, D.n))} of lessons); a clear grade typed in an uploaded or pasted plan (${P1(ratio(G.t, D.n))}); otherwise the teacher's classes on the roster (${P1(ratio(G.roster, D.n))}), where a teacher on two grades counts in both, so the rows can add up to more than the total. ${P1(ratio(G.none, D.n))} have no grade either way (Grade unknown). <b>Provisional</b>: the plan grade is not yet a governed rule.${D.hasGrades ? '' : ' Roster grades are not loaded yet: the dashboard may still be refreshing.'}`;
    const gradeBar = splitBar([['Rumi plan', G.r, C1], ['Typed in plan', G.t, '#8FD3AE'], ['Teacher\'s roster', G.roster, C2], ['Unknown', G.none, '#BBB']].filter((x) => x[1]), D.n);
    return `<div class="sec-h"><h2>DC analytics by subject and grade</h2><p class="note">${N(D.n)} DC lessons by ${N(D.teachers)} teachers · ${esc(scopeName())} · ${periodText()}. Subject is the one the Digital Coach heard in the recording.</p></div>`
      + card('c-dcx', 'What stands out', '', facts)
      + card('c-dcs', 'By subject', note, table('dcs', cols('Subject'), D.subjects, { sort: { k: 'n', dir: -1 }, noLegend: true }))
      + card('c-dcg', 'By grade', `${gradeNote} ${note}`, `<span class="lbl">Where the grade comes from</span>${gradeBar}` + table('dcg', cols('Grade', false), D.grades, { noLegend: true }))
      + card('c-dch', 'Grade × subject', `Pick what to show. Grade as in the table above. Scores are coloured by the performance bands; faded cells have fewer than ${DC_MIN} scored lessons, too few to read much into.`,
        `<div class="row">${seg}</div>${view === 'n' ? '' : legend().replace('<span><i class="zero"></i>None in this period</span>', '')}<div class="xscroll"><div class="qg">${head}${body}</div></div>`);
  }

  // HITL analytics: coverage depth, coaches, how coaches treat the AI's pre-filled form, grade, weekday.
  function hitlAnalytics() {
    const H = Calc.hitlStats(S.P, sel());
    if (!H.n) return '';
    if (!H.hasCoach) return card('c-hx', 'HITL analytics', 'Updating now: the dashboard is refreshing after an update. This part appears by itself when it finishes.', '');
    const sp = (o, k) => (o.fico[k][2] ? fpct(o.fico[k]) : null);
    const E = H.edits, edited = E.u + E.n + E.r;
    const named = H.coaches.filter((c) => c.key);
    const top = named[0];
    const avg = H.wd.map((v, i) => (H.wdDays[i] ? v / H.wdDays[i] : 0));
    const busiest = avg.indexOf(Math.max(...avg));
    const again = H.per[2] + H.per[3] + H.per[4];

    const facts = `<ul class="facts">
      <li><b>${N(named.length)} coaches</b>${H.principals.length ? `, ${N(H.principals.length)} principals` : ''}${H.hidden ? ` and ${N(H.hidden)} other observers` : ''} held ${N(H.n)} HITL observations of ${N(H.observed)} teachers (${P1(ratio(H.observed, H.teachers))} of ${N(H.teachers)} primary teachers).</li>
      ${top ? `<li>Most observations: <b>${esc(top.name)}</b> with ${N(top.n)} observations of ${N(top.teachers)} teachers.</li>` : ''}
      <li><b>${N(H.per[0])} teachers</b> have not had a HITL observation in this period; ${N(again)} (${P1(ratio(again, H.observed))} of those observed) have had two or more.</li>
      <li><b>${P1(ratio(H.stage.C || 0, H.n))}</b> of observations are debriefed; ${N(H.stage.P || 0)} wait for the debrief and ${N(H.stage.A || 0)} for the coach's review.</li>
      ${edited ? `<li>Coaches changed the AI's scores on <b>${P1(ratio(E.r, edited))}</b> of observations, rewrote only the written feedback on ${P1(ratio(E.n, edited))}, and submitted ${P1(ratio(E.u, edited))} unchanged.</li>` : ''}
      <li><b>${WD[busiest]}</b> is the busiest day (${avg[busiest].toFixed(1)} observations a day on average).</li>
    </ul>`;

    const per = card('c-hp', 'Observations per teacher', `How many HITL observations each primary teacher had · ${esc(scopeName())} · ${periodText()}.`,
      chart(['None', '1', '2', '3', '4 or more'].map((l, i) => ({ label: l, values: [H.per[i]] })), [{ name: 'Teachers', color: NAVY }]));
    const days = card('c-hw', 'Day of the week', `Average HITL observations per day · ${periodText()}.`,
      chart(WD.map((w, i) => ({ label: w.slice(0, 3), values: [avg[i]] })), [{ name: 'Observations per day, on average', color: NAVY }], 'bar', (v) => v.toFixed(1)));

    const form = card('c-hf', "How coaches use the AI's form",
      "The AI listens to the lesson and fills in the whole HITL form first; the coach then reviews it and submits. <b>Changed scores</b> = the coach rescored at least one FICO indicator; <b>Feedback only</b> = rewrote the written feedback but kept every score; <b>Unchanged</b> = submitted the AI's form as it was. This shows how coaches work, not how good they are.",
      splitBar([['Changed scores', E.r, NAVY], ['Feedback only', E.n, '#F2C89A'], ['Unchanged', E.u, '#BBB']].filter((x) => x[1]), edited || 1));

    const ccols = [
      { k: 'name', label: 'Coach', val: (r) => r.name, fmt: (r) => `${esc(r.name)}${r.role && r.role !== 'coach' ? ` <span class="dim">(${esc(r.role)})</span>` : ''}` },
      { k: 'sector', label: 'Main sector', title: 'The sector where most of this coach’s observations are', val: (r) => r.sector, fmt: (r) => esc(r.sector) },
      { k: 'n', label: 'HITL observations', num: true, val: (r) => r.n, fmt: (r) => N(r.n) },
      { k: 'teachers', label: 'Teachers observed', num: true, val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
      { k: 'schools', label: 'Schools', num: true, val: (r) => r.schools, fmt: (r) => N(r.schools) },
      { k: 'deb', label: 'Debriefed', num: true, val: (r) => r.C / r.n, fmt: (r) => cov(ratio(r.C, r.n)) },
      { k: 'resc', label: 'Changed scores', num: true, title: "Share of the coach's observations where they rescored the AI", val: (r) => r.r / r.n, fmt: (r) => P1(ratio(r.r, r.n)) },
      { k: 'unch', label: 'Unchanged', num: true, title: "Share submitted exactly as the AI filled it", val: (r) => r.u / r.n, fmt: (r) => P1(ratio(r.u, r.n)) },
      ...DC_SECS.map(([k, l]) => ({ k, label: l, num: true, title: 'Average score this coach gave', val: (r) => sp(r, k), fmt: (r) => sc(sp(r, k)) })),
    ];
    const coaches = card('c-hc', 'By coach',
      `Each coach's HITL observations of primary teachers. Click a coach to see their schools, teachers and debrief reports · ${esc(scopeName())} · ${periodText()}. Contains coach names — internal use only. Sorted by observations: that is activity, not quality.${H.principals.length ? ' Principals have their own table below.' : ''}${H.hidden ? ` ${N(H.hidden)} other accounts with only a handful of visits are not listed; their observations still count in every total.` : ''} Scores are what the coach gave, so they also reflect the teachers each coach observes.${H.hasCoachList ? '' : ' Coach names are not loaded yet: the dashboard may still be refreshing.'}`,
      table('hc', ccols, H.coaches, { sort: { k: 'n', dir: -1 }, onRow: (k) => modalOpen({ kind: 'coach', key: k }), rowKey: (r) => r.key }));

    const P0 = H.principals, pn = P0.reduce((a, c) => a + c.n, 0);
    const pcols = [
      { k: 'name', label: 'Principal', val: (r) => r.name, fmt: (r) => esc(r.name) },
      { k: 'school', label: 'Main school', title: 'The school where most of this principal’s observations are', val: (r) => r.school, fmt: (r) => esc(r.school) },
      ...ccols.slice(1),
    ];
    const principals = P0.length ? card('c-hpr', 'Principals doing HITL',
      `School principals who held HITL observations of their primary teachers · ${esc(scopeName())} · ${periodText()}. ${N(P0.length)} principals held ${N(pn)} observations (${P1(ratio(pn, H.n))} of all HITL). They are counted in every HITL total above, but not in the coach table. Contains names — internal use only.`,
      table('hpr', pcols, P0, { sort: { k: 'n', dir: -1 }, onRow: (k) => modalOpen({ kind: 'coach', key: k }), rowKey: (r) => r.key }))
      : card('c-hpr', 'Principals doing HITL', `No principal held a HITL observation in ${periodText()}.`, '');

    const D = Calc.dcStats(S.P, sel(), 'H');
    const G = D.gsrc;
    const gcols = [
      { k: 'name', label: 'Grade', val: (r) => r.ord, fmt: (r) => esc(r.key) },
      { k: 'n', label: 'HITL observations', num: true, val: (r) => r.n, fmt: (r) => N(r.n) },
      { k: 'teachers', label: 'Teachers', num: true, val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
      ...DC_SECS.map(([k, l]) => ({ k, label: l, num: true, val: (r) => sp(r, k), fmt: (r) => sc(sp(r, k)) })),
    ];
    const grades = card('c-hg', 'By grade',
      `Grade of the observed lesson, taken in this order: the Rumi lesson plan attached (${P1(ratio(G.r, D.n))}); a clear grade typed in the plan (${P1(ratio(G.t, D.n))}); otherwise the teacher's classes on the roster (${P1(ratio(G.roster, D.n))}), where a teacher on two grades counts in both. ${P1(ratio(G.none, D.n))} have no grade (Grade unknown). <b>Provisional</b>: the plan grade is not yet a governed rule. HITL observations are not split by subject: only about one in ten records the subject.`,
      `<span class="lbl">Where the grade comes from</span>${splitBar([['Rumi plan', G.r, NAVY], ['Typed in plan', G.t, '#F2C89A'], ["Teacher's roster", G.roster, '#5B6B85'], ['Unknown', G.none, '#BBB']].filter((x) => x[1]), D.n)}`
      + table('hg', gcols, D.grades, { noLegend: true }));

    return `<div class="sec-h"><h2>HITL analytics</h2><p class="note">${N(H.n)} HITL observations of ${N(H.observed)} teachers · ${esc(scopeName())} · ${periodText()}. In-person coach observations only — never added to DC observations.</p></div>`
      + card('c-hx', 'What stands out', '', facts)
      + `<div class="cards2">${per}${days}</div>` + form + coaches + principals + grades;
  }

  // ---------- /observe2 pilot (fico17) ----------
  const SEEN = { recall: 'Repeated or copied it', new: 'Solved a new problem', why: 'Explained why', apply: 'Applied it', ownq: 'Asked their own question' };
  const LVL = [['1', 'Level 1', 'var(--t1)'], ['2', 'Level 2', 'var(--t2)'], ['3', 'Level 3', 'var(--t3)'], ['4', 'Level 4', 'var(--t4)'], ['n', 'Not applicable', '#CFCFCF'], ['i', 'Couldn’t tell', '#9AA0A6']];
  const o2Name = (id) => (id === 'plan' ? 'The lesson plan' : (Calc.O2.find((x) => x[0] === id) || [id, id])[1]);
  function viewObserve2() {
    const O = Calc.observe2Stats(S.P, sel());
    const about = "<code>/observe2</code> is the impact team's experiment, running beside the main HITL flow (<code>/observe</code>) since 9 Oct 2026. The coach scores <b>17 indicators</b> themselves on the impact team's workbook, each at level 1–4 (or not applicable / couldn't tell), and Rumi only proposes evidence. The coach then picks one thing for the teacher to <b>work on first</b>. Its indicators share letters with FICO but measure different things, so nothing here is added to HITL or FICO figures.";
    if (!O) return card('c-o2', `/observe2 pilot · ${esc(scopeName())}`, 'Not available yet: the dashboard may still be refreshing after an update. This appears by itself when it finishes.', '');
    if (!O.n) return card('c-o2', `/observe2 pilot · ${esc(scopeName())} · ${periodText()}`, `${about}<br><br>No /observe2 observations in this period.`, '');
    const avg = (x) => (x.k ? x.sum / x.k : null);
    const scored = O.ind.filter((x) => x.k >= 10).map((x) => ({ ...x, a: avg(x) })).sort((a, b) => a.a - b.a);
    const low = scored.slice(0, 3), high = scored.slice(-3).reverse();
    const naAll = O.ind.reduce((s, x) => s + x.c.n + x.c.i, 0);
    const p0 = O.prio[0];
    const recall = (O.seen.find((x) => x[0] === 'recall') || [0, 0])[1];
    const facts = `<ul class="facts">
      <li><b>${N(O.n)} /observe2 observations</b> of ${N(O.teachers)} teachers in ${N(O.schools)} schools by ${N(O.coachCount)} coaches; ${P1(ratio(O.C, O.n))} are debriefed.</li>
      ${low.length ? `<li><b>Weakest areas</b> (lowest average level): ${low.map((x) => `${esc(x.name)} (${x.a.toFixed(1)})`).join(', ')}.</li>` : ''}
      ${high.length ? `<li><b>Strongest areas</b>: ${high.map((x) => `${esc(x.name)} (${x.a.toFixed(1)})`).join(', ')}.</li>` : ''}
      ${p0 ? `<li>Coaches most often ask teachers to <b>work on ${esc(o2Name(p0[0]).toLowerCase())}</b> first (${P1(ratio(p0[1], O.n))} of observations)${O.prio[1] ? `, then ${esc(o2Name(O.prio[1][0]).toLowerCase())} (${P1(ratio(O.prio[1][1], O.n))})` : ''}.</li>` : ''}
      ${O.withSeen ? `<li>Where the coach noted the children's thinking (${N(O.withSeen)} observations), children mostly <b>repeated or copied</b> (${P1(ratio(recall, O.withSeen))}); explaining why, applying it or asking their own questions were seen far less.</li>` : ''}
      <li>${P1(ratio(naAll, O.n * 17))} of indicator ratings were "not applicable" or "couldn't tell".</li>
      ${O.overallChange && O.overallChange.k >= 3 ? `<li><b>${N(O.repeat)} teachers</b> have had more than one /observe2 observation; their overall score moved ${O.overallChange.d >= 0 ? 'up' : 'down'} ${Math.abs(O.overallChange.d).toFixed(1)} points from first to latest observation on average${O.overallChange.k < 20 ? ' (few repeat observations so far)' : ''}.</li>` : `<li>${O.repeat ? `Only ${N(O.repeat)} teacher${O.repeat === 1 ? ' has' : 's have'} had a second /observe2 observation so far, too few to measure change.` : 'No teacher has had a second /observe2 observation yet, so there is no change to measure.'}</li>`}
    </ul>`;

    const kpis = `<div class="kpis">${kpi('/observe2 observations', N(O.n), 'conducted and scored')}${kpi('Teachers observed', N(O.teachers), `different teachers · ${N(O.schools)} schools`)}${kpi('Coaches using it', N(O.coachCount))}
      ${kpi('Debriefed', P1(ratio(O.C, O.n)), `${N(O.C)} of ${N(O.n)}`)}${kpi('Average overall score', O.pct === null ? '—' : P1(O.pct), 'on the fico17 scale')}${kpi('Observed more than once', N(O.repeat), 'teachers')}</div>`;

    const trend = O.weeks.length ? chart(O.weeks.map((w) => ({ label: `w/c ${nice(w.from)}`, values: [w.n, w.teachers] })), [{ name: '/observe2 observations', color: NAVY }, { name: 'Teachers observed', color: GREY }]) : '';

    const groups = ['C', 'D', 'F'].map((g) => {
      const rows = O.ind.filter((x) => x.group === g).map((x) => {
        const tot = Object.values(x.c).reduce((s, v) => s + v, 0) || 1;
        const a = avg(x);
        const ch = O.change[Calc.O2.findIndex((y) => y[0] === x.id)];
        return `<div class="o2r"><div class="o2n"><b>${x.id}</b> ${esc(x.name)}</div>
          <div class="mbar">${LVL.map(([k, l, c]) => (x.c[k] ? `<span style="width:${(100 * x.c[k]) / tot}%;background:${c}" title="${l}: ${N(x.c[k])} (${P1(ratio(x.c[k], tot))})"></span>` : '')).join('')}</div>
          <div class="o2v">${a === null ? '—' : `<span class="sc ${band((100 * a) / 4)}">${a.toFixed(1)} / 4</span>`}${ch ? `<span class="${ch.d >= 0 ? 'up' : 'down'}" title="Average change from first to latest observation, ${N(ch.k)} teachers">${ch.d >= 0 ? '▲' : '▼'}${Math.abs(ch.d).toFixed(1)}</span>` : ''}</div></div>`;
      }).join('');
      return `<div class="o2g"><span class="lbl">${g} · ${esc(Calc.O2_GROUP[g])}</span>${rows}</div>`;
    }).join('');
    const lvlLegend = `<div class="legend">${LVL.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;

    const maxP = Math.max(1, ...O.prio.map((x) => x[1]));
    const prio = `<div class="ladder">${O.prio.map(([id, k]) => `<div class="lrow"><div class="ll"><span>${esc(o2Name(id))}</span><span>${id === 'plan' ? '' : `${id} · `}also picked ${N((O.also.find((x) => x[0] === id) || [0, 0])[1])} times</span></div>
      <div class="lbar"><div style="width:${(100 * k) / maxP}%;background:${NAVY}"></div></div><span class="lpct">${N(k)}</span></div>`).join('')}</div>`;
    const seen = O.withSeen ? `<div class="ladder">${O.seen.map(([k, v]) => `<div class="lrow"><div class="ll"><span>${esc(SEEN[k] || k)}</span><span>${P1(ratio(v, O.withSeen))} of observations</span></div>
      <div class="lbar"><div style="width:${(100 * v) / O.withSeen}%;background:${C1}"></div></div><span class="lpct">${N(v)}</span></div>`).join('')}</div>` : '<p class="note">Not recorded yet.</p>';

    const ccols = [
      { k: 'name', label: 'Coach', val: (r) => coachLabel(r.key), fmt: (r) => esc(coachLabel(r.key)) },
      { k: 'sector', label: 'Main sector', val: (r) => r.sector, fmt: (r) => esc(r.sector) },
      { k: 'n', label: 'Observations', num: true, val: (r) => r.n, fmt: (r) => N(r.n) },
      { k: 'teachers', label: 'Teachers', num: true, val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
      { k: 'deb', label: 'Debriefed', num: true, val: (r) => r.C / r.n, fmt: (r) => cov(ratio(r.C, r.n)) },
      { k: 'pct', label: 'Average overall score', num: true, val: (r) => r.pct, fmt: (r) => sc(r.pct) },
      { k: 'na', label: 'Not applicable / couldn’t tell', num: true, title: 'Share of indicator ratings left out', val: (r) => r.na, fmt: (r) => P1(r.na) },
      { k: 'prio', label: 'Most chosen focus', val: (r) => r.prio, fmt: (r) => esc(r.prio ? o2Name(r.prio) : '—') },
    ];
    const scols = [
      { k: 'name', label: 'Sector', val: (r) => r.key, fmt: (r) => esc(r.key) },
      { k: 'n', label: 'Observations', num: true, val: (r) => r.n, fmt: (r) => N(r.n) },
      { k: 'teachers', label: 'Teachers', num: true, val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
      { k: 'coaches', label: 'Coaches', num: true, val: (r) => r.coaches, fmt: (r) => N(r.coaches) },
      { k: 'pct', label: 'Average overall score', num: true, val: (r) => r.pct, fmt: (r) => sc(r.pct) },
    ];
    return card('c-o2', `/observe2 pilot · ${esc(scopeName())} · ${periodText()}`, about, kpis)
      + card('c-o2l', 'What we are learning', 'Read from the observations so far. The pilot is young, so treat these as early signals.', facts)
      + `<div class="cards2">${card('c-o2t', 'Progress by week', 'Observations and teachers observed each week since the pilot began.', trend)}${card('c-o2s', 'By sector', '', table('o2s', scols, O.sectors, { sort: { k: 'n', dir: -1 }, noLegend: true }))}</div>`
      + card('c-o2i', 'The 17 indicators', `How coaches rated each indicator across ${N(O.n)} observations. Bars show the share at each level; the number is the average level (out of 4, leaving out "not applicable" and "couldn't tell"). Arrows show the average change from a teacher’s first to latest observation, where they had more than one.`, `${lvlLegend}<div class="o2">${groups}</div>`)
      + `<div class="cards2">${card('c-o2p', 'What to work on first', 'The one thing the coach asked the teacher to work on first, by how often it was chosen.', prio)}${card('c-o2c', "Children's thinking the coach saw", `Share of the ${N(O.withSeen)} observations where the coach noted it. One can show more than one.`, seen)}</div>`
      + card('c-o2co', 'By coach', 'Contains coach names — internal use only. Observation counts are activity, not quality; scores also reflect which teachers each coach observes.', table('o2co', ccols, O.coaches, { sort: { k: 'n', dir: -1 } }))
      + pilotStudy();
  }

  // The pilot read against its study design (7 Oct 2026): progress, then the four questions it asks.
  function pilotStudy() {
    const Q = Calc.pilotStats(S.P, sel());
    const head = `<div class="sec-h"><h2>Pilot study: does a FICO score mean the same whoever produces it?</h2><p class="note">Read against the field team's study design of 7 Oct 2026: 6 regions, 2 coaches each (12), 2 schools per region, about 96 teachers, every teacher observed by both coaches a week apart, and 3 joint lessons per school in week 1 where both coaches watch the same lesson. Built from the pilot's field forms, which record the coach's provisional ratings (sealed before the DC check), the DC's own ratings (never shown to the coach), the coach's marks on the DC's evidence, and the final ratings. <b>Provisional</b>: these forms are not yet covered by the data rules. This tests the tool, not coaches or teachers.</p></div>`;
    if (!Q) return head + card('c-ps0', 'Pilot study', 'Not available yet: the dashboard may still be refreshing after an update.', '');
    if (!Q.forms) return head + card('c-ps0', 'Pilot study', `No pilot field forms in ${periodText()}.`, '');
    const pctOr = (v) => (v === null ? '<span class="dim">—</span>' : P1(100 * v));   // v is a 0-1 share
    const agreeCell = (a) => (a.n ? `${sc(100 * a.exact)} <span class="dim">n=${N(a.n)}</span>` : '<span class="dim">—</span>');

    const progress = card('c-ps1', 'Progress against the design', `Field forms ${periodText()}. Targets are the design's; "both coaches" = a teacher with final ratings from two different coaches on different days; "joint lessons" = two coaches' final ratings for the same teacher on the same day.`,
      `<div class="kpis">${kpi('Coaches', `${N(Q.coaches)} <span class="dim">/ 12</span>`)}${kpi('Regions', `${N(Q.sectors)} <span class="dim">/ 6</span>`)}${kpi('Teachers', `${N(Q.teachers)} <span class="dim">/ ~96</span>`)}
        ${kpi('Visits with final ratings', N(Q.done), `${N(Q.sealedOnly)} sealed, waiting for the DC check · ${N(Q.open)} still open`)}
        ${kpi('Teachers seen by both coaches', `${N(Q.cross)} <span class="dim">/ ~96</span>`)}${kpi('Joint lessons', `${N(Q.joint)} <span class="dim">/ 36</span>`)}</div>`
      + table('ps1', [
        { k: 'name', label: 'Region', val: (r) => r.key, fmt: (r) => esc(r.key === '(no sector)' ? 'No school recorded (practice or test forms?)' : r.key) },
        { k: 'coaches', label: 'Coaches', num: true, val: (r) => r.coaches, fmt: (r) => `${N(r.coaches)} <span class="dim">/ 2</span>` },
        { k: 'teachers', label: 'Teachers', num: true, val: (r) => r.teachers, fmt: (r) => `${N(r.teachers)} <span class="dim">/ ~16</span>` },
        { k: 'forms', label: 'Field forms', num: true, val: (r) => r.forms, fmt: (r) => N(r.forms) },
        { k: 'done', label: 'With final ratings', num: true, val: (r) => r.done, fmt: (r) => N(r.done) },
        { k: 'both', label: 'Seen by both coaches', num: true, val: (r) => r.both, fmt: (r) => N(r.both) },
        { k: 'joint', label: 'Joint lessons', num: true, val: (r) => r.joint, fmt: (r) => `${N(r.joint)} <span class="dim">/ 6</span>` },
      ], Q.bySector, { sort: { k: 'forms', dir: -1 }, noLegend: true }));

    const dcInd = Q.ind.filter((x) => x.dcRates), roomInd = Q.ind.filter((x) => !x.dcRates);
    const q1 = card('c-ps2', '1 · Which indicators can the DC score well?',
      `The DC rates only what it can hear. Its rating (never shown to the coach) is compared with the coach's <b>final</b> rating. "Same level" = exact match; "within one" = at most one level apart; a positive lean means the DC rates higher than the coach. The coach's final rating comes after seeing the DC's evidence, so this may flatter the DC a little. The cleaner test, against the coach's rating before the check, is not possible yet: the form keeps the coach's provisional answers and priority but not provisional levels.`,
      table('ps2', [
        { k: 'name', label: 'Indicator', val: (r) => r.id, fmt: (r) => `<b>${r.id}</b> ${esc(r.name)}` },
        { k: 'ex', label: 'Same level as the coach', num: true, val: (r) => r.dcVsFinal.exact, fmt: (r) => agreeCell(r.dcVsFinal) },
        { k: 'w1', label: 'Within one level', num: true, val: (r) => r.dcVsFinal.within1, fmt: (r) => pctOr(r.dcVsFinal.within1) },
        { k: 'lean', label: 'DC lean', num: true, title: 'Average DC level minus coach level', val: (r) => r.dcVsFinal.diff, fmt: (r) => (r.dcVsFinal.diff === null ? '—' : `${r.dcVsFinal.diff >= 0 ? '+' : ''}${r.dcVsFinal.diff.toFixed(2)}`) },
      ], dcInd, { sort: { k: 'ex', dir: -1 }, noLegend: true })
      + `<p class="note"><b>Needs a coach in the room</b> — the DC does not rate these from the recording: ${roomInd.map((x) => `${x.id} ${esc(x.name)}`).join(' · ')}.</p>`);

    const evAll = Q.ev.reduce((s, e) => s + e.yes + e.no, 0), evNo = Q.ev.reduce((s, e) => s + e.no, 0);
    const KIND = { ask: 'Questions asked', explain: 'Children explaining', wrong: 'Wrong answers handled', work: 'Children working' };
    const q2 = card('c-ps3', '2 · Does the DC evidence check help, and is its evidence right?',
      `After sealing, the coach sees the evidence the DC found (never its ratings) and marks each item. "Rejected" = the coach said the item was wrong. Whether accepted items were truly right is checked later by the expert panels from the recordings, which are not in this data yet.`,
      `<div class="kpis">${kpi('Evidence items per visit', Q.done ? (evAll / Q.done).toFixed(1) : '—', `${N(evAll)} items on ${N(Q.done)} visits`)}${kpi('Rejected by coaches', P1(ratio(evNo, evAll)), `${N(evNo)} items`)}
        ${kpi('Visits where the DC filled a gap', P1(ratio(Q.holes, Q.done)), 'evidence the coach had not recorded')}
        ${kpi('Priority changed after the check', P1(ratio(Q.prio.changed, Q.prio.n)), `${N(Q.prio.changed)} of ${N(Q.prio.n)} · sealed → final`)}</div>
      <span class="lbl">Coaches' marks by kind of evidence</span>${table('ps3a', [
        { k: 'name', label: 'Evidence', val: (r) => r.kind, fmt: (r) => esc(KIND[r.kind]) },
        { k: 'n', label: 'Items', num: true, val: (r) => r.yes + r.no, fmt: (r) => N(r.yes + r.no) },
        { k: 'no', label: 'Rejected', num: true, val: (r) => r.no / ((r.yes + r.no) || 1), fmt: (r) => P1(ratio(r.no, r.yes + r.no)) },
      ], Q.ev, { noLegend: true })}
      <p class="note">How much ratings move because of the check cannot be measured yet: the form does not keep the coach's provisional levels, only the provisional answers and priority.</p>`);

    const pj = Q.prioJoint, pc = Q.prioCross;
    const q3 = card('c-ps4', '3 · Does a teacher get the same priority whoever observes them?',
      `<b>Joint lessons</b>: two coaches in the same lesson, rating alone. Any disagreement there is between coaches, not lessons. <b>Both coaches</b>: the same teacher seen by each coach in different weeks, so lessons differ too. The gap between the two columns is roughly how much comes from the lesson rather than the coach.`,
      `<div class="kpis">${kpi('Same priority — joint lessons', pj.n ? P1(ratio(pj.same, pj.n)) : '—', `${N(pj.n)} lessons`)}${kpi('Same priority — different weeks', pc.n ? P1(ratio(pc.same, pc.n)) : '—', `${N(pc.n)} teachers`)}</div>`
      + table('ps4', [
        { k: 'name', label: 'Indicator', val: (r) => r.id, fmt: (r) => `<b>${r.id}</b> ${esc(r.name)}` },
        { k: 'j', label: 'Same level — joint lessons', num: true, val: (r) => r.joint.exact, fmt: (r) => agreeCell(r.joint) },
        { k: 'c', label: 'Same level — different weeks', num: true, val: (r) => r.cross.exact, fmt: (r) => agreeCell(r.cross) },
      ], Q.ind, { noLegend: true }));

    const rp = Q.ind.filter((x) => x.repeat.n);
    const avgRep = rp.length ? rp.reduce((s, x) => s + x.repeat.exact, 0) / rp.length : null;
    const q4 = card('c-ps5', '4 · How many observations does a fair picture take?',
      `First and latest final ratings for teachers observed more than once (${N(Q.repeat)} teachers), whoever observed. The less a teacher's level repeats from one visit to the next, the more visits a fair picture needs. The full answer needs the week-3 remote scoring and re-scoring, which are not in this data yet.`,
      `<div class="kpis">${kpi('Same level on both visits', pctOr(avgRep), 'average across indicators')}</div>`
      + table('ps5', [
        { k: 'name', label: 'Indicator', val: (r) => r.id, fmt: (r) => `<b>${r.id}</b> ${esc(r.name)}` },
        { k: 'ex', label: 'Same level on both visits', num: true, val: (r) => r.repeat.exact, fmt: (r) => agreeCell(r.repeat) },
        { k: 'w1', label: 'Within one level', num: true, val: (r) => r.repeat.within1, fmt: (r) => pctOr(r.repeat.within1) },
      ], Q.ind, { sort: { k: 'ex', dir: 1 }, noLegend: true }));

    const fidAll = Q.fid.reduce((s, v) => s + v, 0);
    const flow = card('c-ps6', 'How the visit steps are going',
      'Timings are medians. Lesson-plan steps are the DC\'s verdicts on each planned step, as reviewed by the coach.',
      `<div class="kpis">${kpi('Open → sealed', Q.minSeal === null ? '—' : `${N(Q.minSeal)} min`, 'lesson and provisional ratings')}${kpi('Sealed → final', Q.minCheck === null ? '—' : `${N(Q.minCheck)} min`, 'DC evidence check')}
        ${kpi('Linked to a recording', P1(ratio(Q.linked, Q.forms)), `${N(Q.linked)} of ${N(Q.forms)} forms`)}</div>
      ${fidAll ? `<span class="lbl">Lesson-plan steps</span>${splitBar([['Done', Q.fid[0], 'var(--t4)'], ['Partly', Q.fid[1], 'var(--t2)'], ['Not done', Q.fid[2], 'var(--t1)'], ['Done differently', Q.fid[3], '#8FB8DE'], ['Could not judge', Q.fid[4], '#BBB']].filter((x) => x[1]), fidAll)}` : ''}
      <p class="note">Not in this data yet: remote scoring by coaches from other regions, re-scoring from recordings, the expert panels and the coordinator's list of core teachers.</p>`);

    return head + progress + q1 + q2 + q3 + q4 + flow;
  }

  // ---------- learning assessment (EGRA / EGMA child test) ----------
  // The server keeps the per-test records and sends masked aggregates only; groups under five children show "fewer than 5".
  function viewEgra() {
    const o = sel();
    const q = new URLSearchParams({ from: String(o.from), to: String(o.to), sector: o.sector || '', school: o.school === undefined || o.school === null ? '' : String(o.school) }).toString();
    setTimeout(() => loadEgra(q), 0);
    return card('c-eg0', `Learning assessment · ${esc(scopeName())} · ${periodText()}`,
      'Coaches visit a school, the app draws children at random from a class, and each child takes a short reading and maths test on the coach\'s phone: <b>Urdu reading (EGRA), English reading (EGRA) and maths (EGMA)</b>. Running in the portal since 22 Oct 2026 as a small pilot. Counts and shares only — no child is ever listed, and any group of fewer than 5 children shows "fewer than 5" with no figures. <b>The benchmarks are the results page\'s proposed ones, not ratified, and every score is the AI\'s or the phone\'s — no coach has checked a mark yet.</b>',
      `<div id="egra-root" data-q="${esc(q)}"><p class="note">Loading…</p></div>`);
  }

  async function loadEgra(q) {
    const box = $('#egra-root');
    if (!box || box.dataset.q !== q) return;
    let E;
    try { E = await (await fetch(`/api/egra?${q}`)).json(); } catch (e) { E = null; }
    if (!box.isConnected || box.dataset.q !== q) return;
    if (!E || !E.ready) { box.innerHTML = '<p class="note">Not available yet: the dashboard may still be refreshing after an update. Try again shortly.</p>'; return; }
    const A = E.all;
    const leftOut = E.excluded ? ` ${N(E.excluded)} test${E.excluded === 1 ? ' was' : 's were'} run from test accounts or at the practice school in this period and ${E.excluded === 1 ? 'is' : 'are'} left out.` : '';
    if (!A.children) { box.innerHTML = `<p class="note">0 children counted in ${periodText()}.${leftOut || ' Testing started on 22 Oct 2026.'}</p>`; return; }
    if (A.masked) { box.innerHTML = `<p class="note">Fewer than 5 children were tested in this selection, so no figures are shown. Widen the period, sector or school.${leftOut}</p>`; return; }
    const pc = (a, b) => (b ? P1(ratio(a, b)) : '—');
    const BAND = [['Non-reader (0)', 'var(--t1)'], ['Beginning (under 20)', 'var(--t2)'], ['Developing (20–39)', 'var(--t3)'], ['Fluent (40+)', 'var(--t4)']];
    const reading = (L, name) => `<div><span class="lbl">${name}</span>
      ${L.scored ? splitBar(BAND.map(([l, c], i) => [l, L.bands[i], c]).filter((x) => x[1]), L.scored) : '<p class="note">No passage scored yet.</p>'}
      <div class="kpis">${kpi('Median words a minute', L.median === null ? '—' : L.median.toFixed(0), `${N(L.scored)} passages scored`)}${kpi('Read with understanding', pc(L.compMet, L.compScored), `80%+ of questions right · ${N(L.compScored)} scored`)}${kpi('Could not read a word', pc(L.bands[0], L.scored), 'of passages scored')}</div></div>`;
    const sample = Object.entries(E.sample || {}).sort((a, b) => b[0].localeCompare(a[0]))[0];
    const sm = sample ? sample[1] : null, drawn = sm ? Object.values(sm).reduce((s, v) => s + v, 0) : 0;
    const head = `<div class="kpis">${kpi('Children tested', N(A.children), `${N(A.completed)} finished every part`)}${kpi('Schools', N(E.schools))}
      ${sm ? kpi(`Sample for ${esc(sample[0])}`, N(drawn), `drawn at random · ${N(sm.tested || 0)} tested · ${N(sm.absent || 0)} absent · ${N(sm.refused || 0)} refused`) : ''}
      ${kpi('Another voice heard', N(A.voice), 'tests where someone else spoke during a reading; that score may include help')}</div>
      ${leftOut ? `<p class="note">${leftOut.trim()}</p>` : ''}`;

    const days = E.days.length ? chart(E.days.map((x) => ({ label: nice(x.d), values: [typeof x.children === 'number' ? x.children : null] })), [{ name: 'Children tested', color: NAVY }])
      + (E.days.some((x) => typeof x.children !== 'number') ? '<p class="note">Days with fewer than 5 children are left blank.</p>' : '') : '';

    const taskRows = A.tasks.filter((t) => t.scored);
    const tcols = [
      { k: 'area', label: 'Subject', val: (r) => r.area, fmt: (r) => esc(r.area) },
      { k: 'name', label: 'Skill', val: (r) => r.label, fmt: (r) => esc(r.label) },
      { k: 'v', label: 'Result', num: true, val: (r) => (r.rate ? r.median : r.pct), fmt: (r) => (r.rate ? `${r.median === null ? '—' : r.median.toFixed(0)} <span class="dim">median a minute</span>` : sc(r.pct)) },
      { k: 'n', label: 'Children scored', num: true, val: (r) => r.scored, fmt: (r) => N(r.scored) },
    ];
    const gcols = (what) => [
      { k: 'name', label: what, val: (r) => r.key, fmt: (r) => esc(r.key) },
      { k: 'children', label: 'Children', num: true, val: (r) => (r.masked ? -1 : r.children), fmt: (r) => (r.masked ? '<span class="dim">fewer than 5</span>' : N(r.children)) },
      { k: 'urf', label: 'Urdu: fluent', num: true, title: '40+ correct words a minute', val: (r) => (r.masked || !r.ur.scored ? null : r.ur.bands[3] / r.ur.scored), fmt: (r) => (r.masked ? '' : pc(r.ur.bands[3], r.ur.scored)) },
      { k: 'urc', label: 'Urdu: reads with understanding', num: true, val: (r) => (r.masked || !r.ur.compScored ? null : r.ur.compMet / r.ur.compScored), fmt: (r) => (r.masked ? '' : pc(r.ur.compMet, r.ur.compScored)) },
      { k: 'enf', label: 'English: fluent', num: true, val: (r) => (r.masked || !r.en.scored ? null : r.en.bands[3] / r.en.scored), fmt: (r) => (r.masked ? '' : pc(r.en.bands[3], r.en.scored)) },
      { k: 'enc', label: 'English: reads with understanding', num: true, val: (r) => (r.masked || !r.en.compScored ? null : r.en.compMet / r.en.compScored), fmt: (r) => (r.masked ? '' : pc(r.en.compMet, r.en.compScored)) },
      { k: 'ma', label: 'Maths: met every benchmark', num: true, val: (r) => (r.masked || !r.maths.scored ? null : r.maths.met / r.maths.scored), fmt: (r) => (r.masked ? '' : pc(r.maths.met, r.maths.scored)) },
    ];
    box.innerHTML = head
      + `<section class="card" id="c-eg1"><div class="card-h"><h2>Reading</h2><button class="dl" data-dl="c-eg1">Download image</button></div>
        <p class="note">Passage reading is judged by correct words a minute: non-reader 0, beginning under 20, developing 20 to under 40, fluent 40 or more. "Read with understanding" = at least 80% of the questions about the passage right. A recording still waiting for the AI scorer is left out, never counted as 0.</p>
        <div class="grid">${reading(A.ur, 'Urdu')}${reading(A.en, 'English')}</div></section>`
      + `<section class="card" id="c-eg2"><div class="card-h"><h2>Maths</h2></div>
        <div class="kpis">${kpi('Met the benchmark on every maths task', pc(A.maths.met, A.maths.scored), `75% right on each task scored · ${N(A.maths.scored)} children`)}${kpi('Number fluency', A.maths.fluencyMedian === null ? '—' : `${A.maths.fluencyMedian.toFixed(0)} a minute`, `median · ${N(A.maths.fluencyScored)} children`)}</div></section>`
      + `<section class="card" id="c-eg3"><div class="card-h"><h2>Skills</h2></div><p class="note">Average share of answers right on each part of the test (words a minute for the timed parts). Sort by any column.</p>
        ${legend().replace('<span><i class="zero"></i>None in this period</span>', '')}${table('eg3', tcols, taskRows, { noLegend: true })}</section>`
      + `<section class="card" id="c-eg4"><div class="card-h"><h2>By grade</h2></div>${table('eg4', gcols('Grade'), E.grades, { noLegend: true })}</section>
        <section class="card" id="c-eg5"><div class="card-h"><h2>By sector</h2></div>${table('eg5', gcols('Sector'), E.sectors, { noLegend: true })}</section>`
      + `<section class="card" id="c-eg6"><div class="card-h"><h2>Children tested each day</h2></div>${days}</section>`;
    drawCharts(box);
  }

  // ---------- leading the way / where support is most needed ----------
  // Two measures, never blended: using the tools (activity) and classroom practice (FICO, DC or HITL kept apart).
  const SPOT_N = { school: 10, teacher: 15 };
  const SPOT_MIN = { school: 3, schoolObs: 5, teacherObs: 2 };
  function viewSpotlight(R) {
    const lens = S.slens || 'tools';
    const share = (a, b) => (b ? (100 * a) / b : 0);
    const practice = (f, min) => (f.hlp[2] >= min && f.se[2] >= min ? (fpct(f.hlp) + fpct(f.se)) / 2 : null);
    const LENS = {
      tools: { label: 'Using the tools', short: 'using the tools', note: `<b>Schools</b>: the average of four shares of primary teachers — used a grade 1–5 lesson plan, recorded a DC lesson, had children take a lesson quiz, generated an exam paper (schools with at least ${SPOT_MIN.school} primary teachers). <b>Teachers</b>: how many of those four tools they used, then how much (plans + DC lessons + quiz sittings + exams).` },
      dc: { label: 'Classroom practice (Digital Coach)', short: 'classroom practice (Digital Coach)', note: `Average of the Teaching practices and Student engagement FICO scores from Digital Coach lessons. Schools need at least ${SPOT_MIN.schoolObs} scored lessons, teachers at least ${SPOT_MIN.teacherObs}.` },
      hitl: { label: 'Classroom practice (HITL)', short: 'classroom practice (HITL)', note: `Average of the Teaching practices and Student engagement FICO scores from coaches' HITL observations. Schools need at least ${SPOT_MIN.schoolObs} scored observations, teachers at least ${SPOT_MIN.teacherObs}. Never mixed with Digital Coach scores.` },
    };
    const schools = [...R.schools.values()].map((g) => {
      const Sx = S.data.schools[g.s];
      const parts = [share(g.g15, g.teachers), share(g.dcT, g.teachers), share(g.quizLT, g.teachers), share(g.exT, g.teachers)];
      const score = lens === 'tools' ? (g.teachers >= SPOT_MIN.school ? parts.reduce((a, b) => a + b, 0) / 4 : null)
        : practice(lens === 'dc' ? g.ficoD : g.ficoH, SPOT_MIN.schoolObs);
      return { key: g.s, name: Sx.name, sector: Sx.sector, teachers: g.teachers, score, parts, n: lens === 'dc' ? g.ficoD.hlp[2] : lens === 'hitl' ? g.ficoH.hlp[2] : g.teachers };
    }).filter((x) => x.score !== null);
    const teachers = R.teachers.map((t) => {
      const tools = (t.g15 ? 1 : 0) + (t.dc ? 1 : 0) + (t.sitL ? 1 : 0) + (t.exOk ? 1 : 0);
      const volume = t.plans + t.dc + t.sitL + t.exOk;
      const score = lens === 'tools' ? tools + Math.min(volume, 9999) / 10000 : practice(lens === 'dc' ? t.ficoD : t.ficoH, SPOT_MIN.teacherObs);
      return { key: t.i, name: t.name, school: S.data.schools[t.s].name, sector: S.data.schools[t.s].sector, tools, volume, score, t,
        n: lens === 'dc' ? t.ficoD.hlp[2] : lens === 'hitl' ? t.ficoH.hlp[2] : volume };
    }).filter((x) => x.score !== null);
    const top = (arr, k) => arr.slice().sort((a, b) => b.score - a.score || b.n - a.n).slice(0, k);
    const low = (arr, k) => arr.slice().sort((a, b) => a.score - b.score || b.n - a.n).slice(0, k);

    const scoreCell = (r) => (lens === 'tools' ? sc(r.score) : sc(r.score));
    const schoolCols = [
      { k: 'rank', label: '#', num: true, val: (r) => r.rank, fmt: (r) => N(r.rank) },
      { k: 'name', label: 'School', val: (r) => r.name, fmt: (r) => esc(r.name) },
      { k: 'sector', label: 'Sector', val: (r) => r.sector, fmt: (r) => esc(r.sector) },
      { k: 'teachers', label: 'Primary teachers', num: true, val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
      { k: 'score', label: lens === 'tools' ? 'Tool use score' : 'Practice score', num: true, val: (r) => r.score, fmt: scoreCell },
      ...(lens === 'tools' ? [['Lesson plans', 0], ['DC', 1], ['Quizzes', 2], ['Exams', 3]].map(([l, i]) => ({ k: `p${i}`, label: l, num: true, title: '% of primary teachers', val: (r) => r.parts[i], fmt: (r) => P1(r.parts[i]) }))
        : [{ k: 'n', label: lens === 'dc' ? 'DC lessons scored' : 'HITL observations scored', num: true, val: (r) => r.n, fmt: (r) => N(r.n) }]),
    ];
    const teacherCols = [
      { k: 'rank', label: '#', num: true, val: (r) => r.rank, fmt: (r) => N(r.rank) },
      { k: 'name', label: 'Teacher', val: (r) => r.name, fmt: (r) => esc(r.name) },
      { k: 'school', label: 'School', val: (r) => r.school, fmt: (r) => esc(r.school) },
      { k: 'sector', label: 'Sector', val: (r) => r.sector, fmt: (r) => esc(r.sector) },
      ...(lens === 'tools' ? [
        { k: 'tools', label: 'Tools used (of 4)', num: true, val: (r) => r.tools, fmt: (r) => `${N(r.tools)} / 4` },
        { k: 'plans', label: 'Plans', num: true, val: (r) => r.t.plans, fmt: (r) => N(r.t.plans) },
        { k: 'dc', label: 'DC lessons', num: true, val: (r) => r.t.dc, fmt: (r) => N(r.t.dc) },
        { k: 'quiz', label: 'Quiz sittings', num: true, val: (r) => r.t.sitL, fmt: (r) => N(r.t.sitL) },
        { k: 'ex', label: 'Exams', num: true, val: (r) => r.t.exOk, fmt: (r) => N(r.t.exOk) },
      ] : [
        { k: 'score', label: 'Practice score', num: true, val: (r) => r.score, fmt: scoreCell },
        { k: 'n', label: lens === 'dc' ? 'DC lessons scored' : 'HITL observations scored', num: true, val: (r) => r.n, fmt: (r) => N(r.n) },
      ]),
    ];
    const ranked = (arr) => arr.map((x, i) => Object.assign(x, { rank: i + 1 }));
    const tbl = (id, cols, rows, level) => table(id, cols, ranked(rows), { noLegend: true, onRow: level === 'school' ? (k) => modalOpen({ kind: 'school', key: +k }) : (k) => openTeacher(+k), rowKey: (r) => r.key });
    const zero = lens === 'tools' ? teachers.filter((x) => x.tools === 0).length : 0;
    const seg = `<div class="seg" role="group" aria-label="Measure">${Object.entries(LENS).map(([k, v]) => `<button type="button" data-slens="${k}" aria-pressed="${lens === k}">${v.label}</button>`).join('')}</div>`;
    const caveat = 'Rankings show where to celebrate and where to send support first — they are not a judgement of any teacher or school. Click a row for the full picture. Contains names — internal use only.';
    return card('c-sp0', `Leading the way and where support is most needed · ${esc(scopeName())} · ${periodText()}`, `${LENS[lens].note} ${caveat}`,
      `<div class="row">${seg}</div><p class="note">${N(schools.length)} schools and ${N(teachers.length)} teachers have enough data to be ranked on this measure.</p>`)
      + `${card('c-sp1', 'Schools leading the way', `Top ${SPOT_N.school} on ${esc(LENS[lens].short)}.`, tbl('sp1', schoolCols, top(schools, SPOT_N.school), 'school'))}`
      + `${card('c-sp2', 'Schools where support is most needed', `The ${SPOT_N.school} lowest on ${esc(LENS[lens].short)}.`, tbl('sp2', schoolCols, low(schools, SPOT_N.school), 'school'))}`
      + card('c-sp3', 'Teachers leading the way', `Top ${SPOT_N.teacher} on ${esc(LENS[lens].short)}.`, tbl('sp3', teacherCols, top(teachers, SPOT_N.teacher), 'teacher'))
      + card('c-sp4', 'Teachers who would benefit most from support', lens === 'tools' && zero > SPOT_N.teacher
        ? `${N(zero)} teachers used none of the four tools in this period; ${SPOT_N.teacher} of them are shown, those in the largest schools first. Filter the Teachers tab to see them all.`
        : `The ${SPOT_N.teacher} lowest on ${esc(LENS[lens].short)}.`,
        tbl('sp4', teacherCols, lens === 'tools' && zero > SPOT_N.teacher
          ? teachers.filter((x) => x.tools === 0).sort((a, b) => (R.schools.get(b.t.s).teachers - R.schools.get(a.t.s).teachers) || a.school.localeCompare(b.school)).slice(0, SPOT_N.teacher)
          : low(teachers, SPOT_N.teacher), 'teacher'));
  }

  function viewHitl(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-hitl', `HITL observations · ${scopeName()} · ${periodText()}`, 'A coach observes the lesson in person. Held = conducted (scored, not cancelled, abandoned, failed or a test). Held = debriefed + debrief pending + awaiting review. <code>/observe2</code> observations use another rubric and are left out.',
      `<div class="kpis">${kpi('HITL observations', N(a.hitl), '')}${kpi('Teachers observed at least once', N(a.hitlT), `${P1(ratio(a.hitlT, a.teachers))} of ${N(a.teachers)}`)}
        ${kpi('Debriefed', N(a.hitlC), P1(ratio(a.hitlC, a.hitl)))}${kpi('Debrief pending', N(a.hitlP), '')}${kpi('Awaiting review', N(a.hitlA), '')}</div>
        <p class="note">${N(S.data.observe2_excluded || 0)} /observe2 observations (since 1 Aug, all schools) use the impact team's own rubric and are not counted here — see the <a href="#tab=observe2">/observe2 pilot</a> tab.</p>`)
      + card('c-hitl-trend', 'HITL observations over time', '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.hitl, g.teachersHitl] })),
        [{ name: 'HITL observations', color: NAVY }, { name: 'Teachers observed', color: GREY }]), granSeg())
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
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }))
      + ficoIndicators();
  }

  // FICO v3 indicator analytics: every indicator for DC and HITL, what stands out, and grids by sector and by week.
  function ficoIndicators() {
    const F = Calc.ficoIndStats(S.P, sel());
    const head = `<div class="sec-h"><h2>FICO indicators</h2><p class="note">All 37 FICO indicators, FICO v3 only (observations from 8 Sep 2026), as the average indicator score ÷ 4. Digital Coach and HITL are never pooled. Lesson-plan fidelity (B) counts only lessons with a plan attached. Subject pedagogy F5–F7 count only where the subject applied, and are shown for DC only: HITL still scores them on nearly every lesson whatever the subject, so its figure would mostly be lessons in other subjects. Indicator data is weekly, so the period picks whole weeks · ${esc(scopeName())} · ${periodText()}.</p></div>`;
    if (!F) return head + card('c-fi0', 'FICO indicators', 'Not available yet: the dashboard may still be refreshing after an update. This appears by itself when it finishes.', '');
    if (!F.ind.some((x) => x.dcN || x.hitlN)) return head + card('c-fi0', 'FICO indicators', `No FICO v3 observations in ${periodText()} (v3 starts on 8 Sep 2026).`, '');
    const nn = (n) => `<span class="dim">n=${N(n)}</span>`;
    const scored = (k) => F.ind.filter((x) => (k === 'dc' ? x.dcN : x.hitlN) >= 50);
    const low = (k) => scored(k).sort((a, b) => a[k] - b[k]).slice(0, 5);
    const high = (k) => scored(k).sort((a, b) => b[k] - a[k]).slice(0, 3);
    const gaps = F.ind.filter((x) => x.dcN >= 50 && x.hitlN >= 50).map((x) => ({ ...x, g: x.hitl - x.dc })).sort((a, b) => Math.abs(b.g) - Math.abs(a.g)).slice(0, 3);
    const list = (arr, k) => arr.map((x) => `${x.id} ${esc(x.name)} (${P1(x[k])})`).join(', ');
    const facts = `<ul class="facts">
      ${low('dc').length ? `<li><b>Weakest on the Digital Coach</b>: ${list(low('dc'), 'dc')}.</li>` : ''}
      ${low('hitl').length ? `<li><b>Weakest in HITL observations</b>: ${list(low('hitl'), 'hitl')}.</li>` : ''}
      ${high('dc').length ? `<li><b>Strongest</b> (Digital Coach): ${list(high('dc'), 'dc')}.</li>` : ''}
      ${gaps.length ? `<li><b>Where coaches and the Digital Coach differ most</b>: ${gaps.map((x) => `${x.id} ${esc(x.name)} (HITL ${x.g >= 0 ? '+' : ''}${x.g.toFixed(1)} points)`).join(', ')}.</li>` : ''}
    </ul><p class="note">Ranked only where an indicator has at least 50 scores.</p>`;

    const cols = [
      { k: 'sec', label: 'Section', val: (r) => r.ord, fmt: (r) => esc(Calc.FICO_SEC[r.sec]) },
      { k: 'name', label: 'Indicator', val: (r) => r.id, fmt: (r) => `<b>${r.id}</b> ${esc(r.name)}` },
      { k: 'dc', label: 'Digital Coach', num: true, val: (r) => r.dc, fmt: (r) => (r.dcN ? `${sc(r.dc)} ${nn(r.dcN)}` : '<span class="dim">—</span>') },
      { k: 'hitl', label: 'HITL', num: true, val: (r) => r.hitl, fmt: (r) => (r.hitlN ? `${sc(r.hitl)} ${nn(r.hitlN)}` : `<span class="dim">${/F[567]/.test(r.id) ? 'not shown' : '—'}</span>`) },
      { k: 'gap', label: 'HITL − DC', num: true, title: 'Points by which HITL is above (+) or below (−) the Digital Coach', val: (r) => (r.dcN && r.hitlN ? r.hitl - r.dc : null),
        fmt: (r) => (r.dcN && r.hitlN ? `${r.hitl - r.dc >= 0 ? '+' : ''}${(r.hitl - r.dc).toFixed(1)}` : '<span class="dim">—</span>') },
    ];
    const kind = S.fkind || 'D';
    const seg = `<div class="seg" role="group" aria-label="Show">${[['D', 'Digital Coach'], ['H', 'HITL']].map(([k, l]) => `<button type="button" data-fkind="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>`;
    const heat = (rows, label) => {
      if (!rows.length) return '<p class="note">No observations in this period.</p>';
      const tpl = `grid-template-columns: minmax(230px, 1.6fr) repeat(${rows.length}, minmax(70px, 1fr))`;
      const headRow = `<div class="qg-r qg-h" style="${tpl}"><span>Indicator</span>${rows.map((r) => `<span>${esc(label(r.key))}</span>`).join('')}</div>`;
      const body = Calc.FICO_IND.map(([id, name], i) => `<div class="qg-r" style="${tpl}"><span class="qg-n fi-n"><b>${id}</b> ${esc(name)}</span>${rows.map((r) => {
        const v = r.v[i];
        if (v === null) return '<span class="hm-c na">—</span>';
        const b = band(v);
        return `<span class="hm-c ${b}${r.n[i] < 30 ? ' thin' : ''}" title="${esc(label(r.key))} · ${id}: ${P1(v)} · ${N(r.n[i])} scores"><span><i>${GLYPH[b]}</i>${Math.round(v)}%</span></span>`;
      }).join('')}</div>`).join('');
      return `<div class="xscroll"><div class="qg fi">${headRow}${body}</div></div>`;
    };
    const legendRow = legend().replace('<span><i class="zero"></i>None in this period</span>', '');
    return head
      + card('c-fi1', 'What stands out', '', facts)
      + card('c-fi2', 'All 37 indicators', 'Each indicator\'s average score ÷ 4. n = scores. Sort by any column.', legendRow + table('fi2', cols, F.ind, { noLegend: true }))
      + card('c-fi3', 'Indicators by sector', `Pick Digital Coach or HITL. Faded cells have fewer than 30 scores.`, `<div class="row">${seg}</div>${legendRow}${heat(F.sectors[kind], (k) => k)}`)
      + card('c-fi4', 'Indicators week by week', `Weeks start on Monday; the first week starts on 8 Sep. Pick Digital Coach or HITL above.`, `<div class="row">${seg}</div>${heat(F.weeks[kind], (w) => `w/c ${nice(Math.max(F.weekStart(w), F.firstDay))}`)}`);
  }

  function viewQuiz(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-quiz', `Quizzes · ${scopeName()} · ${periodText()}`,
      `Quizzes made = lesson quizzes written from the teacher's recorded lesson or plan and sent when she said yes. Children = distinct children who sat one through her share link (her own test runs are not children). Lesson and video quizzes are kept apart. Counts only — no child is ever listed.${kidsNote()}`,
      `<div class="kpis">${kpi('Quizzes made', N(a.made), `${N(a.madeT)} teachers`)}${kpi('Children (lesson quizzes)', N(a.kidsL), `${N(a.sitL)} attempts, ${N(a.finL)} finished`)}
        ${kpi('Children (video quizzes)', N(a.kidsV), `${N(a.sitV)} attempts`)}${kpi('Teachers whose children took a lesson quiz', N(a.quizLT))}</div>`)
      + card('c-quiz-trend', 'Quizzes over time', S.gran === 'day' || S.gran === 'week' || S.gran === 'month' ? 'Children per bucket are distinct within that day, week or month.' : '',
        chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.made, g.kidsL] })), [{ name: 'Quizzes made', color: NAVY }, { name: 'Children (lesson quizzes)', color: GREEN }]), granSeg())
      + card('c-quiz-t', `By ${level}`, level === 'sector' ? 'A child quizzed by teachers in two sectors is counted in each sector but once in the total.' : '',
        table('quiz', [nameCol(level), COL.teachers, COL.made, COL.madeT, COL.kidsL, COL.sitL, COL.finL, COL.qscore, COL.qfin, COL.kidsV, COL.sitV], rows,
          { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }))
      + quizScores(a, ser);
  }

  // Children's quiz scores (provisional: no governed rule yet).
  function quizScores(a, ser) {
    const G = Calc.quizGrid(S.P, sel());
    if (!G) return card('c-qs', "Children's quiz scores", 'Not available yet: the dashboard may still be refreshing after an update, or the last refresh could not load it. Reload the page shortly.', '');
    if (!G.all.f) return card('c-qs', "Children's quiz scores", `No finished lesson quizzes in ${periodText()}.`, '');
    const sc = (o) => (o && o.a ? (100 * o.c) / o.a : null);
    const view = S.qview || 'score';
    const mx = Math.max(1, ...[...G.cells.values()].map((c) => c.f));
    const cell = (o, total) => {
      if (!o || !o.f) return '<span class="hm-c na">—</span>';
      if (view === 'count') return `<span class="hm-c" style="background:rgba(31,122,76,${(0.15 + 0.85 * (o.f / (total ? G.all.f : mx))).toFixed(2)});color:${o.f / (total ? G.all.f : mx) > 0.45 ? '#FFF' : 'var(--fg)'}" title="${N(o.f)} quizzes finished">${N(o.f)}</span>`;
      const v = sc(o), b = band(v);
      return `<span class="hm-c ${b}" title="${P1(v)} average · ${N(o.f)} quizzes finished · ${P1(ratio(o.m, o.f))} mastered"><span><i>${GLYPH[b]}</i>${Math.round(v)}%<small>${N(o.f)} quizzes</small></span></span>`;
    };
    const cols = G.subjects;
    const tpl = `grid-template-columns: minmax(110px, 1.1fr) repeat(${cols.length + 1}, minmax(78px, 1fr))`;
    const head = `<div class="qg-r qg-h" style="${tpl}"><span>Grade</span>${cols.map((c) => `<span>${esc(c)}</span>`).join('')}<span>All subjects</span></div>`;
    const body = G.grades.map((g) => `<div class="qg-r" style="${tpl}"><span class="qg-n">${esc(g)}</span>${cols.map((c) => cell(G.cells.get(`${g}|${c}`))).join('')}${cell(G.rows.get(g), true)}</div>`).join('');
    const foot = `<div class="qg-r qg-t" style="${tpl}"><span class="qg-n">All grades</span>${cols.map((c) => cell(G.cols.get(c), true)).join('')}${cell(G.all, true)}</div>`;
    const seg = `<div class="seg" role="group" aria-label="Show">${[['score', 'Average score'], ['count', 'Quizzes finished']].map(([k, l]) => `<button type="button" data-qview="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>`;
    const all = G.all, avg = sc(all);
    const stack = [['Mastered', all.m, 'var(--t4)'], ['Developing', all.d, 'var(--t2)'], ['Needs practice', all.n, 'var(--t1)']];
    const masteryBar = `<div class="mbar">${stack.map(([l, v, c]) => (v ? `<span style="width:${(100 * v) / all.f}%;background:${c}" title="${l}: ${N(v)} (${P1(ratio(v, all.f))})"></span>` : '')).join('')}</div>
      <div class="legend">${stack.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l} <b>${P1(ratio(v, all.f))}</b> <span class="dim">${N(v)}</span></span>`).join('')}</div>`;
    const trend = chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.qScore] })), [{ name: 'Average score', color: C1 }], 'line');
    return `<div class="sec-h"><h2>Children's quiz scores</h2><p class="note">Average score on finished lesson quizzes = correct answers ÷ questions answered · ${esc(scopeName())} · ${periodText()}. Counts and averages only — no child is named. <b>Provisional</b>: there is no governed rule for quiz scores yet (request TKT-20261027-c75041).</p></div>`
      + card('c-qs', 'Scores at a glance', '', `<div class="kpis">${kpiP('Average score', avg, `${N(all.f)} quizzes finished`)}
          ${kpi('Mastered', P1(ratio(all.m, all.f)), `${N(all.m)} quizzes`)}${kpi('Developing', P1(ratio(all.d, all.f)), `${N(all.d)} quizzes`)}${kpi('Needs practice', P1(ratio(all.n, all.f)), `${N(all.n)} quizzes`)}
          ${kpi('Teachers with scored quizzes', N(a.qT), `of ${N(a.teachers)} primary teachers`)}</div>${masteryBar}`)
      + card('c-qg', 'Scores by grade and subject', "Grade and subject are the quiz's own. A quiz made from a lesson plan always has its exact grade; one made from a recorded lesson sometimes has only a range (e.g. Grades 1–2) when the exact grade could not be told — those rows sit after the grades they cover and are never added into them. Each cell: average score and quizzes finished. Hover a cell for the mastered share.",
        `<div class="row">${seg}</div>${view === 'score' ? legend().replace('<span><i class="zero"></i>None in this period</span>', '') : ''}<div class="xscroll"><div class="qg">${head}${body}${foot}</div></div>`)
      + card('c-qst', 'Average score over time', `By ${S.gran === 'day' ? 'day' : S.gran === 'week' ? 'week' : 'month'}, finished lesson quizzes.`, trend, granSeg());
  }

  // ---------- exam-generator analytics ----------
  function hourGrid(heat, unit) {
    const maxH = Math.max(1, ...heat.flat());
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const shade = (v) => (v ? `rgba(31, 122, 76, ${(0.12 + 0.88 * (v / maxH)).toFixed(2)})` : 'var(--line-2)');
    return `<div class="xscroll"><div class="hh"><span></span>${hours.map((h) => `<span class="hh-x">${h % 3 === 0 ? hourName(h) : ''}</span>`).join('')}
      ${WD.map((w, i) => `<span class="hh-y">${w.slice(0, 3)}</span>${hours.map((h) => `<span class="hh-c" style="background:${shade(heat[i][h])}" data-tip="${w} ${hourName(h)}: ${N(heat[i][h])} ${unit}"></span>`).join('')}`).join('')}</div></div>`;
  }
  function splitBar(parts, total) {
    return `<div class="mbar">${parts.map(([l, v, c]) => (v ? `<span style="width:${(100 * v) / total}%;background:${c}" title="${l}: ${N(v)} (${P1(ratio(v, total))})"></span>` : '')).join('')}</div>
      <div class="legend">${parts.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l} <b>${P1(ratio(v, total))}</b> <span class="dim">${N(v)}</span></span>`).join('')}</div>`;
  }
  function examAnalytics() {
    const E = Calc.examStats(S.P, sel());
    if (!E) return card('c-exa', 'Exam generator analytics', 'Not available yet: the dashboard may still be refreshing after an update, or the last refresh could not load it. Reload the page shortly.', '');
    if (!E.req) return card('c-exa', 'Exam generator analytics', `No exam papers requested in ${periodText()}.`, '');

    const subs = E.subjects.slice().sort((a, b) => b.gen - a.gen);
    const maxS = Math.max(1, ...subs.map((s) => s.gen));
    const subjects = card('c-exs', 'Exams by subject', `Exams generated per subject · ${esc(scopeName())} · ${periodText()}. <b>${esc(subs[0].key)}</b> leads with ${P1(ratio(subs[0].gen, E.gen))} of exams.`,
      `<div class="ladder">${subs.map((s) => `<div class="lrow"><div class="ll"><span>${esc(s.key)}</span><span>${N(s.teachers)} teachers · ${s.req ? (s.q / s.req).toFixed(0) : '—'} questions a paper</span></div>
        <div class="lbar"><div style="width:${(100 * s.gen) / maxS}%;background:${C1}"></div></div><span class="lpct">${N(s.gen)}</span></div>`).join('')}</div>`);

    const grs = E.grades.slice().sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
    const grades = card('c-exg', 'Exams by grade', `Exams generated and requested per grade · ${periodText()}.`,
      chart(grs.map((g) => ({ label: g.key.replace('Grade ', 'G'), values: [g.gen, g.req - g.gen] })), [{ name: 'Generated', color: C1 }, { name: 'Requested but not generated', color: C2 }]));

    const by = (arr, k) => (arr.find((x) => x.key === k) || { req: 0 }).req;
    const how = card('c-exh', 'How papers are made', `Share of exam requests · ${periodText()}. Seen = questions from the textbook's own exercises; Unseen = new questions written from the page text; Both = a mix. Seen/Unseen is about where questions come from, not difficulty.`,
      `<div class="grid"><div><span class="lbl">Question source</span>${splitBar([['Seen', by(E.sources, 's'), C1], ['Both', by(E.sources, 'b'), '#8FD3AE'], ['Unseen', by(E.sources, 'u'), C2]], E.req)}</div>
        <div><span class="lbl">Where requested</span>${splitBar([['WhatsApp', by(E.surfaces, 'w'), C1], ['Teacher portal', by(E.surfaces, 'p'), C2]], E.req)}</div>
        <div><span class="lbl">Question types asked for</span>${splitBar([['Objective (MCQs, fill in the blanks, …)', E.obj, C1], ['Subjective (short and long answers, …)', E.subjq, C2]], (E.obj + E.subjq) || 1)}</div>
        <div class="kpis">${kpi('Questions a paper', E.req ? (E.q / E.req).toFixed(1) : '—', 'asked for, on average')}${kpi('Papers per teacher', E.teachers ? (E.gen / E.teachers).toFixed(1) : '—', `${N(E.teachers)} teachers`)}${kpi('Generated', P1(ratio(E.gen, E.req)), `${N(E.gen)} of ${N(E.req)} requests`)}</div></div>`);

    const avg = E.wd.map((v, i) => (E.wdDays[i] ? v / E.wdDays[i] : 0));
    const busiest = avg.indexOf(Math.max(...avg)), quietest = avg.indexOf(Math.min(...avg));
    const days = card('c-exw', 'Day of the week', `Average exams generated per day · ${periodText()}. <b>${WD[busiest]}</b> is the busiest (${avg[busiest].toFixed(1)} a day); ${WD[quietest]} the quietest (${avg[quietest].toFixed(1)}).`,
      chart(WD.map((w, i) => ({ label: w.slice(0, 3), values: [avg[i]] })), [{ name: 'Exams per day, on average', color: C1 }], 'bar', (v) => v.toFixed(1)));
    const peakH = E.hrs.indexOf(Math.max(...E.hrs));
    const heat = card('c-exhh', 'When exams are generated', `Exams generated by weekday and hour (Pakistan time) · ${periodText()}. Most around <b>${hourName(peakH)}</b>. Darker = more exams.`, hourGrid(E.heat, 'exams'));

    const chs = E.chapters.map((c) => { const [g, s, ch] = c.key.split('|'); return Object.assign(c, { g, s, ch: +ch }); });
    const withCh = chs.reduce((n, c) => n + c.req, 0);
    const ccols = [
      { k: 'name', label: 'Chapter', val: (r) => `${r.g} ${r.s} ${r.ch}`, fmt: (r) => `Chapter ${r.ch}` },
      { k: 'g', label: 'Grade', val: (r) => r.g },
      { k: 's', label: 'Subject', val: (r) => r.s },
      { k: 'gen', label: 'Exams generated', num: true, val: (r) => r.gen, fmt: (r) => N(r.gen) },
      { k: 'teachers', label: 'Teachers', num: true, val: (r) => r.teachers, fmt: (r) => N(r.teachers) },
      { k: 'qa', label: 'Questions a paper', num: true, val: (r) => (r.req ? r.q / r.req : null), fmt: (r) => (r.req ? (r.q / r.req).toFixed(0) : '—') },
    ];
    const chapters = card('c-exc', 'Most examined chapters', `Top 25 chapters by exams generated · ${periodText()}. The chapter is recorded on ${P1(ratio(withCh, E.req))} of requests (the rest name pages instead), so this covers only those.`,
      table('exc', ccols, chs.sort((a, b) => b.gen - a.gen).slice(0, 25), { sort: { k: 'gen', dir: -1 }, noLegend: true }));

    return `<div class="sec-h"><h2>Exam generator analytics</h2><p class="note">${N(E.gen)} exams generated from ${N(E.req)} requests by ${N(E.teachers)} teachers · ${esc(scopeName())} · ${periodText()}</p></div>
      <div class="cards2">${subjects}${grades}</div>${how}${boardPapers(E.board, E.gen)}<div class="cards2">${days}${heat}</div>${chapters}`;
  }

  // FDE board-format papers (grade 5 feature, live from 16 Oct 2026). Provisional: read from the paper's own layout, no governed rule.
  function boardPapers(B, allGen) {
    const title = 'FDE board papers (grade 5)';
    if (!B) return '';
    if (!B.req) return card('c-exb', title, `No FDE board-format papers requested in ${periodText()}. The feature went live on 16 Oct 2026.`, '');
    const by = (arr, k) => (arr.find((x) => x.key === k) || { req: 0 }).req;
    const subs = B.subjects.slice().sort((a, b) => b.gen - a.gen);
    const maxS = Math.max(1, ...subs.map((x) => x.gen));
    const ladder = `<div class="ladder">${subs.map((x) => `<div class="lrow"><div class="ll"><span>${esc(x.key)}</span><span>${N(x.teachers)} teachers</span></div>
        <div class="lbar"><div style="width:${(100 * x.gen) / maxS}%;background:${C1}"></div></div><span class="lpct">${N(x.gen)}</span></div>`).join('')}</div>`;
    const other = B.grades.filter((g) => g.key !== 'Grade 5').reduce((n, g) => n + g.req, 0);
    const first = Math.max(S.from, Math.min(...B.days.keys())), last = Math.min(S.to, S.P.data.today);
    const trend = chart(Array.from({ length: last - first + 1 }, (_, i) => ({ label: nice(first + i), values: [B.days.get(first + i) || 0] })),
      [{ name: 'Board papers generated', color: C1 }]);
    return card('c-exb', title,
      `Exams made in the FDE board format, the paper layout of the grade 5 Federal Directorate of Education board exam · ${esc(scopeName())} · ${periodText()}. <b>Provisional</b>: read from the paper's own layout, there is no governed rule for it yet.${other ? ` ${N(other)} of these requests are for other grades.` : ''}`,
      `<div class="kpis">${kpi('Board papers generated', N(B.gen), `of ${N(B.req)} requested`)}${kpi('Teachers', N(B.teachers), `in ${N(B.schools)} schools`)}${kpi('Papers per teacher', B.teachers ? (B.gen / B.teachers).toFixed(1) : '—')}${kpi('Share of all exams', P1(ratio(B.gen, allGen)), 'generated in this period')}</div>
      <div class="grid"><div><span class="lbl">What the paper covers</span>${splitBar([['Whole FDE syllabus', by(B.scopes, 'f'), C1], ['Chapters picked by teacher', by(B.scopes, 'c'), '#8FD3AE'], ['Pages picked by teacher', by(B.scopes, 'p'), C2], ['Other', by(B.scopes, 'o'), '#BBB']].filter((x) => x[1]), B.req)}</div>
        <div><span class="lbl">Where requested</span>${splitBar([['WhatsApp', by(B.surfaces, 'w'), C1], ['Teacher portal', by(B.surfaces, 'p'), C2]].filter((x) => x[1]), B.req)}</div></div>
      <div class="cards2"><div><span class="lbl">By subject</span>${ladder}</div><div><span class="lbl">By day</span>${trend}</div></div>`);
  }

  function viewExams(R) { return viewExamsBase(R) + examAnalytics(); }
  function viewExamsBase(R) {
    const a = R.all, { level, rows } = levelRows(R);
    const ser = seriesNow();
    return card('c-ex', `Exam generator · ${scopeName()} · ${periodText()}`,
      'A teacher asks Rumi (<code>/assessment</code> on WhatsApp, or the portal) for an exam paper on a grade 1–5 textbook chapter and gets a printable paper with its answer key. Live since 5 Sep 2026. <b>Exams generated</b> = the paper came out (on WhatsApp: stored and sent; in the portal: ready to download). Requested = generated + failed + never finished. Nothing records whether the class sat the paper or how pupils scored.',
      `<div class="kpis">${kpi('Exams generated', N(a.exOk), `of ${N(a.exReq)} requested`)}${kpiP('Teachers with a paper', ratio(a.exT, a.teachers), `${N(a.exT)} of ${N(a.teachers)} teachers`)}
        ${kpi('Per teacher with a paper', a.exT ? (a.exOk / a.exT).toFixed(1) : '—', 'papers')}${kpi('Failed', N(a.exFail), `${N(a.exStuck)} never finished`)}${kpi('Edited by teacher', N(a.exEdit), P1(ratio(a.exEdit, a.exOk)) + ' of generated')}</div>`)
      + card('c-ex-trend', 'Exam generator over time', '', chart(ser.map((g) => ({ label: bucketLabel(g), values: [g.exOk, g.teachersEx] })),
        [{ name: 'Exams generated', color: NAVY }, { name: 'Teachers with a paper', color: GREEN }]), granSeg())
      + card('c-ex-t', `By ${level}`, '', table('ex', [nameCol(level), COL.teachers, COL.exOk, COL.exT, COL.exPct, COL.fde, COL.fdeT, COL.exReq, COL.exFail, COL.exStuck, COL.exEdit], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewTraining(R) {
    const a = R.all, { level, rows } = levelRows(R);
    return card('c-tr', `NIETE primary training · ${scopeName()} · all time`,
      'The <b>niete_primary</b> programme: NIETE Level 0 Aspiring Teacher (46 modules), Level 1 Emerging Practitioner (46), Level 2 Skilled Practitioner (40), Level 3 Teacher Leader (39) — 171 modules. <b>On NIETE primary training</b> = the teacher has an active assignment to this programme. There is no training-status column — these steps are the status: on the programme → finished a module → holds a level certificate (each NIETE level ends with a grand quiz, pass mark 80%). All time; the period filter does not apply.',
      `<div class="kpis">${kpi('On NIETE primary training', N(a.onProg), `of ${N(a.teachers)} primary teachers`)}${kpi('Finished a module', N(a.didModule), 'any NIETE level')}
        ${[1, 2, 3, 4].map((l) => kpiP(LEVELS[l - 1], ratio(a.cert[l - 1], a.teachers), `${N(a.cert[l - 1])} of ${N(a.teachers)} certified`)).join('')}</div>`)
      + card('c-tr-t', `By ${level}`, '', table('tr', [nameCol(level), COL.teachers, COL.onProg, COL.didMod, COL.mods, COL.cert1, COL.cert2, COL.cert3, COL.cert4], rows,
        { level, onRow: (k) => drill(level, k), rowKey: (r) => r.key, foot: a }));
  }

  function viewSchools(R) {
    const rows = [...R.schools.values()].map((g) => Object.assign(g, { name: S.data.schools[g.s].name, emis: S.data.schools[g.s].emis, sector: S.data.schools[g.s].sector, key: g.s }));
    const q = S.search.toLowerCase();
    const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.emis.includes(q));
    const cols = [nameCol('school'), { k: 'sector', label: 'Sector', val: (r) => r.sector }, COL.teachers, COL.usage, COL.taught, COL.dc, COL.dcPct,
      ...ficoCols().filter((c) => c.k === 'dc-hlp' || c.k === 'hitl-hlp'), COL.hitl, COL.hitlPct, COL.made, COL.kidsL, COL.exOk, COL.onProg, COL.cert1, COL.cert2, COL.cert3, COL.cert4];
    return card('c-sch', `All schools · ${S.sector || 'All ICT'} · ${periodText()}`, `${N(shown.length)} schools with primary teachers. One complete row per school; click for its teachers.`,
      table('sch', cols, shown, { level: 'school', onRow: (k) => modalOpen({ kind: 'school', key: +k, cols: tableCols.sch }), rowKey: (r) => r.key }),
      `<div class="row"><input class="inp" type="search" id="search" placeholder="Search school or EMIS" value="${esc(S.search)}"></div>`);
  }

  const MISSING = [
    ['', 'Everyone'], ['plan', 'Generated no grade 1–5 plan'], ['taught', 'No plan taught'], ['dc', 'No DC observation'], ['hitl', 'No HITL observation'],
    ['quiz', 'No quiz made'], ['exam', 'No exam paper'], ['prog', 'Not on NIETE primary'], ['l1', 'No Level 0 certificate'],
  ];
  function viewTeachers(R) {
    const q = S.search.toLowerCase();
    const miss = { plan: (t) => !t.g15, taught: (t) => !t.taught, dc: (t) => !t.dc, hitl: (t) => !t.hitl, quiz: (t) => !t.made, exam: (t) => !t.exOk, prog: (t) => !t.onProg, l1: (t) => !t.certs.includes('1') }[S.missing];
    const rows = R.teachers.filter((t) => (!q || t.name.toLowerCase().includes(q) || S.data.schools[t.s].name.toLowerCase().includes(q)) && (!miss || miss(t)))
      .map((t) => Object.assign(Calc.asGroup(t), { t, name: t.name, key: t.i, school: S.data.schools[t.s].name, sector: S.data.schools[t.s].sector }));
    const cols = [nameCol('teacher'), { k: 'school', label: 'School', val: (r) => r.school, fmt: (r) => `${esc(r.school)} <span class="dim">${esc(r.sector)}</span>` },
      COL.g15, COL.plans, COL.opened, COL.taught, COL.dc, ...ficoCols().filter((c) => c.k === 'dc-hlp' || c.k === 'dc-tsk3'), COL.hitl, COL.made, COL.kidsL, COL.exOk, COL.onProg, COL.mods, COL.cert1, COL.cert2, COL.cert3, COL.cert4];
    const tools = `<div class="row"><input class="inp" type="search" id="search" placeholder="Search teacher or school" value="${esc(S.search)}">
      <select class="sel" id="missing" aria-label="Show">${MISSING.map(([k, l]) => `<option value="${k}" ${S.missing === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    return card('c-tch', `Teachers · ${scopeName()} · ${periodText()}`, `${N(rows.length)} of ${N(R.teachers.length)} primary teachers. Click a teacher for the scorecard. Contains teacher names — internal use only.`,
      table('tch', cols, rows, { level: 'teacher', onRow: (k) => openTeacher(+k), rowKey: (r) => r.key }), tools);
  }

  function viewTrends() {
    const ser = seriesNow();
    const items = (f) => ser.map((g) => ({ label: bucketLabel(g), values: f(g) }));
    return `<div class="cards2">`
      + card('c-a1', 'Teachers who generated a lesson plan', '', chart(items((g) => [g.teachersWithPlan]), [{ name: 'Teachers', color: GREEN }]), granSeg())
      + card('c-a2', 'Plans taught', 'DC observations with one of the teacher&#39;s recent Rumi plans attached (provisional).', chart(items((g) => [g.taught]), [{ name: 'Plans taught', color: NAVY }]), granSeg())
      + card('c-a3', 'Classroom observations', 'DC and HITL observations side by side, never added.', chart(items((g) => [g.dc, g.hitl]), [{ name: 'DC observations', color: GREEN }, { name: 'HITL observations', color: NAVY }]), granSeg())
      + card('c-a4', 'Teaching practices score', 'FICO section C, score ÷ maximum.', chart(items((g) => [fpct(g.ficoD.hlp), fpct(g.ficoH.hlp)]), [{ name: 'DC observations', color: GREEN }, { name: 'HITL observations', color: NAVY }], 'line'), granSeg())
      + card('c-a5', 'Subject knowledge score', 'FICO v2 to 7 Sep and v3 from 8 Sep are different measures: two lines, never one.',
        chart(items((g) => [fpct(g.ficoD.tsk2), fpct(g.ficoD.tsk3), fpct(g.ficoH.tsk2), fpct(g.ficoH.tsk3)]),
          [{ name: 'DC v2', color: SOFT }, { name: 'DC v3', color: GREEN }, { name: 'HITL v2', color: GREY }, { name: 'HITL v3', color: NAVY }], 'line'), granSeg())
      + card('c-a7', 'Exam generator', 'Exams generated by the exam generator, and the teachers who generated one.', chart(items((g) => [g.exOk, g.teachersEx]), [{ name: 'Exams generated', color: NAVY }, { name: 'Teachers with a paper', color: GREEN }]), granSeg())
      + card('c-a6', 'Quizzes', 'Children are distinct within each day, week or month.', chart(items((g) => [g.made, g.kidsL]), [{ name: 'Quizzes made', color: NAVY }, { name: 'Children (lesson quizzes)', color: GREEN }]), granSeg())
      + `</div>`;
  }

  // ---------- teacher scorecard ----------
  function teacherView(ti) {
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
    return { title: T.name, sub: `${sc.name} · EMIS ${sc.emis} · ${sc.sector} · teaches ${T.lv.split('').map((c) => ({ P: 'primary', M: 'middle', H: 'high' }[c])).join(' + ')} · ${periodText()}`, html: `<section class="card" id="c-tc"><div class="card-h"><h2>Scorecard</h2><button class="dl" data-dl="c-tc">Download image</button></div>
      <div class="kpis">${kpi('Days a plan was used', N(t.lpDays), 'generated or opened')}${kpi('Plans generated', N(t.plans), 'grade 1–5, with Rumi')}${kpi('Plans opened in the app', N(t.opened), 'grade 1–5')}${kpi('Plans taught', N(t.taught), 'seen in DC observations')}
      ${kpi('DC observations', N(t.dc), 'lessons recorded')}${kpi('HITL observations', N(t.hitl), `${N(t.hitlC)} debriefed`)}
      ${kpi('Quizzes made', N(t.made))}${kpi('Exam generator', N(t.exOk), `papers · ${N(t.exReq)} requested`)}${kpi('Children (lesson quizzes)', N(t.kidsL), `${N(t.sitL)} sittings`)}
      ${kpi('NIETE training', t.onProg ? 'On programme' : 'Not assigned', `${N(g.mods)} of 171 modules · certificates: ${t.certs ? t.certs.split('').map((l) => LEVELS[+l - 1]).join(', ') : 'none'}`)}</div>
      <h2>FICO section scores</h2>${ficoBlock(g)}
      <h2>Activity over time</h2>${chart([...by.values()].map((b) => ({ label: b.label, values: [b.plan, b.dc, b.hitl] })),
        [{ name: S.gran === 'day' ? 'Used a plan' : 'Days a plan was used', color: SOFT }, { name: 'DC observations', color: GREEN }, { name: 'HITL observations', color: NAVY }])}
      <p class="note">Contains teacher names — internal use only.${kidsNote()}</p></section>
      <h2 class="sec-in">HITL observations: score trend and debrief reports</h2>${hitlBlocks(ti)}` };
  }
  // ---------- coach card and a teacher's HITL reports ----------
  const addFico = (f, r) => Calc.addFico(f, r);
  const coachInfo = (id) => (S.data.coaches || []).find((c) => c.id === id);
  const coachLabel = (id) => { const c = coachInfo(id); return c ? c.name || '(no name)' : id ? 'Unknown observer' : 'No observer recorded'; };
  const secPct = (r, i) => (r[i] !== null && r[i + 1] ? (100 * r[i]) / r[i + 1] : null);   // HLP 6, SE 8, LPF 10
  const STAGE = { C: 'Debriefed', P: 'Debrief pending', A: 'Awaiting review' };
  const dayName = (d) => niceY(d);

  function coachView(id) {
    const per = new Map(), schools = new Map();
    let n = 0, C = 0, r = 0, u = 0;
    for (let ti = 0; ti < S.data.teachers.length; ti++) {
      for (const o of S.P.obs[ti]) {
        if (o[2] !== 'H' || o[14] !== id || o[1] < S.from || o[1] > S.to) continue;
        n++; if (o[3] === 'C') C++; if (o[15] === 'r') r++; if (o[15] === 'u') u++;
        if (!per.has(ti)) per.set(ti, []);
        per.get(ti).push(o);
      }
    }
    const rows = [...per.entries()].map(([ti, list]) => {
      const T = S.data.teachers[ti];
      const all = S.P.obs[ti].filter((o) => o[2] === 'H').sort((a, b) => a[1] - b[1]);
      const last = list[list.length - 1], first = all[0], latest = all[all.length - 1];
      const f = Calc.blankFico(); list.forEach((o) => addFico(f, o));
      if (!schools.has(T.s)) schools.set(T.s, { key: T.s, name: S.data.schools[T.s].name, sector: S.data.schools[T.s].sector, teachers: 0, n: 0, fico: Calc.blankFico() });
      const sc = schools.get(T.s); sc.teachers++; sc.n += list.length; list.forEach((o) => addFico(sc.fico, o));
      return { key: ti, name: T.name, school: S.data.schools[T.s].name, n: list.length, all: all.length, last: last[1], fico: f,
        change: all.length > 1 ? (secPct(latest, 6) !== null && secPct(first, 6) !== null ? secPct(latest, 6) - secPct(first, 6) : null) : null };
    });
    const sp = (o, k) => (o.fico[k][2] ? fpct(o.fico[k]) : null);
    const secCols = DC_SECS.map(([k, l]) => ({ k, label: l, num: true, val: (x) => sp(x, k), fmt: (x) => sc(sp(x, k)) }));
    const info = coachInfo(id);
    const tcols = [
      { k: 'name', label: 'Teacher', val: (x) => x.name, fmt: (x) => esc(x.name) },
      { k: 'school', label: 'School', val: (x) => x.school, fmt: (x) => esc(x.school) },
      { k: 'n', label: 'Observed by this coach', num: true, val: (x) => x.n, fmt: (x) => N(x.n) },
      { k: 'all', label: 'All HITL observations', num: true, title: 'By any coach since 1 Aug', val: (x) => x.all, fmt: (x) => N(x.all) },
      { k: 'last', label: 'Last observed', num: true, val: (x) => x.last, fmt: (x) => dayName(x.last) },
      { k: 'change', label: 'Teaching practices change', num: true, title: 'Latest minus first HITL score on teaching practices, for teachers observed more than once', val: (x) => x.change,
        fmt: (x) => (x.change === null ? '<span class="dim">—</span>' : `<span class="${x.change >= 0 ? 'up' : 'down'}">${x.change >= 0 ? '▲' : '▼'} ${Math.abs(x.change).toFixed(1)} pts</span>`) },
      ...secCols,
    ];
    const scols = [
      { k: 'name', label: 'School', val: (x) => x.name, fmt: (x) => esc(x.name) },
      { k: 'sector', label: 'Sector', val: (x) => x.sector, fmt: (x) => esc(x.sector) },
      { k: 'teachers', label: 'Teachers observed', num: true, val: (x) => x.teachers, fmt: (x) => N(x.teachers) },
      { k: 'n', label: 'Observations', num: true, val: (x) => x.n, fmt: (x) => N(x.n) },
      ...secCols,
    ];
    return { title: coachLabel(id), sub: `${info && info.role && info.role !== 'coach' ? `${info.role} · ` : 'Coach · '}${N(n)} HITL observations of ${N(per.size)} teachers in ${N(schools.size)} schools · ${periodText()}`,
      html: `<section class="card" id="m-co"><div class="card-h"><h2>Summary</h2><button class="dl" data-dl="m-co">Download image</button></div>
        <div class="kpis">${kpi('HITL observations', N(n))}${kpi('Teachers observed', N(per.size), `${N(schools.size)} schools`)}${kpi('Debriefed', P1(ratio(C, n)), `${N(C)} of ${N(n)}`)}
        ${kpi('Changed the AI’s scores', P1(ratio(r, n)))}${kpi('Submitted unchanged', P1(ratio(u, n)))}</div>
        <p class="note">Scores are the ones this coach gave. Contains names — internal use only.</p></section>
        <section class="card" id="m-cs"><div class="card-h"><h2>Schools</h2></div>${table('m-csch', scols, [...schools.values()], { sort: { k: 'n', dir: -1 }, noLegend: true })}</section>
        <section class="card" id="m-ct"><div class="card-h"><h2>Teachers</h2></div><p class="note">Click a teacher for every HITL observation they have had, the score trend and each debrief report.</p>
        ${table('m-ctch', tcols, rows, { sort: { k: 'last', dir: -1 }, onRow: (k) => modalOpen({ kind: 'hteacher', key: +k, coach: id }), rowKey: (x) => x.key })}</section>` };
  }

  // A teacher's HITL score trend and debrief reports: shown from the coach card and on every teacher scorecard.
  function hitlBlocks(ti) {
    const all = S.P.obs[ti].filter((o) => o[2] === 'H').sort((a, b) => a[1] - b[1]);
    if (!all.length) return `<section class="card" id="m-hd"><div class="card-h"><h2>HITL debrief reports</h2></div><p class="note">No HITL observation of this teacher since 1 Aug 2026, so there is no debrief report yet.</p></section>`;
    const trend = all.length > 1 ? chart(all.map((o) => ({ label: nice(o[1]), values: [secPct(o, 6), secPct(o, 8), secPct(o, 10)] })),
      [{ name: 'Teaching practices', color: NAVY }, { name: 'Student engagement', color: GREEN }, { name: 'Lesson-plan fidelity', color: GREY }], 'line')
      : '<p class="note">One HITL observation so far, so there is no trend yet.</p>';
    return `<section class="card" id="m-ht"><div class="card-h"><h2>Score trend</h2><button class="dl" data-dl="m-ht">Download image</button></div>
        <p class="note">Each HITL observation's section scores, oldest to newest, whichever coach observed. Subject knowledge is left out because its scale changed on 8 Sep.</p>${trend}</section>
        <section class="card" id="m-hd"><div class="card-h"><h2>HITL debrief reports</h2></div>
        <p class="note">Newest first: what the coach and the AI told the teacher. Read this before observing the teacher again. Words quoted from the classroom are left out (shown as “…”) so no child's words are published. Contains teacher and coach names — internal use only.</p>
        <div id="deb-list" data-t="${ti}"><p class="note">Loading the reports…</p></div></section>`;
  }

  function hitlTeacherView(ti) {
    const T = S.data.teachers[ti], scl = S.data.schools[T.s];
    const n = S.P.obs[ti].filter((o) => o[2] === 'H').length;
    return { title: T.name, sub: `${scl.name} · ${scl.sector} · ${N(n)} HITL observation${n === 1 ? '' : 's'} since 1 Aug 2026`, html: hitlBlocks(ti) };
  }

  async function loadDebriefs(ti) {
    const box = $('#deb-list');
    if (!box) return;
    let j;
    try { const r = await fetch(`/api/debrief?t=${ti}`); j = await r.json(); } catch (e) { j = null; }
    if (!box.isConnected || box.dataset.t !== String(ti)) return;
    if (!j || !j.ready) { box.innerHTML = '<p class="note">The reports are not loaded yet: the dashboard may still be refreshing after an update. Try again shortly.</p>'; return; }
    const scoreOf = new Map();
    for (const o of S.P.obs[ti]) if (o[2] === 'H') { const k = `${o[1]}|${o[14]}`; if (!scoreOf.has(k)) scoreOf.set(k, []); scoreOf.get(k).push(o); }
    const items = j.items.slice().sort((a, b) => b.d - a.d);
    if (!items.length) { box.innerHTML = '<p class="note">No debrief report found for this teacher.</p>'; return; }
    const li = (arr) => (arr.length ? `<ul class="facts">${arr.join('')}</ul>` : '<p class="dim">—</p>');
    box.innerHTML = items.map((x) => {
      const o = (scoreOf.get(`${x.d}|${x.c}`) || []).shift();
      const chips = o ? DC_SECS.map(([k, l]) => { const v = k === 'hlp' ? secPct(o, 6) : k === 'se' ? secPct(o, 8) : k === 'lpf' ? secPct(o, 10) : (o[5] && [20, 24, 28].includes(o[5]) ? (100 * o[4]) / o[5] : null); return v === null ? '' : `<span class="dchip">${esc(l)} ${sc(v)}</span>`; }).join('') : '';
      return `<article class="deb"><header><b>${dayName(x.d)}</b> · ${esc(coachLabel(x.c))} · <span class="dim">${STAGE[x.s] || ''}</span></header>
        ${chips ? `<div class="dchips">${chips}</div>` : ''}
        ${x.su ? `<p>${esc(x.su)}</p>` : ''}
        ${x.fo ? `<div class="dfocus"><span class="lbl">Focus for next time</span><b>${esc(x.fo.t)}</b>${x.fo.r ? `<p>${esc(x.fo.r)}</p>` : ''}${x.fo.y ? `<p><b>Try this tomorrow:</b> ${esc(x.fo.y)}</p>` : ''}</div>` : ''}
        <div class="dgrid"><div><span class="lbl">Strengths</span>${li(x.st.map((s) => `<li><b>${esc(s.t)}</b>${s.i ? ` — ${esc(s.i)}` : ''}</li>`))}</div>
        <div><span class="lbl">Areas of growth</span>${li(x.gr.map((g) => `<li><b>${esc(g.a)}</b>${g.o ? ` — ${esc(g.o)}` : ''}${g.s.length ? `<ul>${g.s.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</li>`))}</div></div>
        <div><span class="lbl">Action plan</span>${li(x.rec.map((t) => `<li>${esc(t)}</li>`))}</div></article>`;
    }).join('');
  }

  // ---------- drill-down card ----------
  // A stack of views shown in the centred card: a sector's schools, a school's teachers, a teacher's scorecard.
  const MS = [];
  function openTeacher(ti) { modalOpen({ kind: 'teacher', key: ti }); }
  function modalOpen(v) {
    if (!$('#modal').open) MS.length = 0;
    MS.push(v);
    renderModal();
  }
  function modalCols(cols, level) {
    const base = cols && cols.length ? cols.slice(1) : [COL.teachers, COL.usage, COL.taught, COL.dc, COL.dcPct, COL.hitl, COL.hitlPct, COL.made, COL.exOk, COL.onProg];
    return [nameCol(level), ...base];
  }
  function miniKpis(g) {
    return `<div class="kpis">${kpi('Primary teachers', N(g.teachers), `${N(g.schools)} school${g.schools === 1 ? '' : 's'}`)}
      ${kpiP('LP engagement', ratio(g.g15, g.teachers), `${N(g.g15)} used a plan`)}${kpiP('DC coverage', ratio(g.dcT, g.teachers), `${N(g.dcT)} recorded`)}
      ${kpiP('HITL coverage', ratio(g.hitlT, g.teachers), `${N(g.hitlT)} observed`)}${kpiP('Exam generator', ratio(g.exT, g.teachers), `${N(g.exT)} teachers`)}</div>`;
  }
  function renderModal() {
    const v = MS[MS.length - 1];
    if (!v) return;
    let title, sub, html;
    const trail = MS.map((x) => (x.kind === 'sector' ? x.key : x.kind === 'school' ? S.data.schools[x.key].name : x.kind === 'coach' ? coachLabel(x.key) : S.data.teachers[x.key].name));
    if (v.kind === 'sector') {
      const R = Calc.rollup(S.P, { from: S.from, to: S.to, sector: v.key });
      const rows = [...R.schools.values()].map((g) => Object.assign(g, { name: S.data.schools[g.s].name, emis: S.data.schools[g.s].emis, key: g.s }));
      title = v.key;
      sub = `Sector · ${N(R.all.schools)} schools · ${N(R.all.teachers)} primary teachers · ${periodText()}`;
      html = `<section class="card" id="m-c1"><div class="card-h"><h2>Schools in ${esc(v.key)}</h2><button class="dl" data-dl="m-c1">Download image</button></div>${miniKpis(R.all)}
        <p class="note">Click a school to see its teachers.</p>
        ${table('m-sch', modalCols(v.cols, 'school'), rows, { level: 'school', onRow: (k) => modalOpen({ kind: 'school', key: +k, cols: v.cols }), rowKey: (r) => r.key, foot: R.all })}</section>`;
    } else if (v.kind === 'school') {
      const sc = S.data.schools[v.key];
      const R = Calc.rollup(S.P, { from: S.from, to: S.to, school: v.key });
      const rows = R.teachers.map((t) => Object.assign(Calc.asGroup(t), { t, name: t.name, key: t.i }));
      title = sc.name;
      sub = `EMIS ${sc.emis}${MS.length > 1 ? '' : ` · ${sc.sector}`} · ${N(R.all.teachers)} primary teachers · ${periodText()}`;
      html = `<section class="card" id="m-c2"><div class="card-h"><h2>Teachers</h2><button class="dl" data-dl="m-c2">Download image</button></div>${miniKpis(R.all)}
        <p class="note">Click a teacher for the scorecard. Contains teacher names — internal use only.</p>
        ${table('m-tch', modalCols(v.cols, 'teacher'), rows, { level: 'teacher', onRow: (k) => modalOpen({ kind: 'teacher', key: +k }), rowKey: (r) => r.key, foot: R.all })}</section>`;
    } else if (v.kind === 'coach') {
      ({ title, sub, html } = coachView(v.key));
    } else if (v.kind === 'hteacher') {
      ({ title, sub, html } = hitlTeacherView(v.key, v.coach));
    } else {
      ({ title, sub, html } = teacherView(v.key));
    }
    $('#m-title').textContent = title;
    $('#m-sub').textContent = MS.length > 1 ? `${trail.slice(0, -1).join(' › ')} ›  ${sub}` : sub;
    $('#m-back').hidden = MS.length < 2;
    $('#m-body').innerHTML = html;
    const m = $('#modal');
    if (!m.open) m.showModal();
    $('#m-body').scrollTop = 0;
    drawCharts(m);
    if (v.kind === 'hteacher' || v.kind === 'teacher') loadDebriefs(v.key);
  }


  // ---------- render ----------
  function render() {
    if (!S.data) return;
    writeHash();
    $('#nav').innerHTML = NAV.map(([t, items]) => `<div class="nav-g">${t ? `<span class="nav-t">${t}</span>` : ''}${items.map(([k, l]) => `<button type="button" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</div>`).join('');
    $('#h1').textContent = TABS.find((t) => t[0] === S.tab)[1];
    $('#crumbs').innerHTML = crumbs();
    $('#presetSel').innerHTML = presets().map(([k, l]) => `<option value="${k}" ${S.preset === k ? 'selected' : ''}>${l}</option>`).join('');
    $('#custom').hidden = S.preset !== 'custom';
    $('#from').value = iso(S.from); $('#to').value = iso(S.to);
    $('#from').min = $('#to').min = iso(0); $('#from').max = $('#to').max = iso(S.data.today);
    const sectors = [...new Set(S.data.schools.map((s) => s.sector))].sort();
    $('#sector').innerHTML = `<option value="">All sectors</option>${sectors.map((s) => `<option ${S.sector === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}`;
    const schools = S.data.schools.map((s, i) => [i, s]).filter(([, s]) => !S.sector || s.sector === S.sector).sort((a, b) => a[1].name.localeCompare(b[1].name));
    $('#school').innerHTML = `<option value="">All schools${S.sector ? ` in ${esc(S.sector)}` : ''} (${schools.length})</option>${schools.map(([i, s]) => `<option value="${i}" ${S.school === String(i) ? 'selected' : ''}>${esc(s.name)} (${esc(s.emis)})</option>`).join('')}`;
    $('#period').innerHTML = `<b>${periodText()}</b>`;
    $('#granTop').innerHTML = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => `<button type="button" data-gran="${k}" aria-pressed="${S.gran === k}">${l}</button>`).join('');
    $('#present').textContent = document.body.classList.contains('present') ? 'Exit presentation' : 'Present';
    const R = Calc.rollup(S.P, sel());
    const missing = Object.entries(S.P.parts).filter(([, ok]) => !ok).map(([k]) => k);
    const NAMES = { exam_detail: 'exam analytics', lp: 'lesson plans', obs: 'observations', exams: 'exam generator', quiz_scores: 'quiz scores', quiz: 'quizzes', quiz_sectors: 'children per sector', training: 'training' };
    const what = missing.map((k) => NAMES[k] || k).join(', ');
    const warn = !missing.length ? '' : S.refreshing
      ? `<p class="note">Updating now: ${what} will appear in a few minutes. This page will refresh itself.</p>`
      : `<p class="note warn">Some data could not be loaded in the last refresh (${what}); those figures show as blank or zero.</p>`;
    const views = { overview: viewOverview, lp: viewLp, dc: (R) => viewDc(R) + dcAnalytics(), hitl: (R) => viewHitl(R) + hitlAnalytics(), observe2: viewObserve2, egra: viewEgra, spotlight: viewSpotlight, fico: viewFico, quiz: viewQuiz, exams: viewExams, training: viewTraining, schools: viewSchools, teachers: viewTeachers, trends: viewTrends };
    const focus = document.activeElement && document.activeElement.id === 'search' ? document.activeElement.selectionStart : null;
    charts.length = 0;
    $('#main').innerHTML = `<div class="grid">${warn}${views[S.tab](R)}</div>`;
    drawCharts($('#main'));
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
  // ---------- feedback ----------
  // Anyone can send feedback; it goes to the server's feedback store, which only the admin review page reads.
  (function feedback() {
    const dlg = $('#fb'), form = $('#fb-form'), out = $('#fb-msg-out'), send = $('#fb-send');
    if (!dlg) return;
    const tabName = () => ((TABS.find((t) => t[0] === S.tab) || [S.tab, S.tab])[1]);
    const context = () => (S.data ? `${tabName()} · ${scopeName()} · ${periodText()}` : '');
    const close = () => { if (dlg.open) dlg.close(); };
    $('#fb-open').addEventListener('click', () => {
      out.textContent = ''; out.className = 'note'; send.disabled = false;
      $('#fb-ctx').textContent = context() ? `Sent with what you're looking at: ${context()}.` : '';
      dlg.showModal(); $('#fb-msg').focus();
    });
    $('#fb-x').addEventListener('click', close);
    $('#fb-cancel').addEventListener('click', close);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const body = { type: f.get('type'), message: f.get('message'), name: f.get('name'), contact: f.get('contact'), website: f.get('website'), tab: tabName(), context: context() };
      send.disabled = true; out.className = 'note'; out.textContent = 'Sending…';
      try {
        const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Could not send, please try again.');
        out.textContent = 'Thank you — your feedback is in. Hasnat reviews it and decides what to work on next.';
        form.reset(); setTimeout(close, 2200);
      } catch (err) {
        out.className = 'note warn'; out.textContent = err.message; send.disabled = false;
      }
    });
  })();

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, tr.click');
    if (!b) return;
    if (b.dataset.preset) { if (b.dataset.preset === 'custom') { S.preset = 'custom'; render(); } else setPreset(b.dataset.preset); }
    else if (b.dataset.tab) { S.tab = b.dataset.tab; S.search = ''; render(); window.scrollTo(0, 0); }
    else if (b.dataset.gran) { S.gran = b.dataset.gran; render(); }
    else if (b.dataset.dl) download(b.dataset.dl);
    else if (b.dataset.mview) { S.mview = b.dataset.mview; render(); }
    else if (b.dataset.qview) { S.qview = b.dataset.qview; render(); }
    else if (b.dataset.fkind) { S.fkind = b.dataset.fkind; render(); }
    else if (b.dataset.slens) { S.slens = b.dataset.slens; render(); }
    else if (b.dataset.dview) { S.dview = b.dataset.dview; render(); }
    else if (b.dataset.focus) {
      const f = b.dataset.focus, i = f.indexOf(':'), kind = i < 0 ? f : f.slice(0, i), val = i < 0 ? '' : f.slice(i + 1);
      if (kind === 'clear') { S.sector = ''; S.school = ''; }
      else if (kind === 'sector') { S.sector = S.sector === val && S.school === '' && b.closest('#c-hm, .hero') ? '' : val; S.school = ''; }
      else if (kind === 'school') { S.school = S.school === val ? '' : val; if (S.school !== '') S.sector = S.data.schools[+val].sector; }
      else if (kind === 'tab') { S.tab = val; S.search = ''; window.scrollTo(0, 0); }
      render();
    }
    else if (b.id === 'present') { document.body.classList.toggle('present'); render(); }
    else if (b.dataset.sort) {
      const [id, k] = b.dataset.sort.split(':');
      const cur = S.sort[id];
      S.sort[id] = { k, dir: cur && cur.k === k ? -cur.dir : (k === 'name' || k === 'school' || k === 'sector' ? 1 : -1) };
      render();
    } else if (b.dataset.row) { const i = b.dataset.row.indexOf(':'); S.lastTable = b.dataset.row.slice(0, i); const h = rowHandlers[S.lastTable]; if (h) h(b.dataset.row.slice(i + 1)); }
    else if (b.id === 'm-x') $('#modal').close();
    else if (b.id === 'm-back') { MS.pop(); renderModal(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr.click')) e.target.click(); });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'presetSel') { if (t.value === 'custom') { S.preset = 'custom'; render(); } else setPreset(t.value); }
    else if (t.id === 'sector') { S.sector = t.value; S.school = ''; render(); }
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
    const tip = document.getElementById('tip') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'tip', className: 'tip' });
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.textContent = t.getAttribute('data-tip');
    Object.assign(tip.style, { display: 'block', position: 'fixed', left: `${Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8)}px`, top: `${e.clientY + 12}px` });
  });

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => drawCharts(), 150); });

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
      $('#headline').innerHTML = `<b>${N(a.teachers)}</b> primary teachers in <b>${N(a.schools)}</b> schools across <b>${new Set(S.data.schools.map((s) => s.sector)).size}</b> ICT sectors · updated ${esc(S.data.as_of)}`;
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
      // New data on the server (a scheduled or post-update refresh finished): reload it in place.
      if (S.data && s.as_of && s.as_of !== S.data.as_of && !s.refreshing) { S.refreshing = false; load(); return; }
      if (S.refreshing !== !!s.refreshing) { S.refreshing = !!s.refreshing; render(); }
      const el = $('#status');
      el.className = s.last_error ? 'warn' : '';
      el.textContent = s.last_error ? `Last refresh had a problem (${s.last_error.slice(0, 160)}); showing data from ${s.as_of}.` : `Refreshes automatically every day at ${(s.schedule_pkt || []).join(' and ')} PKT.`;
    } catch { /* ignore */ }
  }
  setInterval(status, 60000);
  load();
})();
