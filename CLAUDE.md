# ICT Dashboard — full context for any agent or developer

> Renamed from "ICT Primary Dashboard" on 2026-11-05 (owner), since it now covers middle & high training too. The repo, folder and live URL keep their old names.

Read this first. It is the single source of truth for what this project is, how it is built and deployed, every
decision the owner has made, and what is still open. Keep it up to date when you change something important.
Last full update: 2026-10-29. Companion files: `MAINTENANCE.md` (health, failures, deploy gate), `README.md`.

> **No secrets live in this repo, and none may ever be added** — the repo is public. Secrets exist only as Railway
> variables (names listed below). Never print, log or commit `MCP_URL`, `ADMIN_TOKEN`, `REFRESH_TOKEN`, `DATABASE_URL`
> or any token.

---

## 1. What it is

A live, **public** web dashboard for **NIETE** (Islamabad Capital Territory, ICT) showing how the **primary teachers**
of the ICT programme schools use the Taleemabad/Rumi tools and how their teaching is going. It covers 6 sectors
(B.K, Nilore, Sihala, Tarnol, Urban-I, Urban-II), ~353 schools, ~3,244 primary teachers, from **1 Aug 2026** onward,
with drill-down sector → school → teacher.

- **Owner:** Hasnat Tariq, NIETE data team — hasnat@niete.edu.pk, GitHub `hasnat-t`.
- **Live site:** https://web-production-5de5b7.up.railway.app
- **Repo (public):** https://github.com/hasnat-t/ICT-primary-dashboard (branch `main`)
- **Local copy (owner's laptop):** `D:\ai booth\ICT-primary-dashboard`. The original brief is
  `D:\ai booth\ICT-primary-dashboard-HANDOFF.md`. It reuses the architecture of the earlier STEPS dashboard
  (`D:\ai booth\STEPS-dashboard`, repo `hasnat-t/STEPS-dashboard`, Railway `web-production-00417`).
- Started 2026-10-27. Built with Claude Code (Opus 5.5) in conversation with the owner.

## 2. Hosting, deployment, automation

| What | Where / how |
|---|---|
| Hosting | **Railway**, workspace "Rumi Deployments", project **ict-primary-dashboard**, services **web** (Node) and **Postgres** |
| Deploy | Railway service `web` is linked to GitHub `hasnat-t/ICT-primary-dashboard` branch `main`: **every push to `main` deploys automatically** (~2–3 min). `railway up --detach` from the repo folder also works (needs the Railway CLI, logged in). |
| Deployed version | `GET /api/health` → `version` = the git commit live on Railway |
| Data refresh | On every server start and daily at **07:13 and 14:13 PKT** (`REFRESH_TIMES_PKT`). ~150 data-service queries, ~8–10 min. The page shows the previous data until the refresh finishes, then updates itself (polls `/api/status` every 60 s). |
| Health check (automated) | Claude Code cloud **routine** `trig_01W9LYSLGcPNman6u8qLjcWB` — https://claude.ai/code/routines/trig_01W9LYSLGcPNman6u8qLjcWB — runs **08:00 and 15:00 PKT** (cron `0 3,10 * * *` UTC), model Opus 5.5, environment "Default" (network: Limited, allowed domain `web-production-5de5b7.up.railway.app`, package managers on, no connectors). It reads `/api/health`; if healthy it does nothing; if not it diagnoses, fixes, runs the gate, pushes to `main` (auto-deploys), verifies recovery and opens a GitHub issue. It cannot reach the data service. Owner chose **auto-deploy if tests pass**. |
| Last good data | Saved to Postgres (`app_cache`) and `data/data.json`, so a restart starts with data |
| Logs | `railway logs` (CLI) or the Railway dashboard |

**Railway variable names** (values only in Railway): `MCP_URL` (data-service endpoint — secret), `TALEEMABAD_USER`
(the identity queries run as — the owner's email), `RULE_VERSION` (governed rules version, now `v0.39.4`),
`DATABASE_URL` (Postgres), `ADMIN_TOKEN` (feedback review password — set by the owner), `REFRESH_TOKEN` (for
`POST /api/refresh`), `PAGE_SIZE`, `REFRESH_TIMES_PKT`, plus Railway's own `RAILWAY_*`. Optional:
`TALEEMABAD_API_TOKEN`, `DATA_DIR`.

## 3. Data source and the rules that govern it

- All data comes from the **Taleemabad data service** (governed BigQuery, dataset `Niete_Rumi_db`), called by
  `server.js` over MCP JSON-RPC (`tools/call` → `execute_query`) with headers `X-Taleemabad-User` and
  `X-Taleemabad-Surface: railway-dashboard`. Every query passes `question`, `rule_version`, `asked_by`, `surface`.
- **Limits:** 100 rows per result (so records are packed per school with `STRING_AGG` and paged); **20 queries a
  minute per person** (so `executeQuery` spaces queries ≥3.2 s and retries `RATE_LIMITED`). Paging is **by school id
  (keyset)**, never OFFSET (data changing mid-refresh made OFFSET repeat schools).
- **Governed rules** (currently **v0.39.4**) decide every definition. In a Claude Code session with the
  `taleemabad-data` plugin, use `resolve_terms` / `get_rules` before writing SQL. Each `sql/*.sql` file starts with a
  comment quoting the rule sections it follows — keep those true. Rule files used: teacher-headcount §1e,
  teacher-levels §1b, lesson-plan rules, coaching-query-rules (§1, §1g by grade, §2b coaches, §2d form edits),
  fico-scores-rules (§2/§2c, v3 subject items, LP fidelity with plan only, /observe2 = fico17), quiz rules,
  exam-paper-rules (§2–§3e), learning-assessment-rules (EGRA/EGMA, §1–§4), transcripts-rules (§5c), training rules.
- **Teacher population** (`sql/_common.sql`, CTE `prim`): verified teachers (role teacher, not deleted, not test) at
  **programme schools** (`taleemabad_governance.school_programme.is_programme_school`), joined on `users.school_id`,
  Durbeen out, **teacher_level includes PRIMARY**; teachers with no level are excluded. `ict_account_merges` maps
  merged-away accounts to the survivor wherever activity is credited. Teacher key = `school_id` + first 8 chars of id.
- Day index = days since 2026-08-01 in Pakistan time (`Asia/Karachi`).

## 4. Code map

```
server.js       HTTP server, refresh pipeline (parts), data-service client (pacing/retry), endpoints, health report
unpack.js       parsers: packed SQL records -> arrays the page uses (one build* per part); unquote() for debriefs
egra.js         learning assessment: per-test records (server-only) -> masked aggregates for /api/egra
feedback.js     user feedback: validation, rate limits, Postgres/file store, admin token check
events.js       school calendar: entry validation, Postgres/file store
db.js           Postgres: app_cache (last good payload) + pool for the feedback table
sql/            one governed query per part; _common.sql = shared CTEs (sp, prim, ict_account_merges)
public/index.html  page shell (sidebar, filters, drill-down <dialog>, feedback <dialog>)
public/app.js   all views, tables, charts, drill-down modal, feedback form (big file, ~1,800 lines)
public/calc.js  all maths from the payload (UMD; also used by tests and server-side checks)
Appreciation cards (Insights tab `cards`, app.js section "appreciation cards"): coaches make a PNG card for one teacher or school from the loaded data (html-to-image, nothing stored). Owner rules 2026-11-02: only the recipient's own figures, FICO as a band only and only when Proficient/Exemplary (never a score), English, three designs. TEMU appears via window.temuSnapshot() from temu.js.
Cards and posters use the dashboard's own period (S.from/S.to): the Period filter and the tab's time-frame box are one setting; opening the tab on Today/Yesterday switches to Last 30 days. School stars poster (same tab, mode 'poster'; also 'Make school stars poster' on a school popup): one school's top 1–5 teachers for a chosen time frame (presets or custom dates), ranked on up to 3 activity indicators + up to 4 FICO sections (DC or HITL; 'overall' = each indicator scaled to the school's best, averaged), with minimum plans/DC filters shown as chips and an optional whole-school strip. Owner asked for named top teachers here (2026-11-02); FICO only as a band. Owner rule: a teacher appears only with 60%+ (Developing or better) in every chosen FICO section (no score does not count; 1 recording is enough); optional stricter 70%+. The whole-school strip can still show a dash for a section below 60%. Modelled on the programme's 'Our ICT stars shine' poster; downloads at 2160px.
public/sw.js + public/manifest.webmanifest  Installable app (PWA, owner choice A 2026-11-08): the page is network-first (deploys arrive on next open), versioned files/fonts/icons/CDN scripts come from the device, /api/data is shown from the device then refreshed in the background, and a copy older than 24 h is deleted, never shown; no other /api or /admin response is stored. Icons in public/assets/icon-*.png (made from the NIETE mark). 'Install app' button (top right) uses beforeinstallprompt; on iPhone it explains Share → Add to Home Screen. If the caching rules change, bump SHELL/DATA names in sw.js so old caches are dropped.
public/temu.js  TEMU, the 3D parrot guide (bottom right). Knowledge lives in GUIDE (per tab: name, intro, [selector, section, text] for every section), FAQ and QUICK. Tours: Quick (14 steps), Full (every tab in menu order, built from GUIDE), and 'Show me around this page' (every section of the current tab). First visit offers both tours; later visits nudge until a tour is finished (localStorage temu.v1: seen, visits, toured). WHEN A TAB OR SECTION IS ADDED OR RENAMED, UPDATE GUIDE (and FAQ). TEMU tools (2026-11-06): Find or go (names/EMIS incl. middle/high-only teachers and schools; plain-text go commands parsed by parseGo: tab, sector, period or month), Who to visit next (primary teachers in the Sector/School filter: no HITL visit since 1 Aug first, or lowest teaching practices + student engagement at the last visit), Who deserves a thank-you (standouts for the current filters, one-click appreciation card or School stars poster). TEMU reaches the page through window.Dash (bridge at the end of app.js): find, go, visits, thanks, open, card, poster. Older summary: tour, "what's on this page", Q&A. three.js r128 from cdnjs, loaded after the page; falls back to an emoji. All answers are written in PAGES / FAQ / TOUR (no AI, no API key). Drives the page only by clicking #nav [data-tab]. Remembers seen/hidden in localStorage key temu.v1. Jokes removed 2026-11-06 (owner). Moves (18, see MOVES/DUR in temu.js): dance, backflip, fly, spin, wave, dizzy, nap, thumbs up (a thumb feather on the right wing), clap, salute, shrug, facepalm, moonwalk, rock out, peekaboo, wink, breakdance, celebrate (confetti); wings also swing forward (rotation.x). While its panel is closed it does a random move every 15–30 s, and naps after 3 idle minutes; moves need the 3D loop (no moves on the emoji fallback). When a tab or card id changes, update TOUR selectors and PAGES text.
public/app.css  styles (design from the owner's mock-up: sidebar, hero cards, tiers)
public/admin.html  private feedback review page (/admin/feedback)
config/coach-overrides.json  coach table display fixes (hide by role/id, rename) - see §6
scripts/fixture.js  writes synthetic data/data.json so the page runs without the data service
scripts/render.js   prints a query with {{COMMON}} expanded (--summary wraps it to return sizes only)
test/*.test.js  node:test suites (npm test) - calc, unpack, egra, feedback
MAINTENANCE.md  health report, common failures and fixes, the deploy gate
```

### Refresh parts (`server.js`, list `parts`; `KEYS` maps part -> payload keys)

| Part (`sql/<name>.sql`) | Payload key | What |
|---|---|---|
| roster | schools, teachers | primary teachers per school `tid|name|levels` (min 300 schools or the refresh aborts) |
| lp | lp | per teacher-day: grade 1–5 / 6–12 plans generated, plans taught, answered |
| lp_lessons + lp_detail | lpd | lesson catalogue + plans generated per hour/lesson and DC-taught lessons (lesson analytics) |
| observations | obs, observe2_excluded | one record per DC/HITL session: kind, stage, FICO section score/max, subject (DC), plan grade, coach, AI-form edit state (16 fields) |
| quizzes / quiz_sectors | quiz, quiz_sectors | quizzes made, sittings, distinct children per bucket (counts only) |
| quiz_scores | qscore | finished lesson quizzes: correct/answered, mastery bands, by grade & subject (provisional) |
| exams / exam_detail | exams, exd | exam generator requests/generated/failed; detail by hour, grade, subject, source, surface, chapter, FDE board kind |
| teacher_grades | tgr | roster grades per teacher (for by-grade cuts) |
| coaches | coaches | HITL observers `id8|name|role` (+ overrides) |
| debriefs | deb (**server only**) | HITL debrief text per teacher, quotes blanked; served by `/api/debrief?t=` |
| observe2 | o2 | /observe2 (fico17) visits: 17 levels, priority, also, children's thinking, overall % |
| pilot | pilot | FICO pilot field forms (`observation_field_forms`, ungoverned): DC levels, final levels, evidence marks, priorities |
| fico_ind | fi | FICO v3 indicator sums per school × kind × week (from 8 Sep) |
| egra / egra_draws | egra, egraDraws (**server only**) | learning-assessment tests and the random sample; served masked by `/api/egra` |
| training | training | niete_primary: assigned, modules per level, certificates |
| (computed) | — | **Champions** (Overview strip under the teacher count, owner idea 2026-11-06): per category (lesson plans g15, DC, HITL, quizzes made, exam papers delivered) the sector with the highest share of its primary teachers active on yesterday, or the last school day (≥3% of teachers planned) within a week; streak = consecutive school days won; record = the sector's best share since 1 Aug (needs 10+ school days). Plus a FICO trophy (owner, 2026-11-06): one combined Digital Coach score per sector and day, pooling teaching practices + student engagement + subject knowledge v3 (points ÷ possible; lesson-plan fidelity out; never pooled with HITL), sector needs 10+ scored DC lessons that day; provisional, in How we count. Click a card → that tab, sector and day. TEMU announces once a day (localStorage champDay) via Dash.champions(). On EVERY tab, a 44 px champions headline bar at the top (#cbar in index.html, filled by champBar() in render(): moving gradient, bouncing trophy, all winners scrolling as a news ticker that pauses on hover, champion(s) of the day = most wins; click a winner for that day; × hides it for the day via localStorage cbHidden, 'Show celebration' on the Overview strip or the gold '🏆 Show champions' button in the top-right corner of every tab (shown only while it is hidden) restores it; still with reduced motion; not printed). It replaced the big Overview banner (owner, 2026-11-06). |
| headcount | hc | every teacher at a programme school by level (primary only, middle/high only, both, no level), per sector + all ICT, counted once; the Overview's top "ICT teachers" strip (follows the Sector filter). Own roster: on failure keeps the previous copy. |
| mh_training (+ mh_catalog) | mh | **its own roster**: every teacher whose teacher_level includes MIDDLE or HIGH (any mix, primary too), per school `tid|name|PMH|on_programme|level:modules,…|cert level ids`; catalogue = levels in niete_middle_high scope (NIETE order_index 2–3, Oxbridge, Beaconhouse) + I-SAPS, found by vendor key, with modules per level. Built in `mh.js` (min 100 schools). On failure keeps the previous copy (not roster-indexed). |

A failed part keeps its previous data only if the roster signature is unchanged; the error goes to `/api/health`.

### Endpoints

`/` page · `/api/data` (gzip payload, no server-only keys) · `/api/status` · `/api/health` (public health report) ·
`/healthz` · `/api/debrief?t=<teacher index>` · `/api/egra?from&to&sector&school` · `POST /api/feedback` ·
`/admin/feedback` (review page) · `/api/admin/feedback[/<id>]` (header `x-admin-token`) ·
`POST /api/refresh` (header `x-refresh-token`). `INDEX_HTML` is stamped with content hashes at start, so a changed
`index.html`/`app.js` needs a server restart (and a new port for local tests).

## 5. What the dashboard shows (sidebar order)

- **Overview** — hero cards, volume strip, adoption ladder, "needs attention", momentum, sector heatmap, focus card, staircase.
- **Teaching**
  - **Lesson plans** — "LP engagement" (teachers who **used** a grade 1–5 plan — generated it with Rumi **or opened it in the teacher app** — ÷ primary teachers; governed lp_users traces), plans generated (lesson_plans rows only), plans opened in the app,
    plans taught (= DC observations with a recently generated Rumi plan attached, `selected_recent`; provisional), lesson analytics (subjects, weekdays/hours heat grid, most-taught lessons).
  - **Quizzes** — quizzes made, children (lesson vs video quizzes kept apart), **children's quiz scores** grade × subject grid (provisional; ticket TKT-20261027-c75041). Grade ranges like "Grades 3–5 (exact grade not recorded)" come from transcript quizzes.
  - **Exam generator** — requested / generated / failed / never finished, analytics by subject, grade, source, surface, weekday/hour, chapters; **FDE board papers (grade 5)** card (detected from the paper's `_layout`; all portal so far — none seen from WhatsApp).
- **Observation**
  - **DC observations** — Digital Coach self-recordings; analytics by **subject** (`analysis_data.subject`, DC only) and **grade** (plan grade first: Rumi plan lesson_id, then clear typed grade, else roster grades; provisional), grade × subject heatmap with section picker.
  - **HITL observations** — coach visits ("teachers observed" = distinct teachers); analytics: observations per teacher, weekday, how coaches use the AI form (changed scores / feedback only / unchanged), **by coach** table (names shown — owner's decision), **principals doing HITL** table, by grade. Clicking a coach opens schools → teachers → **score trend + debrief reports**.
  - **/observe2 pilot** — the impact team's fico17 experiment (never added to HITL/FICO): progress, what we're learning, 17 indicators by level, what to work on first, children's thinking, by coach; plus the **pilot study** analysis against the 7 Oct 2026 study design (progress vs targets, DC vs coach final ratings, evidence check marks, joint-lesson vs cross-week agreement, repeat-visit consistency).
  - **FICO scores** — section scores DC vs HITL (v2 and v3 subject knowledge kept apart) + **FICO indicators**: all 37 v3 indicators DC vs HITL, by sector and by week (B only with plan; F5–F7 DC only).
- **Children** — **Learning assessment** (EGRA/EGMA child test, pilot from 22 Oct 2026; includes **children's learning beside teaching** by sector and by school with 5+ tested children, with a correlation only once 8+ schools qualify): children tested, sample progress, reading bands & comprehension (Urdu, English), maths benchmark, skills, by grade/sector; groups <5 children masked; benchmarks proposed, AI-scored.
- **Growth** — **Middle & high training** (owner request 2026-11-05): all ICT middle/high-tagged teachers, all time, sector/school filters apply (school filter only matches schools that also have primary teachers; use the By school table otherwise). Built like the other tabs (2026-11-05): header card with band tiles and a tick-box level-tag dropdown (any of M, H, M+H, P+M, P+H, P+M+H; none ticked = all; S.mhTags) and a Trainings tick-box dropdown (S.mhTrain, vendor keys) that limits every tile, column, level row and popup to the chosen trainings (mhLevels filters the levels; the Teacher Development Programme always stays on its own); both use the shared msel() dropdown. Owner rule 2026-11-05: AI-Powered Subject Pedagogy (Beaconhouse) is done with a certificate in ANY one of its 4 levels (MH_ANY_LEVEL); other trainings need every level. 'All N trainings done' and teachers' 'Trainings done (of N)' use that rule; teacher lists show one column for it (certified level, else the furthest level reached); a By sector / school / teacher table following the Sector and School filters (coverage bars, totals); popups mhsector → mhschool → mhteacher (Back works); analytics cards By training level and By level tag. Programme names as on the portal: NIETE Trainings, Game-Based Teaching (GBTLA, Oxbridge), AI-Powered Subject Pedagogy (Beaconhouse), Teacher Development Programme (I-SAPS). Per partner, never blended; I-SAPS never inside "all levels" (training-query-rules §4b). Live 2026-11-05: 3,652 teachers, 263 schools; I-SAPS now has 2 levels (27, 31) though the rules list one.
- **Growth** — **Primary training** (nav label; tab id `training`): niete_primary, all time; Level 0 Aspiring Teacher, 1 Emerging Practitioner, 2 Skilled Practitioner, 3 Teacher Leader; certificate % per level.
- **Directory** — **All schools**, **Teachers** (scorecard modal includes HITL score trend + debrief reports), **School calendar**: coaches record student assessments, sports week, winter/summer holidays, events, unusual closures or another reason for one or more schools, a whole sector or all ICT (`events.js`, Postgres table `school_events`, `GET /api/events` public, `POST /api/events` and `POST /api/events/<id>/delete` need no passcode — owner removed it 2026-10-30, so anyone with the link can add/remove; rate-limited, removal is a soft delete); month view, engagement vs calendar chart (% teachers active vs % schools with an entry), happening now / coming up / recent; each school's entries in its drill-down card.
- **Insights** — **Monthly report** (pick a month: headline figures with change vs the previous month, sectors, FICO, leading/support schools, calendar entries, learning assessment; Print / Save as PDF with a print stylesheet), **How we count** (glossary of every metric: definition, source, governed or provisional; searchable), **Leading & support** (schools/teachers leading the way and where support is most needed, on "using the tools" or "classroom practice" DC/HITL, with minimum samples), **Analytics** (trends).
- Every page: **change vs the previous period** (▲/▼ chips on hero cards, main KPI tiles and coverage columns: percentage points for shares, % for counts; none for "Since 1 Aug" or all-time figures); **Download image** (opens scroll areas and widens to full content; tables over 60 rows are imaged with the first 60 and a pointer to CSV) and **Download CSV** on every table (exactly the rows/columns on screen); **Feedback** button; period presets (today … since 1 Aug, custom), sector and school filters, daily/weekly/monthly grouping, Download image, Present mode.

**Performance bands** (used everywhere): Exemplary ≥80 ✓ `#1F7A4C`, Proficient 70–79.9 ● `#A6DDBB`, Developing 60–69.9 ▲ `#F5D49A`, Needs support <60 ! `#EE9A86`. Chart colours: DC `#1F7A4C`, HITL `#C4741C`.

## 6. Owner decisions (do not reverse without asking Hasnat)

- Window since 2026-08-01; daily/weekly/monthly/custom views. Primary teachers only; no-level teachers excluded.
- FICO v2 and v3 subject knowledge shown separately; DC and HITL never pooled; /observe2 separate (impact team's experiment).
- Training = all-time niete_primary. Quiz scores and plans-taught definition are provisional (owner-defined).
- **Public site**, teacher names shown; **coach names shown** (labelled internal use only); **HITL debrief text public** — but verbatim classroom fields (evidence quotes, transcripts, lever questions) are never selected and any quoted span is blanked (`unpack.js` `unquote`), so no child's words are published.
- Coach table overrides (`config/coach-overrides.json`): hide role `principal` (they have their own table) and accounts a8bf5a34 (Hasnat Tariq), b0a2d9ff (Amena Ahmed), c30c79f1 (Haroon Yaseen); rename 21f1119a "Sumaya Imran" → "Irum Afzal". Hidden observers still count in every total. Coach table shows each coach's **main sector** only.
- Grade for DC/HITL lessons: plan grade first, roster fallback (owner chose the mix).
- Health routine: auto-deploy fixes if tests pass; report via GitHub issues; 08:00 & 15:00 PKT.
- Feedback: owner reviews and approves at `/admin/feedback`. **TEMU chatbot deferred** ("later"): planned as a humorous, sarcastic-but-respectful data analyst; recommended start = answers from dashboard data only + files data requests into the feedback queue; live governed queries only behind a staff sign-in later. Needs an Anthropic API key on Railway and a daily spend cap.
- UI wording the owner asked for: "LP engagement", "HITL observations", "DC observations", "Exam generator", "Exams generated", "Plans generated", "Teachers observed" (not "visited").

## 7. Privacy and safety rules (non-negotiable)

- Children: counts and aggregates only; never a child's id/name/recording/transcript; learning-assessment groups of 1–4 children show "fewer than 5". Child-level records stay server-side.
- Never commit secrets; scan the diff before every push.
- Never weaken a governed filter to make an error go away; open an issue for the owner instead.
- In UI text inside single-quoted JS strings use the typographic apostrophe (’) — a plain `'` broke the live page once.

## 8. Working on it

```
cd "D:\ai booth\ICT-primary-dashboard"          # or clone the repo
npm install
node scripts/fixture.js && node server.js        # made-up data on http://localhost:3000 (set PORT to change)
npm test                                         # must end "fail 0"
```

**Deploy gate (always):** `public/app.js`, `public/calc.js` and `public/temu.js` parse (`vm.Script`), `node --check` on server/unpack/egra/feedback, `npm test` has `fail 0`, a local fixture run serves `/healthz`, `/api/data`, `/api/egra`; look at the changed screen (Playwright is in `D:\ai booth\frontend\node_modules\playwright` on the owner's laptop). Then commit (end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), push to `main`, wait for `/api/health` `version` = your commit, and load the live page to check for errors.

**Adding a data part:** write `sql/<name>.sql` (governed comment header, `{{COMMON}}`, pack per school, `ORDER BY school_id LIMIT {{LIMIT}} OFFSET {{OFFSET}}` placeholder — `runPaged` rewrites it to keyset), add a `build*` parser + test, add it to `SQL`, `QUESTIONS`, `parts` and `KEYS` in `server.js`, verify totals live against a governed query before deploying.

## 9. Verified live figures (snapshots, for sanity checks)

- 2026-10-28/29: 353 schools, 3,243–3,244 primary teachers; HITL 4,351 observations of 2,782 teachers (85.8%); DC 23,807 lessons; /observe2 182 visits, 98 teachers, 13 coaches; exams 8,218 requested / 7,833 generated; FDE board papers 301 (299 grade 5); learning assessment 69 children tested (62 completed), 22 schools, 37 test/practice tests excluded; pilot field forms 277 (195 final).
- Refresh takes ~490 s with 0 errors when healthy.

## 10. Open items / ideas

- **National holidays in the school calendar** are a built-in list (`NATIONAL` in `events.js`), verified 2026-10-29 from the Cabinet Division 2026 circular and its 21 Aug 2026 notification (Eid Milad-un-Nabi on 26 Aug). 2027 has only the fixed-date holidays. **Update it** when the Cabinet Division issues the 2027 circular (usually late December) and each time an Islamic holiday (Eid-ul-Fitr, Eid-ul-Adha, Ashura, Milad) is notified after moon sighting. Never guess Islamic dates.

- TEMU data-analyst chatbot (deferred, see §6).
- Pilot study: provisional levels are not stored as levels (only answers + priority) — ask the impact team where the app keeps sealed provisional levels to enable the provisional-vs-final comparison.
- /observe2 on WhatsApp: no FDE or board-format paper seen from WhatsApp yet — confirm with product.
- Learning assessment: 64 of 69 tests had "another voice heard" — worth checking with the field team.
- Provisional definitions awaiting governance: quiz scores (TKT-20261027-c75041), plans taught, plan-derived grade, FDE detection, pilot forms.
- Possible: daily digest of new feedback (e.g. a GitHub issue), Google sign-in for staff-only features.

## 11. Where else context lives (owner's laptop)

- Claude Code memory: `C:\Users\User\.claude\projects\d--ai-booth\memory\` (`MEMORY.md` index; `project_ict_primary_dashboard.md`, `feedback_deploy_gate.md`, data-layer reference).
- Session transcript of the build: `C:\Users\User\.claude\projects\d--ai-booth\61116e1d-f10b-49ed-9965-a90794986a2f.jsonl`.
