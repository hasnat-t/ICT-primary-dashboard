// TEMU, the dashboard guide: a 3D parrot in the corner (three.js, loaded after the page) who gives a tour,
// explains the page you are on, answers common questions, reads out the headline numbers and does a few
// moves. Every answer is written here, not generated, so TEMU never makes up a number; the only figures it
// says are read off the page itself. It drives the dashboard only through its own nav buttons.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'temu.v1';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set(p) { try { localStorage.setItem(KEY, JSON.stringify({ ...store.get(), ...p })); } catch { /* private window */ } },
  };

  // ---------- what TEMU knows ----------
  // Everything TEMU knows about each tab: [name, what it is, [[selector, section, what it shows and what you can do]]].
  // "Show me around this page" walks the sections that are on screen; the full tour visits every tab in menu order.
  // Keep it in step with the page: when a tab or section is added or renamed, add or rename it here (CLAUDE.md).
  const GUIDE = {
    overview: ['Overview', 'The big picture for the period, sector and school you pick in the filters. Start here every morning, with chai.', [
      ['.hc2', 'ICT teachers', 'Every teacher at an ICT programme school, whatever they teach, counted once, as of the last data refresh. Green teach Primary, orange teach Middle or High, blue teach both; the bar shows the split without overlap. Follows the Sector filter. The rest of the dashboard counts primary teachers only.'],
      ['.champs', 'Champions', 'Which sector did best yesterday (or the last school day) on lesson plans, DC recordings, coach visits, quizzes and exam papers, as a share of its teachers, so big sectors don’t always win, plus the best combined FICO score on Digital Coach lessons (10+ scored lessons in the sector). Badges show streaks and records. With your Sector filter set, each card shows where your sector ranked. Click a card to see that day.'],
      ['.hero', 'Headline cards', 'Four headline measures for primary teachers: lesson-plan engagement, Digital Coach coverage, HITL coverage and Teacher Leader certificates. The badge is the performance band, ▲/▼ compare with the period before, and each dot on the strip is a sector: click one to focus the page on it.'],
      ['.volume', 'Activity counts', 'How much happened in the period: DC and HITL observations, plans taught, quizzes made, children quizzed and exams generated.'],
      ['#c-ladder', 'Teacher reach ladder', 'The share of primary teachers each part of the programme reached. Each rung is counted on its own, so it’s a ladder, not a funnel. Please don’t climb it.'],
      ['#c-att', 'Needs attention', 'Notes written automatically from this period’s figures: drops, sectors that trail, who leads. Click a note to focus that sector or open that tab.'],
      ['#c-mom', 'Momentum', 'The key measures week by week, so you can see what is rising and what is slipping. The current week is faded because it isn’t over yet.'],
      ['#c-hm', 'Sectors at a glance', 'Every sector side by side on every measure, as a share of its primary teachers. Click a sector to focus the whole page on it.'],
      ['#c-stairs', 'Certification staircase', 'How many primary teachers hold each NIETE level certificate, Level 0 to Level 3. The dots are the six sectors.'],
    ]],
    lp: ['Lesson plans', 'Who used a grade 1–5 lesson plan: generated one with Rumi (WhatsApp or the portal) or opened one in the teacher app. LP engagement % = teachers who used at least one ÷ primary teachers.', [
      ['#c-lp', 'Headline', 'Engagement, plans generated, plans opened in the app and plans taught (seen in DC recordings) for your period.'],
      ['#c-lp-trend', 'Over time', 'Plans by day, week or month. Switch with “Group charts by” in the filter bar.'],
      ['#c-lp-t', 'By sector, school or teacher', 'The same measures per sector. Pick a sector to see its schools, a school to see its teachers. Click any row for the details; Download CSV takes the table to Excel.'],
      ['#c-lps', 'By subject', 'Plans generated and taught for each subject.'],
      ['#c-lpg', 'By grade', 'Plans generated and taught for each grade.'],
      ['#c-lpw', 'Day of the week', 'The average plans made on each weekday.'],
      ['#c-lph', 'When plans are made', 'A weekday × hour heatmap; darker means more plans. Spoiler: teachers plan early.'],
      ['#c-lpt', 'Most taught lessons', 'The curriculum lessons most often taught with a Rumi plan attached to the DC recording.'],
      ['#c-lpl', 'Most generated lessons', 'The lessons teachers most often made a plan for.'],
    ]],
    quiz: ['Quizzes', 'Lesson quizzes teachers made, and the children who took them through the teacher’s share link. Children are counts only; nobody is ever named. Not even by me.', [
      ['#c-quiz', 'Headline', 'Quizzes made, children reached, attempts, and the teachers whose children took a quiz.'],
      ['#c-quiz-trend', 'Over time', 'Quizzes and children by day, week or month.'],
      ['#c-quiz-t', 'By sector, school or teacher', 'The same figures per sector, school or teacher. Click a row to drill in.'],
      ['#c-qs', 'Scores at a glance', 'How children scored on finished quizzes, with mastery bands. Provisional until the data team writes a rule for scores.'],
      ['#c-qg', 'By grade and subject', 'Average scores for each grade and subject.'],
      ['#c-qst', 'Score over time', 'The average quiz score week by week.'],
    ]],
    exams: ['Exam generator', 'Exam papers teachers made with Rumi’s exam generator (/assessment on WhatsApp, or the portal), with answer keys, including grade 5 FDE board papers.', [
      ['#c-ex', 'Headline', 'Papers generated and requested, teachers using it, and FDE board papers.'],
      ['#c-ex-trend', 'Over time', 'Papers by day, week or month.'],
      ['#c-ex-t', 'By sector, school or teacher', 'The same figures per sector, school or teacher. Click a row to drill in.'],
      ['#c-exs', 'By subject', 'Papers for each subject.'],
      ['#c-exg', 'By grade', 'Papers generated and requested for each grade.'],
      ['#c-exh', 'How papers are made', 'Seen (the textbook’s own questions), unseen (new questions) or a mix, and where teachers make them.'],
      ['#c-exb', 'FDE board papers', 'Grade 5 papers in the FDE board exam layout.'],
      ['#c-exw', 'Day of the week', 'The average papers made on each weekday.'],
      ['#c-exhh', 'When exams are made', 'A weekday × hour heatmap of papers.'],
      ['#c-exc', 'Most examined chapters', 'The top 25 textbook chapters by papers made.'],
    ]],
    dc: ['DC observations', 'The Digital Coach: a teacher records her own lesson and the AI scores it on FICO. Coverage = teachers with at least one scored recording. A very patient robot at the back of the class. Never added to coach visits.', [
      ['#c-dc', 'Headline', 'Recordings, teachers recorded, coverage and the FICO section scores.'],
      ['#c-dc-trend', 'Over time', 'Recordings by day, week or month.'],
      ['#c-dc-t', 'By sector, school or teacher', 'The same figures per sector, school or teacher. Click a teacher for their scorecard.'],
      ['#c-dcx', 'What stands out', 'The strongest and weakest subjects and grades, only where there are at least 30 scored lessons.'],
      ['#c-dcs', 'By subject', 'Average DC score per FICO section for each subject.'],
      ['#c-dcg', 'By grade', 'The same by grade. The grade comes from the attached plan, else the teacher’s classes.'],
      ['#c-dch', 'Grade × subject', 'A heatmap of scores. Pick the measure at the top; faded cells have too few lessons to trust.'],
    ]],
    hitl: ['HITL observations', 'Human in the loop: a coach observes a lesson in person with /observe, and an AI pre-fills the form for the coach to check.', [
      ['#c-hitl', 'Headline', 'Observations held, teachers observed, and the debrief stages: debriefed, debrief pending, awaiting review.'],
      ['#c-hitl-trend', 'Over time', 'Observations by day, week or month.'],
      ['#c-hitl-t', 'By sector, school or teacher', 'The same figures per sector, school or teacher.'],
      ['#c-hx', 'What stands out', 'The highlights from this period’s observations.'],
      ['#c-hp', 'Observations per teacher', 'How many times each teacher was observed: once, twice, more.'],
      ['#c-hw', 'Day of the week', 'The average observations on each weekday.'],
      ['#c-hf', 'How coaches use the AI’s form', 'Whether the coach changed the AI’s scores, rewrote only the feedback, or submitted it as it was.'],
      ['#c-hc', 'By coach', 'Each coach’s observations. Click a coach to see their schools, teachers, score trends and debrief reports.'],
      ['#c-hpr', 'Principals doing HITL', 'School heads who observed their own teachers.'],
      ['#c-hg', 'By grade', 'Observations and scores by the grade of the lesson.'],
    ]],
    observe2: ['/observe2 pilot', 'The impact team’s experiment: coaches score 17 indicators (fico17) themselves. Kept apart from HITL and FICO, and please don’t feed it.', [
      ['#c-o2', 'Headline', 'Visits, teachers observed and the overall picture of the pilot so far.'],
      ['#c-o2l', 'What we are learning', 'Early signals from the observations so far.'],
      ['#c-o2t', 'Progress by week', 'Observations and teachers each week since the pilot began.'],
      ['#c-o2s', 'By sector', 'The pilot in each sector.'],
      ['#c-o2i', 'The 17 indicators', 'How coaches rated each indicator, level by level.'],
      ['#c-o2p', 'What to work on first', 'The one thing coaches most often asked teachers to work on.'],
      ['#c-o2c', 'Children’s thinking', 'What coaches noticed about children’s thinking in the lesson.'],
      ['#c-o2co', 'By coach', 'Each coach’s pilot visits. Counts are activity, not quality.'],
      ['#c-ps1', 'Pilot study: progress', 'Progress against the study design’s targets.'],
      ['#c-ps2', 'Can the DC score it?', 'How often the Digital Coach’s rating matches the coach’s, indicator by indicator.'],
      ['#c-ps3', 'Does the evidence check help?', 'How coaches judged the evidence the DC found.'],
      ['#c-ps4', 'Same priority whoever observes?', 'Whether two coaches pick the same priority for a teacher.'],
      ['#c-ps5', 'How many visits for a fair picture?', 'How stable a teacher’s levels are from one visit to the next.'],
      ['#c-ps6', 'How the visit steps are going', 'Timings and lesson-plan steps during the visits.'],
    ]],
    fico: ['FICO scores', 'FICO, the lesson-observation framework: lesson-plan fidelity, subject knowledge, teaching practices and student engagement, as score ÷ maximum. Bands: Exemplary 80%+, Proficient 70–79.9%, Developing 60–69.9%, Needs support under 60%. DC and HITL are never mixed. Apples and mangoes.', [
      ['#c-fico', 'Headline', 'The four sections for DC and HITL, side by side and never pooled.'],
      ['#c-fico-trend', 'DC scores over time', 'Teaching practices, student engagement and lesson-plan fidelity week by week.'],
      ['#c-fico-t', 'By sector, school or teacher', 'Section scores per sector, school or teacher. Green edge = Digital Coach, grey edge = coach visits.'],
      ['#c-fi1', 'What stands out', 'The strongest and weakest indicators (50+ scores).'],
      ['#c-fi2', 'All 37 indicators', 'Every indicator’s average. Sort by any column.'],
      ['#c-fi3', 'Indicators by sector', 'A heatmap of indicators in each sector. Pick DC or HITL.'],
      ['#c-fi4', 'Indicators week by week', 'How each indicator moved since 8 Sep.'],
    ]],
    egra: ['Learning assessment', 'Children’s reading (EGRA, Urdu and English) and maths (EGMA), tested on coaches’ phones with children drawn at random. Totals only; any group under 5 children shows “fewer than 5”. Privacy first, curiosity second.', [
      ['#c-eg0', 'Headline', 'Children tested, schools, and how many completed the test.'],
      ['#c-eg1', 'Reading', 'Words a minute in bands (non-reader to fluent) and reading with understanding.'],
      ['#c-eg2', 'Maths', 'Children meeting the maths benchmark and number fluency.'],
      ['#c-eg3', 'Skills', 'The share right on each part of the test. Sort by any column.'],
      ['#c-eg4', 'By grade', 'Results per grade.'],
      ['#c-eg5', 'By sector', 'Results per sector.'],
      ['#c-eg6', 'Children tested each day', 'Testing day by day.'],
      ['#c-eg7', 'Learning beside teaching', 'Children’s results next to their teachers’ teaching, by sector.'],
      ['#c-eg8', 'By school', 'Schools with at least 5 children tested.'],
    ]],
    training: ['Primary training', 'NIETE primary training (niete_primary), all time: who is on the programme, modules finished, and the Level 0–3 certificates (Aspiring Teacher, Emerging Practitioner, Skilled Practitioner, Teacher Leader).', [
      ['#c-tr', 'Headline', 'On the programme, finished a module, and the share holding each level certificate.'],
      ['#c-tr-t', 'By sector, school or teacher', 'The same per sector, school or teacher. Click a row to drill in.'],
    ]],
    mhtraining: ['Middle & high training', 'Every teacher tagged Middle or High, in any mix (Primary too), and their training: NIETE Trainings, Game-Based Teaching (GBTLA), AI-Powered Subject Pedagogy (any one certified level completes it) and the Teacher Development Programme (always shown on its own). All time, so the period filter takes the day off here.', [
      ['#c-mh', 'Headline and filters', 'Tick level tags and trainings in the two dropdowns; every tile, column and popup follows them.'],
      ['#c-mh-t', 'By sector, school or teacher', 'Click a sector for its schools, a school for its teachers, a teacher for their progress on every level.'],
      ['#c-mh-l', 'By training level', 'Teachers who finished a module, every module, and were certified on each level.'],
      ['#c-mh-c', 'By level tag', 'The same figures for Middle, High, Middle + High and the Primary mixes.'],
    ]],
    schools: ['All schools', 'Every ICT school with its figures for the period. Search by name or EMIS, sort any column, and Download CSV.', [
      ['#c-sch', 'The schools table', 'Click a school for its teachers, its calendar, an appreciation card or a School stars poster.'],
    ]],
    teachers: ['Teachers', 'Every primary teacher. Search by name or school, or show only teachers missing something (no lesson plan, no DC recording, no quiz…).', [
      ['#c-tch', 'The teachers table', 'Click a teacher for their scorecard: activity, FICO scores, score trend and HITL debrief reports (strengths, areas of growth, action plan). Read them before the next visit.'],
    ]],
    calendar: ['School calendar', 'Exams, sports weeks, holidays, events and closures entered by coaches, plus public holidays, so a dip in engagement comes with an alibi. Anyone with the link can add an entry.', [
      ['#c-cal0', 'Add an entry', 'Press + Add to calendar: pick the reason, dates and schools (or a whole sector). No passcode needed.'],
      ['#c-cal1', 'Month view', 'Every entry on a calendar.'],
      ['#c-cal2', 'Engagement against the calendar', 'Each day: the share of teachers active beside the share of schools with an entry.'],
      ['#c-cal3', 'Happening now', 'Entries for today.'],
      ['#c-cal4', 'Coming up', 'Entries in the days ahead.'],
      ['#c-cal5', 'Recent', 'The latest entries that have ended.'],
    ]],
    kudos: ['Thank-you wall', 'Our team’s wall of sticky notes! Thank a teammate: pick a colour, a message from the library (English or Urdu) or your own words, add emojis and stickers, and add their email so it lands in their inbox too.', [
      ['#c-kd', 'The wall', 'Press <b>Write a note</b> to make one. React with 👏 ❤️ 🎉 🙌 🌟, press 💬 to comment, and search for a name. Only the writer (or the admin) can remove a note.'],
    ]],
    league: ['Sector league', 'A football-style league of the six sectors! Every week each sector earns points on five measures — lesson plans, DC recordings, coach visits, exam papers and DC classroom practice. Watch the table move, and press Play season to replay every week since August.', [
      ['#c-lg', 'The table', 'Rows slide to their new places; arrows show who climbed or fell since last week. The crown is the leader, the fire tag the biggest climber. The coloured bar shows where each sector’s points came from. Switch to the season table for points summed since August.'],
      ['#c-lg-d', 'A sector’s points', 'Click a sector in the table to see its figure, its rank and its points on each measure, and who was best this week.'],
      ['#c-lg-b', 'The season so far', 'Every sector’s place week by week, like a race. The dashed line is the week you are looking at.'],
    ]],
    targets: ['Targets', 'Goals the team has set — like 80% LP engagement from 1 November to 31 December — with a progress bar and a forecast of whether each will be hit on time. A target counts each week, or everyone active at least once over the whole period. Anyone can set one with “+ Set a target”.', [
      ['#c-tg', 'The targets', 'How many goals are achieved, on track, close or off track. “+ Set a target” picks a measure, who it is for (All ICT, a sector or a school), the start and end dates, whether to count each week or over the whole period, and the goal; it shows where that measure is now before you save.'],
      ['.tg-grid', 'Each target', 'The bar fills to where the measure is now; the black mark is the goal and the striped part is where the trend is heading. The small chart shows the weekly figures and the dashed forecast line to the date. It also says how many points a week are needed.'],
      ['#c-tg-n', 'Where each measure is now', 'The latest full week, the best week and the trend for every measure — a good guide to a goal that stretches but is reachable.'],
    ]],
    impact: ['Does coaching work?', 'Do teachers teach better after a coach visits? Each visit is compared with the teacher’s own Digital Coach lessons before and after it — scored by the AI, not the coach — and with similar teachers who were not visited at the same time. This is the answer funders always ask for.', [
      ['#c-im', 'The answer', 'Before and after a visit, the change, and how much teachers who were not visited changed over the same days. The big number is the coaching effect: the extra change that follows a visit. Green “Clear gain” means it is very unlikely to be chance. Pick 1, 2 or 3 weeks, and which FICO score to look at.'],
      ['#c-im-w', 'Week by week', 'The average Digital Coach score in the weeks before and after a teacher’s first coach visit. The shaded part is after the visit.'],
      ['#c-im-m', 'Which part moves', 'The same comparison for each FICO score. Click a row to show that score across the page.'],
      ['#c-im-g', 'Where it works best', 'First visit or later ones, where the teacher started, and whether the debrief was done. A bar right of the centre line is a gain; if the thin band crosses the line, it is not clear for that group.'],
      ['#c-im-s', 'By sector', 'The coaching effect in each sector. Click a sector to see its schools.'],
      ['#c-im-c', 'By coach', 'Each coach’s visits and the change that followed. Few visits means a wide range, so use it to find good practice to share, not to judge a coach.'],
      ['#c-im-h', 'How it is worked out', 'Every step of the method and its limits, in plain words.'],
    ]],
    dq: ['Data quality', 'Gaps in the data that make every figure less accurate, and how to fix each one at the source: teachers with no level, possible duplicate accounts, blank names, schools with no coach or no teachers, and impossible scores. Fix the data and the dashboard gets more honest at the next refresh.', [
      ['#c-dq', 'The checks', 'The ring is the share of teacher accounts with no problem. Beside it, every check in three groups: red with a count means something to fix, green means clean. Hover a row for the fix; click it to jump to the list. As of the last refresh, every teacher level; the period filter does not apply.'],
      ['#c-dq-s', 'By sector', 'Each sector’s count of every problem. Click a sector to see its schools with something to fix, with the coach assigned to each.'],
      ['#c-dq-t', 'Teacher accounts to fix', 'Every account with a problem: no level, blank name, or the same name twice at the school. Pick issues with the filter; Download CSV gives a to-do list for whoever manages accounts.'],
      ['#c-dq-o', 'Impossible scores', 'Observation sections scored below zero or above their maximum. These come from the scoring, not the teacher: report them to the data team.'],
      ['#c-dq-c', 'Coach accounts with no school', 'Coach accounts with no school assigned, so they are not counted as coaches. Maybe new, maybe gone, maybe a test.'],
    ]],
    report: ['Monthly report', 'A one-page summary for any month: sectors, FICO, schools leading and needing support, the calendar and children’s learning. Print it or save it as a PDF; meetings love paper.', [
      ['#c-rep0', 'Pick the month', 'Choose the month and print or save. The figures cover primary teachers.'],
      ['#c-rep1', 'Sectors', 'Each sector’s key measures and the change from the month before.'],
      ['#c-rep2', 'FICO section scores', 'The month’s section scores.'],
      ['#c-rep3', 'Schools leading the way', 'The month’s leading schools.'],
      ['#c-rep4', 'Where support is needed', 'Schools that would benefit most from support.'],
      ['#c-rep5', 'School calendar', 'What schools had on that month.'],
      ['#c-rep6', 'Children’s learning', 'The learning assessment for the month.'],
    ]],
    spotlight: ['Leading & support', 'Schools and teachers leading the way, and where support is most needed, on using the tools or on classroom practice, with minimum samples so one lucky lesson can’t top the chart. For celebrating and planning support, not for judging.', [
      ['#c-sp0', 'How it ranks', 'Switch between using the tools and classroom practice.'],
      ['#c-sp1', 'Schools leading the way', 'The top schools.'],
      ['#c-sp2', 'Schools needing support', 'The schools that would benefit most from help.'],
      ['#c-sp3', 'Teachers leading the way', 'The top teachers. Click one for their scorecard.'],
      ['#c-sp4', 'Teachers needing support', 'Teachers who would benefit most from a visit.'],
    ]],
    cards: ['Appreciation cards', 'Celebrate teachers. Make a thank-you card for one teacher or school, or switch to School stars poster for a school’s top teachers. Pick the time frame and what to show, then download for WhatsApp.', [
      ['#c-cards', 'The card maker', 'Choose who it is for, a design, up to 6 things to celebrate, your message and name. FICO appears only as a band, never a score. Nothing is saved. I can even pose on it.'],
    ]],
    trends: ['Analytics', 'Week-by-week trends of the key measures. Lines going up: good. Lines going down: let’s talk.', [
      ['#c-a1', 'Lesson plans', 'Teachers who generated a lesson plan.'],
      ['#c-a2', 'Plans taught', 'DC recordings with a Rumi plan attached.'],
      ['#c-a3', 'Classroom observations', 'DC and HITL side by side, never added.'],
      ['#c-a4', 'Teaching practices score', 'FICO teaching practices over time.'],
      ['#c-a5', 'Subject knowledge score', 'Subject knowledge, with v2 and v3 kept as separate lines.'],
      ['#c-a7', 'Exam generator', 'Papers and the teachers making them.'],
      ['#c-a6', 'Quizzes', 'Quizzes and children reached.'],
    ]],
    glossary: ['How we count', 'What every number means and where it comes from. Governed = defined by the data rules; Provisional = may change. It’s the boring page that settles every argument.', [
      ['#c-g0', 'Search', 'Type a word, like engagement or FICO, to find its definition.'],
    ]],
  };

  // [question, answer, tab to open, element to point at]
  const FAQ = [
    ['How do I thank a teammate?', 'Open <b>Thank-you wall</b> under Team and press <b>Write a note</b>. Pick a colour, a message from the library or your own words, add stickers, and add their email if you like: they get the note in their inbox.', 'kudos', '#c-kd'],
    ['Does coaching actually work?', 'Yes, it shows. After a coach visit, a teacher’s <b>own Digital Coach lessons</b> score higher than before — more than similar teachers who were not visited at the same time. The <b>Does coaching work?</b> page has the numbers, by sector, coach and FICO score.', 'impact', '#c-im'],
    ['Why are some teachers missing from the figures?', 'Usually their account has <b>no level recorded</b>, so they are not counted as primary (or middle/high). The <b>Data quality</b> tab lists them school by school, with possible duplicate accounts and schools with no coach.', 'dq', '#c-dq'],
    ['How many teachers are in ICT?', 'The <b>ICT teachers</b> strip at the top of the Overview: every teacher at an ICT programme school, counted once, with how many teach Primary, Middle or High, or both. It follows the Sector filter and updates with every refresh.', 'overview', '.hc2'],
    ['What are the champions?', 'The trophy cards on the Overview: the sector that did best yesterday on each feature, as a share of its teachers. Streak = it also won the days before; “Best day since August” = its record. I throw confetti for them once a day.', 'overview', '.champs'],
    ['What is LP engagement?', 'The share of primary teachers who used at least one grade 1–5 lesson plan in the period: generated with Rumi or opened in the teacher app. Using one counts. Admiring one from afar does not.', 'lp', '#c-lp'],
    ['What is the difference between DC and HITL?', '<b>DC</b> is the Digital Coach: the teacher records their own lesson and the AI scores it. <b>HITL</b> is a human coach in the classroom with /observe. Both use FICO, but they are never added together. Robot and human, separate tables, like a good wedding.', 'dc', '#c-dc'],
    ['What is FICO?', 'The lesson-observation framework with four sections: lesson-plan fidelity, subject knowledge, teaching practices and student engagement. Bands: Exemplary 80%+, Proficient 70–79.9%, Developing 60–69.9%, Needs support under 60%. Not the credit score. Nobody’s getting a loan here.', 'fico', '#c-fico'],
    ['What is /observe2?', 'The impact team’s pilot where coaches score 17 indicators themselves. It has its own tab and is never added to HITL or FICO.', 'observe2', '#c-o2'],
    ['Where are the debrief reports?', 'Two places: open <b>Teachers</b> and click a teacher (reports are at the bottom of the scorecard), or open <b>HITL observations</b>, scroll to “By coach” and click a coach. Hidden in plain sight, my favourite kind of hiding.', 'teachers', '#c-tch'],
    ['How do I see middle and high teachers’ training?', 'Open <b>Middle & high training</b> under Growth. Tick level tags (Middle, High, Middle + High, the Primary mixes) and trainings (NIETE Trainings, GBTLA, AI-Powered Subject Pedagogy, Teacher Development Programme) in the two dropdowns. Then click a sector, a school and a teacher to drill in.', 'mhtraining', '#c-mh'],
    ['What does “done” mean for a training?', 'Certified on every level of that training, except <b>AI-Powered Subject Pedagogy</b>: its four levels are alternatives, so any one certified level completes it. The Teacher Development Programme is always counted on its own.', 'mhtraining', '#c-mh'],
    ['Why don’t training figures change with the period?', 'Training is counted all time: a certificate earned in September still counts in November. Sector and school filters still apply.', 'training', '#c-tr'],
    ['How do I change the period, sector or school?', 'Use the filter bar at the top. Every number on every tab follows it (training is all time). “Group charts by” switches trends between daily, weekly and monthly. Yes, it’s that easy.', null, '#filters'],
    ['What do the ▲ and ▼ marks mean?', 'They compare the period you picked with the period of the same length just before it: percentage points for shares, per cent for counts. For “Since 1 Aug” there’s nothing before, so they politely disappear.', 'overview', '.hero'],
    ['What do the colours on the tiles mean?', 'Tiles with a badge (Exemplary, Proficient, Developing, Needs support) are coloured by their band, so the colour means something. Other tiles just take a colour so they’re easy to tell apart. Pretty, not judgemental.', 'overview', '.hero'],
    ['How do I download a chart or table?', '<b>Download image</b> on any section saves a picture; the button at the top saves the whole page. Tables also have <b>Download CSV</b> for Excel. <b>Present</b> hides the menus for a meeting screen.', null, '.top-btns'],
    ['How fresh is the data?', 'It refreshes by itself every day (the footer says when), and the date under the title says when it was last updated. If a part fails, the page says so and keeps the previous figures.', null, '.foot'],
    ['Why is a number blank or zero?', 'Usually nothing happened in that period or place. Try “Since 1 Aug” or All sectors. If a refresh had a problem, a yellow note at the top says which part is missing. Zero is a number too, it just has low self-esteem.', null, '#filters'],
    ['Who counts as a primary teacher?', 'A verified teacher account at an ICT programme school whose level includes primary. Test accounts and teachers with no level recorded are left out. Middle and high teachers have their own training tab.', 'glossary', '#c-g0'],
    ['What is EGRA / the learning assessment?', 'A short reading and maths test for children drawn at random, done on the coach’s phone. Only totals are shown, never a child’s name, and groups under 5 children are hidden. The children are the point, after all.', 'egra', '#c-eg0'],
    ['How do coaches add a school calendar entry?', 'Open <b>School calendar</b>, press <b>+ Add to calendar</b>, pick the reason, dates and schools, and save. No passcode needed. Please only add what you actually know; I can’t fact-check holidays, I’m a parrot.', 'calendar', '#c-cal0'],
    ['Who is leading and who needs support?', '<b>Leading & support</b> ranks schools and teachers on using the tools or on classroom practice, with minimum samples so one lesson can’t top the chart. Celebrate the first list; help the second.', 'spotlight', '#c-sp0'],
    ['How do I get a monthly summary?', 'Open <b>Monthly report</b> under Insights, pick the month, and print it or save it as a PDF.', 'report', '#c-rep0'],
    ['How do I make an appreciation card or poster?', 'Open <b>Appreciation cards</b> under Insights, or press <b>Make appreciation card</b> or <b>Make school stars poster</b> on a teacher’s or school’s popup. Pick the time frame and what to celebrate, add your message, and download. Spreading joy, one PNG at a time.', 'cards', '#c-cards'],
    ['Can I put the dashboard on my phone like an app?', 'Yes! On Android, tap <b>Install app</b> at the top right (or ⋮ → Add to Home screen). On iPhone, open it in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. It opens fast, shows the last data while new data loads, and forgets data older than a day.', null, '.top-btns'],
    ['Can I share this dashboard?', 'Inside the NIETE and Taleemabad team only. Please don’t send the link to teachers, school heads or anyone outside: it shows named teachers’ FICO scores. Loose lips sink ships. And parrots.', null, '.confid'],
    ['How do I find a teacher or a school quickly?', 'Click me and pick <b>Find or go</b>. Type part of a name or an EMIS and click the result. It works for middle & high teachers too. You can also type where to go, like <b>DC Urban-II last week</b>, and I’ll set the tab and filters.', null, '#temu-bird'],
    ['Which teachers should a coach visit next?', 'Click me and pick <b>Who to visit next</b>. I list the teachers in your sector or school with no coach visit yet or the longest gap since the last one, or the lowest score at the last visit. Click one for their scorecard and debriefs.', null, '#temu-bird'],
    ['Who should we thank this week?', 'Click me and pick <b>Who deserves a thank-you</b>. I pick the standout teachers for your filters and make their appreciation card in one click, or a School stars poster for a school.', null, '#temu-bird'],
    ['Something looks wrong. Who do I tell?', 'Press <b>Feedback</b> at the bottom right. Hasnat reads every message. Even the angry ones. Especially the angry ones.', null, '#fb-open'],
  ];

  // The quick tour: the essentials in about a minute. [tab, element, text]
  const QUICK = [
    ['overview', '.cbar', 'Up top, on every tab: yesterday’s <b>champions</b>, the sectors that did best on each feature, scrolling past like the news. Hover to pause, click one to see that day. × hides it until tomorrow; the gold 🏆 Show champions button at the top right brings it back.'],
    ['overview', '.confid', 'First, the red note. This dashboard is <b>internal only</b>: it shows teachers by name with their FICO scores. Not for teachers, school heads or outsiders. What happens on the dashboard stays on the dashboard.'],
    [null, '#nav', 'The menu, in six groups: <b>Teaching</b>, <b>Observation</b>, <b>Children</b>, <b>Growth</b>, <b>Directory</b> and <b>Insights</b>. Nineteen tabs, and I know every one of them.'],
    [null, '#filters', 'The filters. Pick a period, a sector or a school, and every number obeys. “Group charts by” switches between days, weeks and months. Training tabs are all time, so the period takes the day off there.'],
    ['overview', '.hc2', 'How many teachers ICT has: every teacher at a programme school, counted once, split into Primary, Middle or High, and both.'],
    ['overview', '.hero', 'The four headline cards for primary teachers. The badge is the band; green ▲ and red ▼ show the change from the period before. Click a sector dot to focus the page.'],
    ['lp', '#c-lp', '<b>Teaching</b>: lesson plans, quizzes and the exam generator. Every tab follows the same pattern: a headline, a trend, a table by sector → school → teacher, then analytics.'],
    ['dc', '#c-dc', '<b>Observation</b>: the Digital Coach, coach visits (HITL), the /observe2 pilot and FICO scores, down to all 37 indicators. DC and HITL are never mixed.'],
    ['egra', null, '<b>Children</b>: the learning assessment, how children read and do maths. Totals only.'],
    ['mhtraining', '#c-mh', '<b>Growth</b>: primary training, and middle & high training with filters for level tags and trainings.'],
    ['teachers', '#c-tch', '<b>Directory</b>: all schools, every teacher (click one for their scorecard and debrief reports) and the school calendar.'],
    ['cards', '#c-cards', '<b>Insights</b>: the monthly report, leading & support, appreciation cards and posters, analytics, and How we count.'],
    [null, '.top-btns', '<b>Download image</b> saves a picture, <b>Present</b> hides the menus for a big screen, and every table has <b>Download CSV</b>.'],
    [null, '#fb-open', 'Something wrong or missing? Press <b>Feedback</b>. Hasnat reads every message.'],
    [null, '#temu-bird', 'And that’s me. Click me any time to <b>find</b> a teacher or school, <b>go</b> somewhere (“DC Urban-II last week”), see <b>who to visit next</b> or <b>who deserves a thank-you</b>, or walk through any page. Tour done!'],
  ];

  const QUIPS = [
    'Yes? I’m all ears. Well, all feathers.',
    'Ask me anything about the dashboard. Except the cricket score. I can’t talk about it.',
    'I have read every number on this page. Twice. For fun.',
    'Need a hand? I only have wings, but they’re very supportive.',
    'Back again? I’m flattered. Mildly concerned, but flattered.',
    'You clicked a parrot. Bold move. How can I help?',
  ];
  const MOVES = [
    ['dance', 'Dance', 'Unlocking my secret talent. Please don’t film this.'],
    ['backflip', 'Backflip', 'Hold my tie.'],
    ['fly', 'Fly', 'Parrots can fly. Dashboards can’t. Just saying.'],
    ['spin', 'Spin', 'A full 360° review. Very thorough. Very dizzy.'],
    ['wave', 'Wave', 'Hello! Hello! Hello! I’m a parrot, I repeat things.'],
    ['dizzy', 'Get dizzy', 'Spin me round… oh no. Oh no no no.'],
    ['nap', 'Take a nap', 'Wake me if engagement drops. Zzz.'],
    ['thumbsup', 'Thumbs up', 'Great job! I’d give you two thumbs, but I only have wings.'],
    ['clap', 'Clap', 'A round of applause for everyone who finished a module this week!'],
    ['salute', 'Salute', 'Saluting every teacher who planned a lesson today.'],
    ['shrug', 'Shrug', 'When someone asks why it’s zero and nothing happened that day.'],
    ['facepalm', 'Facepalm', 'Me, when someone shares the dashboard link outside the team.'],
    ['moonwalk', 'Moonwalk', 'Smooth. Like a well-paced lesson plan.'],
    ['rockstar', 'Rock out', 'Data rocks. I’ll see myself out.'],
    ['peekaboo', 'Peekaboo', 'Where did the data go? … Peekaboo! There it is.'],
    ['wink', 'Wink', 'Our little secret.'],
    ['breakdance', 'Breakdance', 'Upside down, still governed.'],
    ['celebrate', 'Celebrate', 'Confetti for everyone! Except bugs.'],
  ];
  const WAKE = ['I wasn’t sleeping. I was… indexing.', 'Huh? Who? Oh. Hi. I was resting my eyes.', 'Five more minutes… fine, I’m up.'];
  // a comment for each FICO band, used when reading out the headline cards
  const BAND = [
    [80, ['Exemplary. Someone print this and put it on the fridge.', 'Exemplary. I’d clap, but… wings.']],
    [70, ['Proficient. Solid. Not fridge-worthy yet, but close.', 'Proficient. Good, with room to show off.']],
    [60, ['Developing. Room to grow, like my tail feathers.', 'Developing. Getting there, one lesson at a time.']],
    [0, ['Needs support. No judgement. Okay, a tiny bit. Mostly support.', 'Needs support. This is where the help goes next.']],
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
    <div class="temu-side">
      <div class="temu-toast" id="temu-toast" role="status" hidden></div>
      <span class="temu-z" id="temu-z" aria-hidden="true" hidden><i>z</i><i>z</i><i>Z</i></span>
      <button class="temu-bird" id="temu-bird" type="button" aria-label="TEMU, your dashboard guide" aria-expanded="false" aria-controls="temu-panel">
        <canvas id="temu-cv" aria-hidden="true"></canvas><span class="temu-fb" aria-hidden="true" hidden>🦜</span>
      </button>
    </div>`;
  const chip = Object.assign(document.createElement('button'), { className: 'temu-chip', type: 'button', textContent: 'Ask TEMU', hidden: true });
  const hlBox = Object.assign(document.createElement('div'), { className: 'temu-hl', hidden: true });
  document.body.append(hlBox, root, chip);
  const panel = $('#temu-panel'), say = $('#temu-say'), acts = $('#temu-acts'), step = $('#temu-step'), bird = $('#temu-bird'), toastEl = $('#temu-toast'), zzz = $('#temu-z');

  const anim = { talkUntil: 0, waveUntil: 0, jumpAt: -10, now: 0, move: null };
  let typing = null, toastT = null;
  function speak(html) {
    clearInterval(typing);
    hideToast();
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
  // a short line in a little bubble above TEMU, when the panel is closed
  function toast(text, ms = 4500) {
    if (!panel.hidden || root.hidden) return;
    clearTimeout(toastT);
    toastEl.textContent = text; toastEl.hidden = false;
    anim.talkUntil = anim.now + Math.min(text.length * 0.03, 2.5);
    toastT = setTimeout(hideToast, ms);
  }
  function hideToast() { clearTimeout(toastT); toastEl.hidden = true; }

  // Moves are timed poses the 3D loop plays; with reduced motion TEMU just talks.
  const DUR = { dance: 4, backflip: 1.1, fly: 3, spin: 1.2, dizzy: 2.6, preen: 1.8, look: 2.4, stretch: 1.2, nap: Infinity,
    thumbsup: 2.4, clap: 2.4, salute: 2.2, shrug: 1.8, facepalm: 2.4, moonwalk: 3.2, rockstar: 2.6, peekaboo: 2.6, wink: 1.3, breakdance: 2.6, celebrate: 2.2 };
  // Moves need the 3D loop to play and to end them, so without it (emoji fallback) TEMU only talks.
  let live3d = false;
  function setMove(m) { anim.move = m; root.dataset.move = m ? m.name : ''; }
  function move(name) {
    if (name === 'wave') { anim.waveUntil = anim.now + 2.5; return; }
    if (reduced || !live3d) return;
    setMove({ name, t0: anim.now, dur: DUR[name] });
    zzz.hidden = name !== 'nap';
  }
  function confetti() {
    if (reduced) return;
    const r = bird.getBoundingClientRect(), colors = ['#35C03F', '#FF8A1C', '#FFD23F', '#4D74E0', '#E2566A'];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('i');
      c.className = 'temu-cf';
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 140;
      c.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 3}px;background:${pick(colors)};--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 60}px;--r:${Math.random() * 720}deg`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1400);
    }
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

  // ---------- find, go, who to visit next, who deserves a thank-you ----------
  // These ask the dashboard through window.Dash (its bridge in app.js) and only use data already on the page.
  const GO_TABS = [   // first match wins, so the specific phrases come before the general ones
    ['kudos', ['thank-you wall', 'thank you wall', 'thank-you note', 'thank you note', 'sticky note', 'sticky notes', 'kudos', 'wall', 'thank a teammate', 'thank my team']],
    ['league', ['sector league', 'league', 'league table', 'standings', 'ranking', 'rankings']],
    ['targets', ['targets', 'target', 'goals', 'goal', 'forecast', 'on track']],
    ['impact', ['does coaching work', 'coaching work', 'coaching effect', 'coaching impact', 'impact of coaching', 'before and after', 'funder', 'does it work']],
    ['mhtraining', ['middle and high training', 'middle & high training', 'middle high training', 'middle training', 'high training', 'mh training', 'middle and high', 'middle high']],
    ['training', ['primary training', 'niete training', 'training', 'certificates']],
    ['observe2', ['observe2', '/observe2', 'pilot']],
    ['dc', ['dc', 'digital coach', 'recordings']],
    ['hitl', ['hitl', 'coach visits', 'coach visit', 'observations']],
    ['fico', ['fico', 'indicators']],
    ['lp', ['lesson plans', 'lesson plan', 'plans', 'lp']],
    ['quiz', ['quizzes', 'quiz']],
    ['exams', ['exam generator', 'exams', 'exam', 'fde']],
    ['egra', ['learning assessment', 'egra', 'egma', 'reading test']],
    ['calendar', ['calendar', 'holidays']],
    ['dq', ['data quality', 'data problems', 'missing level', 'no level', 'duplicate', 'no coach']],
    ['report', ['monthly report', 'report']],
    ['spotlight', ['leading and support', 'leading & support', 'leading', 'needs support', 'spotlight']],
    ['cards', ['appreciation', 'cards', 'card', 'poster']],
    ['trends', ['analytics', 'trends']],
    ['glossary', ['how we count', 'glossary', 'definitions']],
    ['schools', ['all schools', 'schools']],
    ['teachers', ['teachers']],
    ['overview', ['overview', 'home']],
  ];
  const GO_SECTORS = [['Urban-II', ['urban-ii', 'urban ii', 'urban 2', 'urban2', 'u2']], ['Urban-I', ['urban-i', 'urban i', 'urban 1', 'urban1', 'u1']],
    ['B.K', ['b.k', 'bk', 'barakahu', 'bhara kahu']], ['Nilore', ['nilore']], ['Sihala', ['sihala']], ['Tarnol', ['tarnol']]];
  const GO_PERIODS = [['yesterday', ['yesterday'], 'Yesterday'], ['today', ['today'], 'Today'], ['lastweek', ['last week'], 'Last week'], ['week', ['this week'], 'This week'],
    ['lastmonth', ['last month'], 'Last month'], ['month', ['this month'], 'This month'], ['30', ['last 30 days', '30 days'], 'Last 30 days'],
    ['all', ['since 1 aug', 'since august', 'all time', 'since the start'], 'Since 1 Aug']];
  const MONTH_WORDS = [['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'], ['may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'],
    ['september', 'sept', 'sep'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec']];
  const has = (q, phrase) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z0-9])`).test(q);
  // "DC Urban-II last week" -> { tab: 'dc', sector: 'Urban-II', preset: 'lastweek' }; null when nothing is recognised.
  function parseGo(text) {
    const q = text.toLowerCase(), o = {};
    const t = GO_TABS.find(([, ws]) => ws.some((w) => has(q, w)));
    if (t) o.tab = t[0];
    if (has(q, 'all sectors') || has(q, 'all ict')) o.sector = '';
    else { const sc = GO_SECTORS.find(([, ws]) => ws.some((w) => has(q, w))); if (sc) o.sector = sc[0]; }
    const per = GO_PERIODS.find(([, ws]) => ws.some((w) => has(q, w)));
    if (per) o.preset = per[0];
    else { const mi = MONTH_WORDS.findIndex((ws) => ws.some((w) => has(q, w))); if (mi >= 0 && !has(q, 'since 1 aug')) o.month = mi; }
    return Object.keys(o).length ? o : null;
  }
  function goLabel(o) {
    const tab = o.tab ? (($(`#nav [data-tab="${o.tab}"]`) || {}).textContent || o.tab) : 'this tab';
    const where = o.sector === undefined ? '' : ` · ${o.sector || 'All ICT'}`;
    const when = o.preset ? ` · ${GO_PERIODS.find((x) => x[0] === o.preset)[2]}` : o.month !== undefined ? ` · ${MONTH_WORDS[o.month][0].replace(/^./, (c) => c.toUpperCase())}` : '';
    return `${tab}${where}${when}`;
  }
  const dashOk = () => {
    if (window.Dash && window.Dash.ready()) return true;
    screen('The data is still loading. Give me a second and try again.', btn('home', 'Back'));
    return false;
  };
  let findHits = [], goPlan = null, findT = null;
  function findgo() {
    if (!dashOk()) return;
    screen('Type a teacher’s or a school’s name, or an EMIS, to open it. Or tell me where to go, like <b>DC Urban-II last week</b>, <b>middle high training Tarnol</b> or <b>lesson plans October</b>.',
      `<input class="temu-q" id="temu-find" type="search" placeholder="A name, an EMIS, or e.g. quizzes Sihala this month" aria-label="Find or go"><div class="temu-list" id="temu-fl"></div>${btn('home', 'Back')}`);
    if (!matchMedia('(pointer: coarse)').matches) $('#temu-find').focus();
  }
  function findList(q) {
    goPlan = parseGo(q);
    findHits = q.trim().length >= 2 ? window.Dash.find(q) : [];
    $('#temu-fl').innerHTML = (goPlan ? btn('dogo', `Go to ${esc(goLabel(goPlan))}`, 'pri') : '')
      + findHits.map((h, i) => btn(`open:${i}`, `${esc(h.name)} <span class="dim">${esc(h.sub)}</span>`, 'q')).join('')
      + (!goPlan && !findHits.length && q.trim().length >= 2 ? '<p class="temu-none">Nothing matches. Try part of a name, an EMIS, or a tab with a sector and a period.</p>' : '');
  }
  function doGo() {
    const r = window.Dash.go(goPlan);
    if (r.error) { speak(r.error); return; }
    anim.jumpAt = anim.now;
    speak(`Done: <b>${esc(r.tab)}</b> · ${esc(r.scope)} · ${esc(r.period)}.`);
    acts.innerHTML = btn('page', 'What’s on this page?') + btn('findgo', 'Find or go again') + btn('close', 'Close');
  }
  function openHit(i) { const h = findHits[i]; if (!h) return; close(); window.Dash.open(h.kind, h.key); }

  let visitMode = 'gap';
  const days = (n) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);
  function visit(mode) {
    if (!dashOk()) return;
    if (mode) visitMode = mode;
    const v = window.Dash.visits(visitMode);
    const why = (r) => (visitMode === 'low'
      ? `${Math.round(r.score)}% at the last visit${r.band ? ` · ${r.band}` : ''} · ${days(r.since)}`
      : r.visits ? `last visit ${days(r.since)} · ${r.visits} visit${r.visits === 1 ? '' : 's'} so far` : 'no coach visit since 1 Aug');
    const scopes = [['', 'All ICT'], ...window.Dash.sectors().map((x) => [x, x])];
    screen(`<b>Who to visit next · ${esc(v.scope)}.</b> ${v.never.toLocaleString()} of ${v.teachers.toLocaleString()} primary teachers here have had no coach visit since 1 Aug. ${visitMode === 'low' ? 'Sorted by the lowest teaching practices and student engagement score at their last visit.' : 'Sorted with no visit first, then the longest since the last one.'} Click a teacher for their scorecard and debrief reports.`,
      btn('vmode:gap', 'Longest since a visit', visitMode === 'gap' ? 'pri' : '') + btn('vmode:low', 'Lowest last score', visitMode === 'low' ? 'pri' : '')
      + `<div class="temu-list">${v.rows.map((r) => btn(`vt:${r.ti}`, `${esc(r.name)} <span class="dim">${esc(r.school)} · ${esc(why(r))}</span>`, 'q')).join('') || '<p class="temu-none">No teachers with a scored visit here yet.</p>'}</div>`
      + `<div class="temu-scopes">${scopes.map(([k, l]) => btn(`vscope:${k}`, esc(l))).join('')}</div>` + btn('home', 'Back'));
  }
  function thanks() {
    if (!dashOk()) return;
    const t = window.Dash.thanks();
    screen(`<b>Who deserves a thank-you · ${esc(t.scope)} · ${esc(t.period)}.</b> The standout teachers for the filters you picked. Click one to make their appreciation card, or change the period or sector at the top and ask again.`,
      `<div class="temu-list">${t.rows.map((r) => btn(`tc:${r.ti}`, `${esc(r.name)} <span class="dim">${esc(r.school)} · ${esc(r.why)}</span>`, 'q')).join('') || '<p class="temu-none">No activity in this period yet. Try a longer period, like Last 30 days.</p>'}</div>`
      + (t.school !== null ? btn(`tp:${t.school}`, 'School stars poster for this school', 'pri') : '<p class="temu-none">Pick a school in the filter at the top and I’ll offer a School stars poster too.</p>')
      + btn('home', 'Back'));
  }

  // ---------- screens ----------
  let tourI = -1, tourFrom = 'overview';
  function open() { hideToast(); panel.hidden = false; bird.setAttribute('aria-expanded', 'true'); }
  function close() {
    clearInterval(typing);
    if (tourI >= 0) endTour(false);
    panel.hidden = true; bird.setAttribute('aria-expanded', 'false'); point(null);
  }
  function screen(text, buttons) { open(); step.textContent = ''; point(null); speak(text); acts.innerHTML = buttons; }
  function home(first) {
    anim.waveUntil = anim.now + 2.2;
    screen(first
      ? 'Assalam-o-Alaikum! I’m <b>TEMU</b>, your guide to the ICT Dashboard. Part parrot, part data nerd, fully dressed. New here? Take the <b>quick tour</b> (about a minute) or the <b>full tour</b>, which visits every one of the 19 tabs.'
      : pick(QUIPS),
    btn('tour', 'Quick tour', 'pri') + btn('fulltour', 'Full tour') + btn('findgo', 'Find or go') + btn('visit', 'Who to visit next') + btn('thanks', 'Who deserves a thank-you')
      + btn('page', 'What’s on this page?') + btn('faq', 'Ask a question') + btn('headlines', 'Read me the headlines')
      + btn('moves', 'Show me a move') + (first ? btn('close', 'Not now') : btn('hide', 'Hide TEMU')));
  }
  function page() {
    const [name, text, secs] = GUIDE[currentTab()] || GUIDE.overview;
    const here = secs.filter(([sel]) => $(sel));
    screen(`<b>${esc(name)}.</b> ${text}${here.length > 1 ? `<ul class="temu-ul">${here.map(([, l]) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}`,
      (here.length ? btn('pagetour', 'Show me around this page', 'pri') : '') + btn('faq', 'Ask a question') + (currentTab() !== 'glossary' ? btn('go:glossary', 'How we count') : '') + btn('home', 'Back'));
  }
  function faq() {
    screen('What would you like to know? Pick a question, or type a word to search. There are no silly questions. Well, a few. But not yours.',
      `<input class="temu-q" id="temu-q" type="search" placeholder="e.g. debrief, FICO, download" aria-label="Search questions"><div class="temu-list" id="temu-list"></div>${btn('home', 'Back')}`);
    list('');
    if (!matchMedia('(pointer: coarse)').matches) $('#temu-q').focus();
  }
  function list(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = FAQ.map((f, i) => [f, i]).filter(([[qq, a]]) => words.every((w) => `${qq} ${a}`.toLowerCase().includes(w)));
    $('#temu-list').innerHTML = hits.length
      ? hits.map(([[qq], i]) => btn(`ans:${i}`, esc(qq), 'q')).join('')
      : '<p class="temu-none">Hmm, that one’s not in my brain yet, and my brain is the size of a walnut. Try another word, or press Feedback and ask Hasnat.</p>';
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
  function moves() {
    screen('Pick a move. I’ve been practising in the CSS.', MOVES.map(([k, l]) => btn(`do:${k}`, l)).join('') + btn('home', 'Back'));
  }
  function doMove(k) {
    const m = MOVES.find((x) => x[0] === k);
    speak(m[2]);
    move(k);
    if (k === 'celebrate') setTimeout(confetti, 300);
    if (k === 'nap') { napGrace = Date.now() + 2500; setTimeout(() => { if (anim.move && anim.move.name === 'nap') close(); }, 900); }
  }
  // Read the four headline cards off the Overview, as they are drawn for the current filters.
  function headlines() {
    goTab('overview');
    setTimeout(() => {
      const cards = [...document.querySelectorAll('.hero .hcard')];
      if (!cards.length) { screen('The headline cards haven’t loaded yet. Even I can’t read numbers that don’t exist. Give it a second.', btn('headlines', 'Try again', 'pri') + btn('home', 'Back')); return; }
      const where = ($('#crumbs') || {}).textContent || 'All ICT', when = ($('#period') || {}).textContent || '';
      const lines = cards.map((c) => {
        const label = ($('.hcard-l', c) || {}).textContent || '';
        const val = ($('.big', c) || {}).textContent || '—';
        const v = parseFloat(val);
        const note = Number.isFinite(v) ? pick(BAND.find(([lo]) => v >= lo)[1]) : 'No figure here. Either nothing happened or it happened very quietly.';
        return `<li><b>${esc(label)}: ${esc(val)}</b>. ${note}</li>`;
      });
      screen(`Here are the headlines for <b>${esc(where.trim())}</b>${when ? `, ${esc(when.trim())}` : ''}:<ul class="temu-ul">${lines.join('')}</ul>Change the filters and ask me again. I never get tired. I do get hungry.`,
        btn('page', 'Explain this page') + btn('home', 'Back'));
      point('.hero');
      anim.jumpAt = anim.now;
    }, 80);
  }
  // One tour engine for all three tours: the quick one, the full one (every tab) and "show me around this page".
  let tourSteps = QUICK, tourName = '';
  function fullTour() {
    const tabs = [...document.querySelectorAll('#nav [data-tab]')].map((b) => b.dataset.tab).filter((t) => GUIDE[t]);
    return [QUICK[0], QUICK[1], QUICK[2],
      ...tabs.map((t) => { const [name, text, secs] = GUIDE[t]; return [t, secs[0] ? secs[0][0] : null, `<b>${esc(name)}.</b> ${text}<ul class="temu-ul">${secs.map(([, l]) => `<li>${esc(l)}</li>`).join('')}</ul>`]; }),
      QUICK[QUICK.length - 3], QUICK[QUICK.length - 2],
      [null, '#temu-bird', 'That’s every tab! Click me on any of them and pick <b>What’s on this page?</b> to walk through each section in detail. You now know more than most people in the meeting.']];
  }
  function pageTour() {
    const [name, , secs] = GUIDE[currentTab()] || GUIDE.overview;
    return secs.filter(([sel]) => $(sel)).map(([sel, l, txt]) => [null, sel, `<b>${esc(name)} · ${esc(l)}.</b> ${txt}`]);
  }
  function startTour(steps, name) { if (!steps.length) return; tourSteps = steps; tourName = name; tourI = -1; tour(0); }
  function tour(i) {
    if (tourI < 0) tourFrom = currentTab();
    tourI = i;
    const [tab, sel, text] = tourSteps[i], last = i === tourSteps.length - 1;
    open();
    goTab(tab);
    // a tab that loads its data late (the learning assessment) gets a second try
    setTimeout(() => { point(sel || '#main'); if (!hlEl && sel) setTimeout(() => { if (tourI === i) point(sel); }, 1200); }, 60);
    step.textContent = `${tourName ? `${tourName} · ` : ''}${i + 1} / ${tourSteps.length}`;
    anim.jumpAt = anim.now;
    speak(text);
    acts.innerHTML = (i > 0 ? btn(`tour:${i - 1}`, '‹ Back') : '')
      + (!last ? btn(`tour:${i + 1}`, 'Next ›', 'pri') + btn('endtour', 'End tour') : btn('endtour', 'Finish', 'pri'));
    if (last) { move(tourName === 'This page' ? 'thumbsup' : 'backflip'); if (tourName !== 'This page') setTimeout(confetti, 450); store.set({ toured: 1 }); }
    store.set({ seen: 1 });
  }
  function endTour(talk = true) {
    const back = tourFrom, wasPage = tourName === 'This page';
    tourI = -1; point(null); step.textContent = '';
    if (!wasPage) goTab(back);
    if (talk) {
      speak(wasPage ? 'That’s this page! Click me on any other tab and I’ll walk you through it too.' : 'Tour done! You now know more than most people in the meeting. I’ll be right here in the corner. Click me any time.');
      acts.innerHTML = btn('page', 'What’s on this page?') + btn('faq', 'Ask a question') + btn('close', 'Close');
    }
  }
  function hide() { close(); root.hidden = true; chip.hidden = false; store.set({ hidden: 1 }); }
  function unhide() { root.hidden = false; chip.hidden = true; store.set({ hidden: 0 }); start(); home(false); }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-temu]');
    if (!b) return;
    const [act, arg] = b.dataset.temu.split(':');
    ({
      close, home: () => home(false), page, faq, hide, moves, headlines,
      tour: () => (arg === undefined ? startTour(QUICK, 'Quick tour') : tour(+arg)), endtour: () => endTour(true),
      fulltour: () => startTour(fullTour(), 'Full tour'), pagetour: () => startTour(pageTour(), 'This page'),
      findgo, dogo: doGo, open: () => openHit(+arg), thanks,
      visit: () => visit(), vmode: () => visit(arg), vscope: () => { window.Dash.go({ sector: arg }); visit(); },
      vt: () => { close(); window.Dash.open('teacher', +arg); }, tc: () => { close(); window.Dash.card(+arg); }, tp: () => { close(); window.Dash.poster(+arg); },
      ans: () => answer(+arg), show: () => show(+arg), do: () => doMove(arg),
      go: () => { goTab(arg); close(); },
    })[act]();
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'temu-q') list(e.target.value);
    else if (e.target.id === 'temu-find') { clearTimeout(findT); const v = e.target.value; findT = setTimeout(() => findList(v), 150); }
  });
  root.addEventListener('keydown', (e) => { if (e.target.id === 'temu-find' && e.key === 'Enter' && goPlan && !findHits.length) doGo(); });

  // ---------- reactions ----------
  let clicks = [], hopAt = 0, lastActive = Date.now(), napGrace = 0, typed = '';
  bird.addEventListener('click', () => {
    const now = Date.now();
    clicks = clicks.filter((c) => now - c < 3000).concat(now);
    if (clicks.length >= 5) {
      clicks = []; close(); move('dizzy');
      toast(pick(['Please. I’m a parrot, not a stress ball.', 'Okay, okay! I’m awake! Stop poking!', 'Is this how you treat all your guides?']));
      return;
    }
    anim.jumpAt = anim.now;
    if (panel.hidden) home(!store.get().seen); else if (tourI < 0) close();
  });
  bird.addEventListener('pointerenter', () => {
    if (Date.now() - hopAt > 4000 && !anim.move) { hopAt = Date.now(); anim.jumpAt = anim.now; }
  });
  chip.addEventListener('click', unhide);

  // Chrome sends a pointermove whenever the layout shifts under a still mouse, so only real movement counts.
  let px = -1, py = -1;
  function wake(e) {
    if (e.type === 'pointermove') {
      const moved = Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 4;
      px = e.clientX; py = e.clientY;
      if (!moved) return;
    }
    lastActive = Date.now();
    if (anim.move && anim.move.name === 'nap' && Date.now() > napGrace) {
      setMove(null); zzz.hidden = true; move('stretch');
      setTimeout(() => toast(pick(WAKE)), 500);
    }
  }
  ['pointermove', 'keydown', 'wheel', 'touchmove', 'pointerdown'].forEach((ev) => addEventListener(ev, wake, { passive: true, capture: true }));
  // While the panel is closed: a random move every 15-30 s and a nap after three quiet minutes. Nothing while TEMU is busy, asleep, or the browser tab is in the background.
  const AMBIENT = ['dance', 'backflip', 'fly', 'spin', 'wave', 'preen', 'look', 'stretch', 'dizzy', 'thumbsup', 'clap', 'salute', 'shrug', 'moonwalk', 'rockstar', 'peekaboo', 'wink', 'breakdance'];
  let nextMoveAt = Date.now() + 10000 + Math.random() * 10000;
  setInterval(() => {
    if (root.hidden || document.hidden || !panel.hidden || tourI >= 0) return;
    const now = Date.now();
    if (anim.move && anim.move.name === 'nap') return;
    if (now - lastActive > 180000) { if (!anim.move) move('nap'); return; }
    if (anim.move) return;
    if (now > nextMoveAt) {
      let m = pick(AMBIENT);
      if (m === lastAmbient) m = pick(AMBIENT);
      lastAmbient = m; move(m);
      nextMoveAt = now + 15000 + Math.random() * 15000;
    }
  }, 2000);
  let lastAmbient = '';

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) { close(); return; }
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (inField || root.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') { e.preventDefault(); if (panel.hidden) home(!store.get().seen); return; }
    // easter egg: type "temu" anywhere on the page
    typed = (typed + e.key.toLowerCase()).slice(-4);
    if (typed === 'temu') { typed = ''; close(); move('dance'); toast('You called? I was born ready. 💃'); }
  });

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
    camera.position.set(0, 1.75, 9.4); camera.lookAt(0, 1.7, 0);
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

    // rig: a pivot at mid-body, so flips and spins turn around TEMU's middle, not the feet
    const MID = 1.3;
    const rig = new THREE.Group(); rig.position.y = MID; scene.add(rig);
    const temu = new THREE.Group(); temu.position.y = -MID; rig.add(temu);
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
    const thumb = ball(1, C.dark, [0.02, -0.74, 0.24], [0.1, 0.1, 0.28], wingR); thumb.scale.set(0.001, 0.001, 0.001);

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
      const w = canvas.clientWidth || 150, h = canvas.clientHeight || 185;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    size(); addEventListener('resize', size);
    // A still of TEMU in a friendly pose for appreciation cards (a bigger render, then back to normal).
    window.temuSnapshot = () => {
      const keep = [rig.rotation.clone(), rig.position.y, head.rotation.clone(), wingR.rotation.z, wingL.rotation.z, jaw.rotation.x];
      rig.rotation.set(0, 0, 0); rig.position.y = MID; head.rotation.set(0.05, -0.2, 0.1);
      wingR.rotation.z = 2.2; wingL.rotation.z = -0.15; jaw.rotation.x = 0.35; wingR.rotation.x = 0; wingL.rotation.x = 0;
      eyes.forEach((e) => { e.scale.y = 1; }); pupils.forEach((p) => p.position.set(-0.02, 0, 0));
      renderer.setPixelRatio(1); renderer.setSize(360, 444, false); camera.aspect = 360 / 444; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/png');
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); size();
      rig.rotation.copy(keep[0]); rig.position.y = keep[1]; head.rotation.copy(keep[2]); wingR.rotation.z = keep[3]; wingL.rotation.z = keep[4]; jaw.rotation.x = keep[5];
      return url;
    };

    const clock = new THREE.Clock();
    const ease = (a, b, k) => a + (b - a) * k;
    const smooth = (u) => u * u * (3 - 2 * u);
    let nextBlink = 2, thumbS = 0;
    (function tick() {
      requestAnimationFrame(tick);
      if (root.hidden || document.hidden) return;
      const t = clock.getElapsedTime(); anim.now = t;
      const calm = reduced ? 0 : 1;

      // the everyday idle: breathing, a little sway, blinking, looking around
      body.scale.y = 1 + Math.sin(t * 2.2) * 0.015 * calm;
      body.rotation.z = Math.sin(t * 0.9) * 0.03 * calm;
      const j = t - anim.jumpAt;
      rig.position.y = MID + (calm && j >= 0 && j < 0.6 ? Math.sin((j / 0.6) * Math.PI) * 0.45 : 0);
      rig.rotation.set(0, 0, 0); rig.position.x = 0;
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
      const bl = nextBlink - t;
      let lid = bl < 0.12 ? Math.abs(bl - 0.06) / 0.06 : 1;
      jaw.rotation.x = t < anim.talkUntil ? 0.15 + Math.abs(Math.sin(t * 13)) * 0.4 : ease(jaw.rotation.x, 0.15, 0.2);
      const waving = t < anim.waveUntil;
      let wr = waving ? 2.3 + Math.sin(t * 9) * 0.35 : 0.12 + Math.sin(t * 2.2) * 0.04 * calm;
      let wl = -0.12 - Math.sin(t * 2.2) * 0.04 * calm;
      let wrx = 0, wlx = 0, thumbOn = 0, lidR = 1;   // wings swung forward, thumb, right eye

      // special moves override the idle for a while
      const mv = anim.move;
      if (mv) {
        const k = t - mv.t0, u = Math.min(1, k / mv.dur);
        if (mv.name === 'dance') {
          rig.rotation.z = Math.sin(k * 8) * 0.16;
          rig.position.y = MID + Math.abs(Math.sin(k * 8)) * 0.18;
          rig.rotation.y = Math.sin(k * 4) * 0.5;
          head.rotation.z = Math.sin(k * 8 + 1) * 0.25;
          wr = 1.4 + Math.sin(k * 16) * 0.5; wl = -(1.4 + Math.sin(k * 16 + Math.PI) * 0.5);
        } else if (mv.name === 'backflip') {
          rig.position.y = MID + Math.sin(u * Math.PI) * 0.85;
          rig.rotation.x = -Math.PI * 2 * smooth(u);
          wr = 1.6; wl = -1.6;
        } else if (mv.name === 'fly') {
          const lift = Math.sin(u * Math.PI);
          rig.position.y = MID + lift * 0.9 + Math.sin(k * 6) * 0.06 * lift;
          rig.rotation.x = -0.15 * lift;
          wr = 1.2 + Math.sin(k * 28) * 0.9; wl = -(1.2 + Math.sin(k * 28) * 0.9);
        } else if (mv.name === 'spin') {
          rig.rotation.y = Math.PI * 2 * smooth(u);
          wr = 1.0; wl = -1.0;
        } else if (mv.name === 'dizzy') {
          head.rotation.z = Math.sin(k * 10) * 0.35;
          head.rotation.x = Math.cos(k * 10) * 0.2;
          rig.rotation.z = Math.sin(k * 5) * 0.12;
          pupils.forEach((p, i) => { p.position.x = Math.cos(k * 12 + i * Math.PI) * 0.06; p.position.y = Math.sin(k * 12 + i * Math.PI) * 0.06; });
          wr = 0.5 + Math.sin(k * 7) * 0.3; wl = -0.5 - Math.cos(k * 7) * 0.3;
        } else if (mv.name === 'preen') {
          const s = Math.sin(u * Math.PI);
          head.rotation.y = -0.9 * s; head.rotation.x = 0.35 * s;
          wl = -0.12 - 0.5 * s;
        } else if (mv.name === 'look') {
          head.rotation.y = Math.sin(u * Math.PI * 2) * 0.8;
          pupils.forEach((p) => { p.position.x = Math.sin(u * Math.PI * 2) * 0.06; });
        } else if (mv.name === 'stretch') {
          const s = Math.sin(u * Math.PI);
          wr = 0.12 + 2.4 * s; wl = -0.12 - 2.4 * s;
          rig.position.y = MID + s * 0.12;
          jaw.rotation.x = 0.15 + s * 0.5;
        } else if (mv.name === 'thumbsup') {
          const s = Math.min(1, k / 0.35) * Math.min(1, (mv.dur - k) / 0.35);
          wrx = -1.35 * s; wr = 0.35 * s + 0.12; thumbOn = s;
          head.rotation.z = -0.18 * s; head.rotation.x = Math.sin(k * 6) * 0.08 * s;
          if (k > 0.5 && k < 1.1) lidR = 0.05;
          jaw.rotation.x = 0.35 * s;
        } else if (mv.name === 'clap') {
          const s = Math.min(1, k / 0.3) * Math.min(1, (mv.dur - k) / 0.3), c = Math.abs(Math.sin(k * 11));
          wrx = -1.15 * s; wlx = -1.15 * s;
          wr = (-0.25 + 0.4 * c) * s + 0.12 * (1 - s); wl = (0.25 - 0.4 * c) * s - 0.12 * (1 - s);
          rig.position.y = MID + c * 0.05 * s; jaw.rotation.x = 0.3 * s;
        } else if (mv.name === 'salute') {
          const s = Math.min(1, k / 0.4) * Math.min(1, (mv.dur - k) / 0.4);
          wr = 0.12 + 2.45 * s; wrx = -0.75 * s;
          rig.position.y = MID + 0.06 * s; head.rotation.x = -0.1 * s; head.rotation.y = 0;
        } else if (mv.name === 'shrug') {
          const s = Math.sin(u * Math.PI);
          wr = 0.12 + 0.9 * s; wl = -0.12 - 0.9 * s; wrx = -0.35 * s; wlx = -0.35 * s;
          body.scale.y = 1 + 0.05 * s; head.rotation.z = 0.28 * s; jaw.rotation.x = 0.15 + 0.3 * s;
          pupils.forEach((p) => { p.position.y = 0.05 * s; });
        } else if (mv.name === 'facepalm') {
          const s = Math.min(1, k / 0.35) * Math.min(1, (mv.dur - k) / 0.35);
          wrx = -2.05 * s; wr = 0.12 - 0.55 * s;
          head.rotation.x = 0.32 * s; head.rotation.y = Math.sin(k * 7) * 0.18 * s;
          lid = 1 - 0.9 * s;
        } else if (mv.name === 'moonwalk') {
          const s = Math.min(1, k / 0.3) * Math.min(1, (mv.dur - k) / 0.3);
          rig.rotation.y = -1.25 * s;
          rig.position.x = Math.sin(u * Math.PI) * 0.45;
          rig.position.y = MID + Math.abs(Math.sin(k * 9)) * 0.06 * s;
          wr = 0.25 * s + 0.12; wl = -0.25 * s - 0.12; wrx = Math.sin(k * 9) * 0.4 * s; wlx = -Math.sin(k * 9) * 0.4 * s;
          head.rotation.y = 0.9 * s;
        } else if (mv.name === 'rockstar') {
          const s = Math.min(1, k / 0.3) * Math.min(1, (mv.dur - k) / 0.3);
          head.rotation.x = (0.15 + Math.sin(k * 15) * 0.35) * s;
          wr = 0.12 + 2.5 * s;
          wl = -0.4 * s - 0.12 + Math.sin(k * 15) * 0.25 * s; wlx = -1.0 * s;
          rig.position.y = MID + Math.abs(Math.sin(k * 7.5)) * 0.08 * s; jaw.rotation.x = 0.45 * s;
        } else if (mv.name === 'peekaboo') {
          if (u < 0.6) {
            const s = Math.min(1, k / 0.35);
            wrx = -2.25 * s; wlx = -2.25 * s; wr = 0.12 - 0.45 * s; wl = -0.12 + 0.45 * s;
            head.rotation.x = 0.12 * s;
          } else {
            const s = Math.sin(((u - 0.6) / 0.4) * Math.PI);
            wr = 0.12 + 1.6 * s; wl = -0.12 - 1.6 * s;
            rig.position.y = MID + s * 0.35; jaw.rotation.x = 0.15 + 0.4 * s;
          }
        } else if (mv.name === 'wink') {
          const s = Math.sin(u * Math.PI);
          lidR = 1 - 0.95 * s; head.rotation.z = -0.22 * s; head.rotation.y = 0.15 * s; jaw.rotation.x = 0.15 + 0.15 * s;
        } else if (mv.name === 'breakdance') {
          const flip = u < 0.2 ? smooth(u / 0.2) : u > 0.8 ? smooth((1 - u) / 0.2) : 1;
          rig.rotation.x = Math.PI * flip;
          rig.position.y = MID + 0.8 * flip;
          if (u >= 0.2 && u <= 0.8) rig.rotation.y = ((u - 0.2) / 0.6) * Math.PI * 4;
          wr = 0.12 + 1.5 * flip; wl = -0.12 - 1.5 * flip;
        } else if (mv.name === 'celebrate') {
          const s = Math.sin(u * Math.PI);
          rig.position.y = MID + Math.abs(Math.sin(k * 6)) * 0.4 * s;
          wr = 0.12 + 2.5 * s + Math.sin(k * 18) * 0.2 * s; wl = -0.12 - 2.5 * s - Math.sin(k * 18) * 0.2 * s;
          jaw.rotation.x = 0.15 + 0.4 * s; head.rotation.x = -0.15 * s;
        } else if (mv.name === 'nap') {
          head.rotation.x = 0.35; head.rotation.y = 0; head.rotation.z = 0.12;
          body.scale.y = 1 + Math.sin(t * 1.2) * 0.03;
          lid = 0;
        }
        if (u >= 1 && mv.dur !== Infinity) setMove(null);
      }
      eyes.forEach((e, i) => { e.scale.y = Math.max(0.08, i === 1 ? Math.min(lid, lidR) : lid); });
      wingR.rotation.z = ease(wingR.rotation.z, wr, mv ? 0.35 : 0.12);
      wingL.rotation.z = ease(wingL.rotation.z, wl, mv ? 0.35 : 0.12);
      wingR.rotation.x = ease(wingR.rotation.x, wrx, mv ? 0.3 : 0.12);
      wingL.rotation.x = ease(wingL.rotation.x, wlx, mv ? 0.3 : 0.12);
      thumbS = ease(thumbS, thumbOn, 0.25); thumb.scale.set(0.1 * thumbS + 0.001, 0.1 * thumbS + 0.001, 0.28 * thumbS + 0.001);
      renderer.render(scene, camera);
    })();
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    const canvas = $('#temu-cv');
    const go = () => { try { build(window.THREE, canvas); live3d = true; } catch (e) { console.error(e); fallback(); } };
    if (window.THREE) return go();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = go; s.onerror = fallback;
    document.head.appendChild(s);
  }

  // Once a day, the first time someone opens the dashboard: confetti and the day's champions.
  function celebrateChampions(tries = 0) {
    if (!window.Dash || !window.Dash.ready()) { if (tries < 40) setTimeout(() => celebrateChampions(tries + 1), 500); return; }
    const c = window.Dash.champions();
    if (!c.wins.length || store.get().champDay === `${c.day}`) return;
    store.set({ champDay: `${c.day}` });
    setTimeout(() => {
      if (root.hidden || !panel.hidden) return;
      move('celebrate'); confetti();
      const top = c.wins.map(([cat, sec]) => `${sec} in ${cat.replace(/^(?![A-Z]{2})\w/, (ch) => ch.toLowerCase())}`).slice(0, 3).join(', ');
      const extra = c.wins.find((w) => w[3] > 2) ? ` ${c.wins.find((w) => w[3] > 2)[1]} is on a ${c.wins.find((w) => w[3] > 2)[3]}-day streak!` : '';
      toast(`🏆 ${c.yesterday ? 'Yesterday’s' : `${c.label}’s`} champions: ${top}.${extra}`, 12000);
    }, 3500);
  }

  // Wait for the dashboard to draw its menu, then appear; greet first-time visitors.
  function boot() {
    if (!$('#nav [data-tab]')) { setTimeout(boot, 500); return; }
    const st = store.get();
    if (st.hidden) { root.hidden = true; chip.hidden = false; return; }
    start();
    if (st.seen) celebrateChampions();
    if (!st.seen) setTimeout(() => { if (panel.hidden) home(true); store.set({ seen: 1, visits: 1 }); }, 1500);
    else if (!st.toured && (st.visits || 1) < 4) {
      store.set({ visits: (st.visits || 1) + 1 });
      setTimeout(() => { if (panel.hidden && !root.hidden) { anim.waveUntil = anim.now + 2.5; toast('New here? Click me for a quick tour. It takes a minute, and I do a backflip at the end.', 9000); } }, 6000);
    }
  }
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();
