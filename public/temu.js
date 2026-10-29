// TEMU, the dashboard guide: a 3D parrot in the corner (three.js, loaded after the page) who gives a tour,
// explains the page you are on and answers common questions. Every answer is written here, not generated,
// so TEMU never makes up a number. It drives the dashboard only through its own nav buttons.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'temu.v1';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set(p) { try { localStorage.setItem(KEY, JSON.stringify({ ...store.get(), ...p })); } catch { /* private window */ } },
  };

  // ---------- what TEMU knows ----------
  const PAGES = {
    overview: ['Overview', 'The big picture for the period and place you picked. Up top, four headline cards: lesson-plan engagement, DC coverage, HITL coverage and Teacher Leader certificates. The small green ▲ and red ▼ compare with the period of the same length just before. Below: activity counts, the <b>teacher reach ladder</b> (the share of teachers each part of the programme reached; every rung is counted on its own, so it’s a ladder, not a funnel) and <b>needs attention</b> notes written from the figures. Click a note’s tag to focus that sector.'],
    lp: ['Lesson plans', 'Who used a grade 1–5 lesson plan: generated one with Rumi (WhatsApp or the portal) or opened one in the teacher app. <b>LP engagement %</b> = teachers who used at least one plan ÷ primary teachers. Then a trend, a table by sector, school or teacher, and analytics: subjects, grades, day of the week, hour of the day, the lessons most taught (seen in DC) and the lessons most generated.'],
    quiz: ['Quizzes', 'Lesson quizzes teachers made, and the children who took them through the teacher’s share link. Children are counts only; no child is ever named. Quiz scores are marked provisional until the data team writes a rule for them.'],
    exams: ['Exam generator', 'Exam papers teachers asked for and the ones that came out, on WhatsApp or the portal, including grade 5 <b>FDE board papers</b>. Analytics by subject, grade, how papers are made, day, hour and the most examined chapters.'],
    dc: ['DC observations', 'The <b>Digital Coach</b>: a teacher records a lesson and the AI scores it on FICO. <b>DC coverage</b> = teachers with at least one scored recording. Below: subjects, grades, a grade × subject heatmap and what stands out. DC is never added to coach visits.'],
    hitl: ['HITL observations', '<b>HITL</b> (human in the loop): a coach watches a lesson in person with /observe. You’ll see observations, teachers observed and debrief stages, then analytics by coach (click a coach to see their schools, teachers, scores and debrief reports), principals doing HITL, observations per teacher, grades and weekdays.'],
    observe2: ['/observe2 pilot', 'The impact team’s experiment: coaches score 17 indicators (fico17) themselves. It is counted on its own and never added to HITL or FICO figures. Progress by week, what we are learning, and the pilot study’s four questions.'],
    fico: ['FICO scores', 'FICO has four sections: lesson-plan fidelity, subject knowledge, teaching practices and student engagement, each shown as score ÷ maximum. DC and HITL are never mixed. Then all 37 indicators (FICO v3, from 8 Sep), by sector and week by week. Bands: <b>Exemplary</b> 80%+, <b>Proficient</b> 70–79.9%, <b>Developing</b> 60–69.9%, <b>Needs support</b> under 60%.'],
    egra: ['Learning assessment', 'Children’s reading (EGRA, Urdu and English) and maths (EGMA), tested on coaches’ phones with children drawn at random. Only totals are shown, and any group of fewer than 5 children says “fewer than 5”. Benchmarks are proposed, scores are AI-marked. At the bottom: children’s learning beside their teachers’ teaching, by sector and school.'],
    training: ['Training', 'NIETE primary training, all time: who is on the programme, modules finished, and Level 0–3 certificates (Aspiring Teacher, Emerging Practitioner, Skilled Practitioner, Teacher Leader).'],
    schools: ['All schools', 'Every ICT school with its figures for the period. Click a column header to sort, click a school for its details, and use <b>Download CSV</b> for the whole table.'],
    teachers: ['Teachers', 'Every primary teacher. Search by name, then click a teacher for their scorecard: activity, FICO scores, the score trend and their HITL <b>debrief reports</b> (strengths, areas of growth, action plan).'],
    calendar: ['School calendar', 'Exams, sports weeks, holidays, events and closures entered by coaches, plus federal public holidays. Use it to see whether a dip in engagement has a reason. Coaches need the calendar passcode to add an entry.'],
    report: ['Monthly report', 'Pick a month and get a one-page summary: sectors, FICO, schools leading and needing support, the calendar and children’s learning. Print it or save it as a PDF.'],
    spotlight: ['Leading & support', 'Schools and teachers leading the way, and where support is most needed, on using the tools or on classroom practice, with minimum sample sizes. It’s for celebrating and planning support, not for judging.'],
    trends: ['Analytics', 'Week-by-week trends of the key measures: lesson plans, plans taught, observations, FICO scores, exams and quizzes.'],
    glossary: ['How we count', 'What every number means and where it comes from. <b>Governed</b> = defined by the Taleemabad data rules. <b>Provisional</b> = set by the programme, may change. There’s a search box at the top.'],
  };

  // [question, answer, tab to open, element to point at]
  const FAQ = [
    ['What is LP engagement?', 'The share of primary teachers who used at least one grade 1–5 lesson plan in the period: generated with Rumi or opened in the teacher app.', 'lp', '#c-lp'],
    ['What is the difference between DC and HITL?', '<b>DC</b> is the Digital Coach: the teacher records their own lesson and the AI scores it. <b>HITL</b> is a coach sitting in the classroom with /observe. Both use FICO, but they are never added together.', 'dc', '#c-dc'],
    ['What is FICO?', 'The lesson-observation framework with four sections: lesson-plan fidelity, subject knowledge, teaching practices and student engagement. Bands: Exemplary 80%+, Proficient 70–79.9%, Developing 60–69.9%, Needs support under 60%.', 'fico', '#c-fico'],
    ['What is /observe2?', 'The impact team’s pilot where coaches score 17 indicators themselves. It has its own tab and is never added to HITL or FICO.', 'observe2', null],
    ['Where are the debrief reports?', 'Two places: open <b>Teachers</b> and click a teacher (reports are at the bottom of the scorecard), or open <b>HITL observations</b>, scroll to “By coach” and click a coach.', 'teachers', '#c-tch'],
    ['How do I change the period, sector or school?', 'Use the filter bar at the top. Every number on every tab follows it. “Group charts by” switches trends between daily, weekly and monthly.', null, '#filters'],
    ['What do the ▲ and ▼ marks mean?', 'They compare the period you picked with the period of the same length just before it: percentage points for shares, per cent for counts. Nothing to compare for “Since 1 Aug”, so they hide.', 'overview', '.hero'],
    ['How do I download a chart or table?', '<b>Download image</b> on any section saves a PNG; the button at the top saves the whole page. Tables also have <b>Download CSV</b>, which opens in Excel. <b>Present</b> hides the menus for a meeting screen.', null, '.top-btns'],
    ['How fresh is the data?', 'It refreshes by itself every day (the footer says when), and the date under the title says when it was last updated. If a part fails, the page says so and keeps yesterday’s figures for it.', null, '.foot'],
    ['Why is a number blank or zero?', 'Usually nothing happened in that period or place. Try “Since 1 Aug” or All sectors. If a refresh had a problem, a yellow note at the top says which part is missing.', null, '#filters'],
    ['Who counts as a primary teacher?', 'A verified teacher account at an ICT programme school whose teaching level includes primary. Test accounts and teachers with no level recorded are left out.', 'glossary', '#c-g0'],
    ['What is EGRA / the learning assessment?', 'A short reading and maths test for children drawn at random, done on the coach’s phone. Only totals are shown, never a child’s name, and groups under 5 children are hidden.', 'egra', null],
    ['How do coaches add a school calendar entry?', 'Open <b>School calendar</b> and use the form. It asks for the coaches’ calendar passcode; ask Hasnat if you don’t have it.', 'calendar', '#c-cal0'],
    ['Who is leading and who needs support?', '<b>Leading & support</b> ranks schools and teachers on using the tools or on classroom practice, with minimum samples so one lesson can’t top the chart.', 'spotlight', '#c-sp0'],
    ['Can I share this dashboard?', 'Inside the NIETE and Taleemabad team only. Please don’t send the link to teachers, school heads or anyone outside: it shows named teachers’ FICO scores.', null, '.confid'],
    ['Something looks wrong. Who do I tell?', 'Press <b>Feedback</b> at the bottom right. Hasnat reads every message.', null, '#fb-open'],
  ];

  const TOUR = [
    ['overview', '.confid', 'First, the red note. This dashboard is <b>internal only</b>: it shows teachers by name with their FICO scores. Not for teachers, school heads or outsiders. Our little secret.'],
    [null, '#nav', 'This is the menu: <b>Teaching</b>, <b>Observation</b>, <b>Children</b>, <b>Growth</b>, <b>Directory</b> and <b>Insights</b>. I’ve memorised every tab, so you don’t have to.'],
    [null, '#filters', 'The filters. Pick a period, a sector or a school, and <b>every</b> number on every tab follows. “Group charts by” switches trends between days, weeks and months.'],
    ['overview', '.hero', 'The four headline cards: lesson-plan engagement, DC coverage, HITL coverage and Teacher Leaders. Green ▲ and red ▼ show the change from the period before.'],
    ['overview', '#c-ladder', 'The reach ladder: what share of teachers each part of the programme reached. Each rung is counted on its own, so it’s a ladder, not a funnel.'],
    ['lp', '#c-lp', '<b>Lesson plans</b>: who used a grade 1–5 plan from Rumi or the teacher app. Scroll down for subjects, grades and the most taught lessons.'],
    ['dc', '#c-dc', '<b>DC observations</b>: teachers record a lesson and the Digital Coach scores it. Analytics by subject and grade sit below.'],
    ['hitl', '#c-hitl', '<b>HITL observations</b>: coaches observing lessons in person. Click a coach further down to see their schools, teachers, scores and debrief reports.'],
    ['fico', '#c-fico', '<b>FICO scores</b>: four sections, then all 37 indicators. DC and HITL are kept apart. Apples and mangoes.'],
    ['egra', null, '<b>Learning assessment</b>: how children read and do maths. Totals only, and groups under 5 children are hidden.'],
    ['teachers', '#c-tch', '<b>Teachers</b>: search for anyone and click them for a scorecard with their trend and debrief reports.'],
    ['spotlight', '#c-sp0', '<b>Leading & support</b>: where to celebrate and where to send help. Kind rankings, I promise.'],
    ['calendar', '#c-cal0', 'The <b>school calendar</b>: exams, holidays, sports weeks and closures, so a dip in engagement has an explanation.'],
    ['report', '#c-rep0', 'The <b>monthly report</b>: one page per month, ready to print or save as a PDF for meetings.'],
    ['glossary', '#c-g0', '<b>How we count</b>: what every number means. When in doubt, look here. Or ask me; I’m cheaper than a meeting.'],
    [null, '.top-btns', '<b>Download image</b> saves the page as a picture and <b>Present</b> hides the menus for a big screen. Tables also have <b>Download CSV</b>.'],
    [null, '#fb-open', 'And if something is wrong or missing, press <b>Feedback</b>. That’s the tour! Click me any time you need me.'],
  ];

  const QUIPS = [
    'Yes? I’m all ears. Well, all feathers.',
    'Ask me anything about the dashboard. Except the cricket score.',
    'I have read every number on this page. Twice.',
    'Need a hand? I only have wings, but they work.',
  ];

  // ---------- the panel ----------
  const root = document.createElement('div');
  root.className = 'temu';
  root.innerHTML = `
    <section class="temu-panel" id="temu-panel" role="dialog" aria-label="TEMU, your dashboard guide" hidden>
      <div class="temu-h"><b>TEMU</b><span class="temu-step" id="temu-step"></span><button class="temu-x" type="button" data-temu="close" aria-label="Close">×</button></div>
      <div class="temu-say" id="temu-say" aria-live="polite"></div>
      <div class="temu-acts" id="temu-acts"></div>
    </section>
    <button class="temu-bird" id="temu-bird" type="button" aria-label="TEMU, your dashboard guide" aria-expanded="false" aria-controls="temu-panel">
      <canvas id="temu-cv" aria-hidden="true"></canvas><span class="temu-fb" aria-hidden="true" hidden>🦜</span>
    </button>`;
  const chip = Object.assign(document.createElement('button'), { className: 'temu-chip', type: 'button', textContent: 'Ask TEMU', hidden: true });
  const hlBox = Object.assign(document.createElement('div'), { className: 'temu-hl', hidden: true });
  document.body.append(hlBox, root, chip);
  const panel = $('#temu-panel'), say = $('#temu-say'), acts = $('#temu-acts'), step = $('#temu-step'), bird = $('#temu-bird');

  const anim = { talkUntil: 0, waveUntil: 0, jumpAt: -10, now: 0 };
  let typing = null;
  function speak(html) {
    clearInterval(typing);
    const plain = html.replace(/<[^>]+>/g, '');
    anim.talkUntil = anim.now + Math.min(plain.length * 0.03, 4);
    if (reduced) { say.innerHTML = html; return; }
    let i = 0;
    const by = Math.max(1, Math.ceil(plain.length / 90));
    say.textContent = '';
    typing = setInterval(() => {
      i += by;
      if (i >= plain.length) { clearInterval(typing); say.innerHTML = html; } else say.textContent = plain.slice(0, i);
    }, 16);
  }
  const btn = (act, label, cls = '') => `<button type="button" class="temu-b ${cls}" data-temu="${act}">${label}</button>`;
  const currentTab = () => ($('#nav [aria-current="page"]') || {}).dataset?.tab || 'overview';
  function goTab(tab) {
    if (!tab || tab === currentTab()) return;
    const b = $(`#nav [data-tab="${tab}"]`);
    if (b) b.click();
  }

  // ---------- pointing at things ----------
  let hlEl = null;
  function point(sel) {
    hlEl = sel ? $(sel) : null;
    if (!hlEl || !hlEl.getClientRects().length) { hlEl = null; hlBox.hidden = true; return; }
    const tall = hlEl.getBoundingClientRect().height > innerHeight * 0.6;
    hlEl.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reduced ? 'auto' : 'smooth' });
    hlBox.hidden = false;
    placeHl();
  }
  function placeHl() {
    if (!hlEl) return;
    const r = hlEl.getBoundingClientRect(), p = 6;
    Object.assign(hlBox.style, { left: `${r.left - p}px`, top: `${r.top - p}px`, width: `${r.width + 2 * p}px`, height: `${r.height + 2 * p}px` });
  }
  addEventListener('scroll', placeHl, { passive: true, capture: true });
  addEventListener('resize', placeHl);

  // ---------- screens ----------
  let tourI = -1, tourFrom = 'overview';
  function open() {
    panel.hidden = false; bird.setAttribute('aria-expanded', 'true');
  }
  function close() {
    clearInterval(typing);
    if (tourI >= 0) endTour(false);
    panel.hidden = true; bird.setAttribute('aria-expanded', 'false'); point(null);
  }
  function home(first) {
    open(); step.textContent = ''; point(null);
    anim.waveUntil = anim.now + 2.2;
    speak(first
      ? 'Assalam-o-Alaikum! I’m <b>TEMU</b>, your guide to the ICT Primary Dashboard. New here? I can show you around in about a minute.'
      : QUIPS[Math.floor(Math.random() * QUIPS.length)]);
    acts.innerHTML = btn('tour', 'Take the tour', 'pri') + btn('page', 'What’s on this page?') + btn('faq', 'Ask a question') + (first ? btn('close', 'Not now') : btn('hide', 'Hide TEMU'));
  }
  function page() {
    open(); step.textContent = ''; point(null);
    const [name, text] = PAGES[currentTab()] || PAGES.overview;
    speak(`<b>${esc(name)}.</b> ${text}`);
    acts.innerHTML = btn('faq', 'Ask a question') + (currentTab() !== 'glossary' ? btn('go:glossary', 'How we count') : '') + btn('home', 'Back');
  }
  function faq() {
    open(); step.textContent = ''; point(null);
    speak('What would you like to know? Pick a question, or type a word to search.');
    acts.innerHTML = `<input class="temu-q" id="temu-q" type="search" placeholder="e.g. debrief, FICO, download" aria-label="Search questions"><div class="temu-list" id="temu-list"></div>${btn('home', 'Back')}`;
    list('');
    if (!matchMedia('(pointer: coarse)').matches) $('#temu-q').focus();
  }
  function list(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = FAQ.map((f, i) => [f, i]).filter(([[qq, a]]) => words.every((w) => `${qq} ${a}`.toLowerCase().includes(w)));
    $('#temu-list').innerHTML = hits.length
      ? hits.map(([[qq], i]) => btn(`ans:${i}`, esc(qq), 'q')).join('')
      : '<p class="temu-none">Hmm, I don’t know that one yet. Try another word, or press Feedback and ask Hasnat.</p>';
  }
  function answer(i) {
    const [q, a, tab, sel] = FAQ[i];
    step.textContent = '';
    speak(`<b>${esc(q)}</b> ${a}`);
    acts.innerHTML = (tab || sel ? btn(`show:${i}`, tab && tab !== currentTab() ? 'Take me there' : 'Show me', 'pri') : '') + btn('faq', 'More questions') + btn('home', 'Back');
  }
  function show(i) {
    const [, , tab, sel] = FAQ[i];
    goTab(tab);
    setTimeout(() => point(sel || '#main'), 60);
    anim.jumpAt = anim.now;
  }
  function tour(i) {
    if (tourI < 0) tourFrom = currentTab();
    tourI = i;
    const [tab, sel, text] = TOUR[i];
    open();
    goTab(tab);
    setTimeout(() => point(sel || '#main'), 60);
    step.textContent = `${i + 1} / ${TOUR.length}`;
    if (i === TOUR.length - 1) anim.waveUntil = anim.now + 2.5; else anim.jumpAt = anim.now;
    speak(text);
    acts.innerHTML = (i > 0 ? btn(`tour:${i - 1}`, '‹ Back') : '')
      + (i < TOUR.length - 1 ? btn(`tour:${i + 1}`, 'Next ›', 'pri') + btn('endtour', 'End tour') : btn('endtour', 'Finish', 'pri'));
    store.set({ seen: 1 });
  }
  function endTour(talk = true) {
    const back = tourFrom;
    tourI = -1; point(null); step.textContent = '';
    goTab(back);
    if (talk) { speak('Tour done! I’ll be right here in the corner. Click me any time.'); acts.innerHTML = btn('page', 'What’s on this page?') + btn('faq', 'Ask a question') + btn('close', 'Close'); }
  }
  function hide() {
    close(); root.hidden = true; chip.hidden = false; store.set({ hidden: 1 });
  }
  function unhide() {
    root.hidden = false; chip.hidden = true; store.set({ hidden: 0 }); start(); home(false);
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-temu]');
    if (!b) return;
    const [act, arg] = b.dataset.temu.split(':');
    ({
      close, home: () => home(false), page, faq, hide,
      tour: () => tour(arg === undefined ? 0 : +arg), endtour: () => endTour(true),
      ans: () => answer(+arg), show: () => show(+arg),
      go: () => { goTab(arg); close(); },
    })[act]();
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'temu-q') list(e.target.value); });
  bird.addEventListener('click', () => {
    anim.jumpAt = anim.now;
    if (panel.hidden) home(!store.get().seen); else if (tourI < 0) close();
  });
  chip.addEventListener('click', unhide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) close(); });

  // ---------- the 3D parrot ----------
  const look = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    if (hlEl) return;
    const r = bird.getBoundingClientRect();
    look.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2)));
    look.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 3)) / (innerHeight / 2)));
  }, { passive: true });

  function fallback() { $('#temu-cv').hidden = true; $('.temu-fb', root).hidden = false; }

  function build(THREE, canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.7, 8.6); camera.lookAt(0, 1.55, 0);
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a3a7a, 0.8));
    const key = new THREE.DirectionalLight(0xfff3e0, 1.25); key.position.set(3, 6, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 0.9); rim.position.set(-4, 3, -5); scene.add(rim);

    const mat = (hex, rough = 0.42) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), roughness: rough, metalness: 0 });
    const C = { green: 0x35c03f, light: 0x8fe060, dark: 0x1c8c34, orange: 0xff8a1c, white: 0xffffff, black: 0x14161f, frame: 0x2b2f3a, mouth: 0x8a1f2a, shoe: 0xf08a24, sole: 0xc4621a };
    const SPH = new THREE.SphereGeometry(1, 40, 28);
    function ball(r, color, pos, scale, parent, rough) {
      const m = new THREE.Mesh(SPH, typeof color === 'object' ? color : mat(color, rough));
      m.position.set(...pos);
      m.scale.set(...(scale || [1, 1, 1]).map((v) => v * r));
      parent.add(m); return m;
    }
    function rod(a, b, r, color, parent) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 14), mat(color, 0.35));
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      parent.add(m); return m;
    }
    // A smooth tube along a curve whose radius tapers from r0 to r1: the curved parrot beak.
    function sweep(p0, p1, p2, r0, r1, color, parent, sx) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...p0), new THREE.Vector3(...p1), new THREE.Vector3(...p2));
      const T = 64, R = 32, geo = new THREE.TubeGeometry(curve, T, 1, R, false), pos = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i <= T; i++) {
        const u = i / T, c = curve.getPointAt(u), r = r0 + (r1 - r0) * Math.pow(u, 0.75);
        for (let j = 0; j <= R; j++) {
          const k = i * (R + 1) + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r); v.x *= sx;
          pos.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
        }
      }
      geo.computeVertexNormals();
      const m = mat(color, 0.3);
      parent.add(new THREE.Mesh(geo, m));
      ball(r0, m, p0, [sx, 1, 1], parent);
      ball(r1, m, curve.getPointAt(1).toArray(), [sx, 1, 1], parent);
    }

    const temu = new THREE.Group(); scene.add(temu);
    const body = new THREE.Group(); temu.add(body);
    ball(1, C.green, [0, 1.0, 0], [0.7, 0.8, 0.65], body);
    ball(1, C.light, [0, 0.92, 0.3], [0.52, 0.6, 0.4], body);
    [[-0.14, 0.25], [0, 0], [0.14, -0.25]].forEach(([x, rz]) => { ball(1, C.dark, [x, 0.5, -0.62], [0.11, 0.42, 0.08], body).rotation.set(-0.85, 0, rz); });
    [-1, 1].forEach((s) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 3), mat(C.white, 0.5));
      c.position.set(s * 0.13, 1.47, 0.55); c.rotation.set(0.35, 0, s * 2.2); c.scale.set(1, 1, 0.35); body.add(c);
    });
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.08), mat(C.orange, 0.4)); knot.position.set(0, 1.43, 0.6); knot.rotation.x = 0.3; body.add(knot);
    const tie = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(C.orange, 0.4));
    tie.scale.set(0.12, 0.3, 0.035); tie.position.set(0, 1.15, 0.72); tie.rotation.x = 0.18; body.add(tie);
    [-1, 1].forEach((s) => {
      rod([s * 0.24, 0.42, 0.05], [s * 0.26, 0.14, 0.08], 0.065, C.orange, temu);
      ball(1, C.shoe, [s * 0.28, 0.12, 0.16], [0.21, 0.12, 0.33], temu, 0.5);
      ball(1, C.sole, [s * 0.28, 0.05, 0.16], [0.22, 0.05, 0.34], temu, 0.6);
    });
    function wing(s) {
      const g = new THREE.Group(); g.position.set(s * 0.62, 1.32, 0.02); body.add(g);
      ball(1, C.green, [0, -0.4, 0], [0.2, 0.52, 0.32], g);
      [-0.12, 0, 0.12].forEach((z, i) => { ball(1, C.dark, [s * 0.02, -0.86 + i * 0.03, z], [0.07, 0.22, 0.07], g).rotation.x = z * 1.5; });
      return g;
    }
    const wingL = wing(-1), wingR = wing(1);

    const head = new THREE.Group(); head.position.set(0, 1.5, 0); body.add(head);
    ball(0.78, C.green, [0, 0.65, 0], null, head);
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.055, 14, 40, Math.PI * 1.6), mat(C.dark, 0.4));
    curl.position.set(0, 1.55, 0.02); curl.rotation.set(0, Math.PI / 2, -0.4); head.add(curl);
    [-0.09, 0.09].forEach((x) => { ball(1, C.green, [x, 1.45, -0.12], [0.07, 0.24, 0.07], head).rotation.set(-0.5, 0, -x * 3); });
    const eyes = [], pupils = [];
    [-1, 1].forEach((s) => {
      const e = new THREE.Group(); e.position.set(s * 0.28, 0.76, 0.6); head.add(e);
      ball(0.22, C.white, [0, 0, 0], [1, 1.05, 0.7], e, 0.25);
      const p = new THREE.Group(); e.add(p);
      ball(0.11, C.black, [0, 0, 0.13], [1, 1.1, 0.6], p, 0.2);
      ball(0.035, C.white, [0.04, 0.05, 0.2], null, p, 0.1);
      eyes.push(e); pupils.push(p);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 14, 44), mat(C.frame, 0.3));
      ring.position.set(s * 0.29, 0.76, 0.8); head.add(ring);
      rod([s * 0.55, 0.78, 0.78], [s * 0.74, 0.8, 0.15], 0.025, C.frame, head);
    });
    rod([-0.04, 0.8, 0.82], [0.04, 0.8, 0.82], 0.03, C.frame, head);
    ball(0.17, C.mouth, [0, 0.4, 0.68], [1, 0.8, 1], head, 0.7);
    sweep([0, 0.5, 0.6], [0, 0.7, 1.18], [0, 0.16, 1.08], 0.29, 0.03, C.orange, head, 1.1);
    const jaw = new THREE.Group(); jaw.position.set(0, 0.38, 0.64); head.add(jaw);
    sweep([0, 0, 0], [0, -0.13, 0.24], [0, -0.03, 0.36], 0.19, 0.05, 0xffa630, jaw, 1.05);
    ball(1, 0xe2566a, [0, 0.03, 0.14], [0.08, 0.04, 0.09], jaw, 0.6);

    function size() {
      const w = canvas.clientWidth || 130, h = canvas.clientHeight || 160;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    size(); addEventListener('resize', size);

    const clock = new THREE.Clock();
    const ease = (a, b, k) => a + (b - a) * k;
    let nextBlink = 2;
    (function tick() {
      requestAnimationFrame(tick);
      if (root.hidden || document.hidden) return;
      const t = clock.getElapsedTime(); anim.now = t;
      const calm = reduced ? 0 : 1;
      body.scale.y = 1 + Math.sin(t * 2.2) * 0.015 * calm;
      body.rotation.z = Math.sin(t * 0.9) * 0.03 * calm;
      const j = t - anim.jumpAt;
      temu.position.y = calm && j >= 0 && j < 0.6 ? Math.sin((j / 0.6) * Math.PI) * 0.45 : 0;
      // look at the pointer, or at whatever TEMU is pointing out
      let lx = look.x, ly = look.y;
      if (hlEl) {
        const r = hlEl.getBoundingClientRect(), b = bird.getBoundingClientRect();
        lx = Math.max(-1, Math.min(1, (r.left + r.width / 2 - (b.left + b.width / 2)) / (innerWidth / 2)));
        ly = Math.max(-1, Math.min(1, (r.top + r.height / 2 - b.top) / (innerHeight / 2)));
      }
      head.rotation.y = ease(head.rotation.y, lx * 0.6, 0.08);
      head.rotation.x = ease(head.rotation.x, ly * 0.3, 0.08);
      head.rotation.z = Math.sin(t * 0.8) * 0.06 * calm;
      pupils.forEach((p) => { p.position.x = ease(p.position.x, lx * 0.05, 0.15); p.position.y = ease(p.position.y, -ly * 0.04, 0.15); });
      if (t > nextBlink) nextBlink = t + 2.5 + Math.random() * 3;
      const bl = nextBlink - t, lid = bl < 0.12 ? Math.abs(bl - 0.06) / 0.06 : 1;
      eyes.forEach((e) => { e.scale.y = Math.max(0.08, lid); });
      jaw.rotation.x = t < anim.talkUntil ? 0.15 + Math.abs(Math.sin(t * 13)) * 0.4 : ease(jaw.rotation.x, 0.15, 0.2);
      const waving = t < anim.waveUntil;
      wingR.rotation.z = ease(wingR.rotation.z, waving ? 2.3 + Math.sin(t * 9) * 0.35 : 0.12 + Math.sin(t * 2.2) * 0.04 * calm, 0.12);
      wingL.rotation.z = -0.12 - Math.sin(t * 2.2) * 0.04 * calm;
      renderer.render(scene, camera);
    })();
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    const canvas = $('#temu-cv');
    const go = () => { try { build(window.THREE, canvas); } catch (e) { console.error(e); fallback(); } };
    if (window.THREE) return go();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = go; s.onerror = fallback;
    document.head.appendChild(s);
  }

  // Wait for the dashboard to draw its menu, then appear; greet first-time visitors.
  function boot() {
    if (!$('#nav [data-tab]')) { setTimeout(boot, 500); return; }
    const st = store.get();
    if (st.hidden) { root.hidden = true; chip.hidden = false; return; }
    start();
    if (!st.seen) setTimeout(() => { if (panel.hidden) home(true); store.set({ seen: 1 }); }, 1500);
  }
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();
