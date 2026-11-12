# ICT Dashboard — full context for any agent or developer

> Renamed from "ICT Primary Dashboard" on 2026-11-05 (owner), since it now covers middle & high training too. The repo, folder and live URL keep their old names.

Read this first. It is the single source of truth for what this project is, how it is built and deployed, every
decision the owner has made, and what is still open. Keep it up to date when you change something important.
Last full update: 2026-10-29. Companion files: `MAINTENANCE.md` (health, failures, deploy gate), `README.md`.

> **No secrets live in this repo, and none may ever be added** — the repo is public. Secrets exist only as Railway
> variables (names listed below). Never print, log or commit `MCP_URL`, `ADMIN_TOKEN`, `REFRESH_TOKEN`, `DATABASE_URL`,
> `GMAIL_APP_PASSWORD`, `COACH_CHECK_PASSWORD` or any token.

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
`TALEEMABAD_API_TOKEN`, `DATA_DIR`. Thank-you wall (set by the owner):
`GMAIL_USER` + `GMAIL_APP_PASSWORD` (Gmail app password for its emails — secret), optional `PUBLIC_URL` (link in emails).

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
| data_quality (+ dq_coaches) | dq | **its own school list**: every programme school (Durbeen out, schools with no teacher account included), all teacher levels; per school emis, sector, name, teacher count, assigned coach names (role coach + leader_schools, test rows out) and flagged teachers `tid|name|flags` (L no level, N blank name, D same name twice at the school); dq_coaches = coach accounts with no school (GB out). Built in `dq.js` (min 300 schools). On failure keeps the previous copy. Live 2026-11-08: 415 schools, 6,377 teachers, 98 no level, 10 blank names, 82 same-name rows, 9 schools with no coach, 2 with no teachers, 14 coach accounts with no school. |

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
  - **Lesson plans** — "LP engagement" = the **Rumi sprint-scoreboard method** (owner 2026-11-12): for each school day (Mon–Fri) the share of primary teachers who **used** a grade 1–5 plan that day — generated with Rumi **or opened in the teacher app** (governed lp_users traces) — averaged over the period's school days (`Calc.lpDay` = teacher-school-days with a plan ÷ (teachers × school days); weekday holidays still count). Our own primary-teacher denominator (owner: do NOT use the RDF teacher list), so it reads ~3 pts above the scoreboard (checked 8 Oct–11 Nov: 17.5/16.4/18.8/21.1/17.6 vs sheet 15.0/13.6/16.0/18.0/14.7; generated-only would be ~9%, so the sheet counts app opens). "Reach" / "LP reach" = used at least one plan in the period ÷ primary teachers (the old LP engagement); Sector league, Targets, Compare, Spotlight, champions, heat map and alerts still use reach and are labelled "LP reach". **Sprint weeks** card (`#c-lp-sw`, `Calc.sprintWeeks`): Thursday–Wednesday weeks since 6 Aug, avg school day + reach + each sector; date filter ignored, Sector/School filters apply. Period filter has its own group **Sprint weeks (Thursday–Wednesday)** (owner 2026-11-12): This sprint week (`sweek`), Last sprint week (`lastsweek`) and every earlier one (`sw<from day>`), apart from the Mon–Sun This/Last week; presets() 5th element = sprint flag. Plus plans generated (lesson_plans rows only), plans opened in the app,
    plans taught (= DC observations with a recently generated Rumi plan attached, `selected_recent`; provisional), lesson analytics (subjects, weekdays/hours heat grid, most-taught lessons).
  - **Quizzes** — quizzes made, children (lesson vs video quizzes kept apart), **children's quiz scores** grade × subject grid (provisional; ticket TKT-20261027-c75041). Grade ranges like "Grades 3–5 (exact grade not recorded)" come from transcript quizzes.
  - **Exam generator** — requested / generated / failed / never finished, analytics by subject, grade, source, surface, weekday/hour, chapters; **FDE board papers (grade 5)** card (detected from the paper's `_layout`; all portal so far — none seen from WhatsApp).
- **Observation**
  - **DC observations** — Digital Coach self-recordings; analytics by **subject** (`analysis_data.subject`, DC only) and **grade** (plan grade first: Rumi plan lesson_id, then clear typed grade, else roster grades; provisional), grade × subject heatmap with section picker.
  - **HITL observations** — coach visits ("teachers observed" = distinct teachers); analytics: observations per teacher, weekday, how coaches use the AI form (changed scores / feedback only / unchanged), **by coach** table (names shown — owner's decision), **principals doing HITL** table, by grade. Clicking a coach opens schools → teachers → **score trend + debrief reports**.
  - **/observe2 pilot** — the impact team's fico17 experiment (never added to HITL/FICO): progress, what we're learning, 17 indicators by level, what to work on first, children's thinking, by coach; plus the **pilot study** analysis against the 7 Oct 2026 study design (progress vs targets, DC vs coach final ratings, evidence check marks, joint-lesson vs cross-week agreement, repeat-visit consistency).
  - **FICO scores** — section scores DC vs HITL (v2 and v3 subject knowledge kept apart) + **FICO indicators**: all 37 v3 indicators DC vs HITL, by sector and by week (B only with plan; F5–F7 DC only).
- **Children** — **Learning assessment** (EGRA/EGMA child test, pilot from 22 Oct 2026; includes **children's learning beside teaching** by sector and by school with 5+ tested children, with a correlation only once 8+ schools qualify): children tested, sample progress, reading bands & comprehension (Urdu, English), maths benchmark, skills, by grade/sector; groups <5 children masked; benchmarks proposed, AI-scored.
- **Directory** — **Data quality** (owner request 2026-11-08, `viewDq`; restyled same day: navy health ring = share of teacher accounts with no flag, beside grouped checklist rows `.dq-i` red/green with count, hover = reason + fix, click = jump to the list with the issue filter set via data-dqgo/data-dqf; heat-shaded counts `.dq-h`; colour-coded `.dq-tag` per issue; coach chips): checks (no level, possible duplicates, blank names, schools with no coach / no teachers / 1–2 teachers, impossible scores, coach accounts with no school), a 'Why each one matters' panel (DQ_FLAGS / DQ_SCHOOL hold reason + fix), By sector table (click → that sector's schools with issues; click a school → its school card if it has primary teachers), Teacher accounts to fix (msel issue filter, S.dqFlags; CSV), Impossible scores (obs section score <0 or >max, from S.P.obs; 0 live on 2026-11-08, kept as a guard), Coach accounts with no school (All ICT only). Period filter does not apply; sector/school filters do. Coaches having no users.school_id is by design and is NOT a data-quality problem (coaches-schools-sectors §1).
- **Growth** — Middle & high **Find a school** (owner request 2026-11-12): search box on the header card (`#mhq`, S.mhQ) matches every middle/high school by name or EMIS, including ones with no primary teachers (the top School filter lists only primary schools); a pick sets S.mhSch (index in mh.schools) and wins over the top School filter (`mhSelEmis`); × or changing the top Sector/School clears it.
- **Growth** — **Middle & high training** (owner request 2026-11-05): all ICT middle/high-tagged teachers, all time, sector/school filters apply (school filter only matches schools that also have primary teachers; use the By school table otherwise). Built like the other tabs (2026-11-05): header card with band tiles and a tick-box level-tag dropdown (any of M, H, M+H, P+M, P+H, P+M+H; none ticked = all; S.mhTags) and a Trainings tick-box dropdown (S.mhTrain, vendor keys) that limits every tile, column, level row and popup to the chosen trainings (mhLevels filters the levels; the Teacher Development Programme always stays on its own); both use the shared msel() dropdown. Owner rule 2026-11-05: AI-Powered Subject Pedagogy (Beaconhouse) is done with a certificate in ANY one of its 4 levels (MH_ANY_LEVEL); other trainings need every level. 'All N trainings done' and teachers' 'Trainings done (of N)' use that rule; teacher lists show one column for it (certified level, else the furthest level reached); a By sector / school / teacher table following the Sector and School filters (coverage bars, totals); popups mhsector → mhschool → mhteacher (Back works); analytics cards By training level and By level tag. Programme names as on the portal: NIETE Trainings, Game-Based Teaching (GBTLA, Oxbridge), AI-Powered Subject Pedagogy (Beaconhouse), Teacher Development Programme (I-SAPS). Per partner, never blended; I-SAPS never inside "all levels" (training-query-rules §4b). Live 2026-11-05: 3,652 teachers, 263 schools; I-SAPS now has 2 levels (27, 31) though the rules list one.
- **Growth** — **Primary training** (nav label; tab id `training`): niete_primary, all time; Level 0 Aspiring Teacher, 1 Emerging Practitioner, 2 Skilled Practitioner, 3 Teacher Leader; certificate % per level.
- **Directory** — **All schools**, **Teachers** (scorecard modal includes HITL score trend + debrief reports), **School calendar**: coaches record student assessments, sports week, winter/summer holidays, events, unusual closures or another reason for one or more schools, a whole sector or all ICT (`events.js`, Postgres table `school_events`, `GET /api/events` public, `POST /api/events` and `POST /api/events/<id>/delete` need no passcode — owner removed it 2026-10-30, so anyone with the link can add/remove; rate-limited, removal is a soft delete); month view, engagement vs calendar chart (% teachers active vs % schools with an entry), happening now / coming up / recent; each school's entries in its drill-down card.
- **Team** — **Coach caseload** (owner request 2026-11-12; tab id `coachcheck`, `viewCoachCheck`): each coach's current schools and teachers so the owner can assign schools. Straight from the app's assignments (`S.data.dq.schools` coach names per programme school, from leader_schools at each refresh, so HITL-flow changes show after the next refresh); total teachers (dq, all levels), primary (S.data.teachers), middle/high (S.data.mh.teachers); coach totals sum their schools (shared schools count for each). Cards: KPIs, coaches sorted by teachers with a load bar vs average (click → their schools), schools with no coach. Password `COACH_CHECK_PASSWORD` (Railway only; `GET /api/coachcheck` checks header `x-check-pass`, 10 wrong per visitor-IP per hour then blocked; kept in localStorage `ccPass`); `coachcheck.js` is the gate only. The Yes/No school check it replaced (same day) left an empty Postgres table `coach_school_checks`.
- **Team** — **Dashboard usage** (owner request 2026-11-11; tab `usage`, `viewUsage` in app.js; server `usage.js`): the page posts `/api/usage` on open (`open:1`) and on every tab change (`track()` at the end of render), with a random browser id (localStorage `usage.id`; server stores sha256 only — no IP, no name) and phone/computer. Postgres `usage_daily` (day PKT × visitor × tab, views; tab `_open` = page opens; local `data/usage.json`). Bots / link previews / headless browsers ignored by user agent; 600 posts per visitor-IP per hour. Report `GET /api/admin/usage?days=30|60|120` (ADMIN_TOKEN, same sessionStorage `fbToken` as /admin/feedback): today, yesterday, daily average (last 7 tracked days), this/last week unique, people in range, returning (2+ days), daily bars, by week, most used tabs, phone/computer. Counting began 2026-11-11 (before that only Railway HTTP logs, wiped each deploy).
- **Team** — **Thank-you wall** (owner request 2026-11-10; tab `kudos`; page code `public/kudos.js` (`window.Kudos.view()`, paints itself inside `#kd-root`); server `kudos.js`, `/api/kudos*`): team members thank each other with sticky notes — 8 colours, 5 fonts (Caveat, Permanent Marker, Outfit, Patrick Hand, Noto Nastaliq Urdu; Google Fonts loaded only when the tab opens), 3 sizes, a library of ~100 English + ~28 Urdu messages (an Urdu message switches to the Urdu font), emojis in the text, up to 8 stickers (emojis + stamps) dragged on the note and sized; the preview is the same 280px note as the wall (WYSIWYG). Reactions 👏 ❤️ 🎉 🙌 🌟 (one each per browser, toggle) and comments. Owner rules: no role tags; no team code (owner 2026-11-10: anyone with the link, like the calendar); a random browser key (`kudos.key`, header `x-kudos-key`, stored only as a hash) marks the writer: only the writer or the admin (`ADMIN_TOKEN`, Admin box at the bottom, sessionStorage) can remove a note or comment (soft delete). Optional recipient email, any domain (owner 2026-11-10): sent through Gmail (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, nodemailer pinned 10.2.1) after saving; status pending/sent/failed; the address is never returned to the page. Links are refused in notes and comments (they may be emailed). Limits per visitor per hour: 30 notes/comments/removals, 300 reactions, 10 emails (200 emails a day in all). Tables `kudos_notes`, `kudos_reacts`, `kudos_comments` (local: `data/kudos.json`).
- **Insights** — **Sector league** (owner request 2026-11-10, `viewLeague`, `Calc.sectorLeague`; provisional, owner-defined): every full Monday–Sunday week since 1 Aug (holiday weeks with no activity skipped), each sector ranked on 5 weekly measures (the Targets each-week figures: LP engagement, DC coverage, HITL coverage, DC classroom practice, exam generator); 1st = 6 pts … 6th = 1, ties share the higher points, no figure = 0; max 30. Position by points, then LP engagement, then name. Season = points summed; wins = weeks at 1st; form = last 5 positions; best position. Animated (owner asked): rows are absolutely placed with `transform: translateY(var(--y) * var(--rh))` and slide on change (`lgPaint` repaints rows in place, no full render); on first open rows start at last week's order (`lgAfter`); points count up; ▲ bounces / ▼ shakes; 👑 leader glow; 🔥 biggest climber; ◀ ▶ + slider + '▶ Play season' replay (1.1 s a week; `lgTimer` stopped when leaving the tab); week / season table toggle; detail card for a clicked sector (figure, rank, points, best sector); bump chart of positions with a marker on the chosen week. Reduced motion and print: no movement. Live 2026-11-09: 14 weeks; Urban-I 11 wins; week of 2 Nov B.K 1st (25 pts) up from 4th.
- **Insights** — **Targets** (owner request 2026-11-09, `viewTargets`, `targets.js`, `Calc.targetSeries` / `Calc.targetForecast`): a goal for one measure (LP engagement, DC coverage, HITL coverage, exam generator use = share of primary teachers active; DC classroom practice = average hlp+se) for All ICT / a sector / a school (EMIS), with a **start and end date** (owner, same day) and counted **each week** (Monday–Sunday figure) or **over the whole period** (share active at least once from the start, capped at the end date; DC practice = average since the start) — owner asked to 'capture engagement' over the chosen dates. Stored in Postgres table `dashboard_targets` (columns start_date, mode added by ALTER … IF NOT EXISTS; JSON file locally); `GET /api/targets`, `POST /api/targets`, `POST /api/targets/<id>/delete` — same rules as the school calendar: anyone with the link, name required, soft delete, rate-limited; start ≥ 1 Aug 2026, end after start, ≤ 2 years ahead (past periods allowed, shown met/missed). Forecast: each week = least-squares line through the full weeks since the start (≥3, else the last 6); over a period = the share of not-yet-reached teachers reached each week (mean of the last 3 full weeks, start = 0) applied to those left (a straight line overshot: LP from 15 Oct went 25→47→62→72%, ~27% of those left each week). Statuses achieved / on track / close (within 5) / off track / not enough data / not started / met / missed. Cards: goal, now / so far / final, at start (each week), weeks left, progress bar (fill = now, black mark = goal, stripes = forecast), points a week needed, sparkline + dashed forecast. Plus 'Where each measure is now' (weekly: latest, best, trend). Live 2026-11-09 All ICT each week: LP engagement 49.3%, DC coverage 25.6%, HITL 12.0%, DC classroom practice 63.0%, exam generator 11.0%.
- **Insights** — **Does coaching work?** (owner request 2026-11-09, `viewImpact`, `Calc.coachImpact`; provisional, owner-defined method, no governed rule): each HITL visit in the period/filters vs the teacher's OWN DC recordings (AI-scored, so the coach is not marking their own work) in the 1/2/3 weeks before vs after (visit day out; both windows ended; ≥1 DC each side), minus the average change of comparison teachers = same sector + same starting band (<60 / 60–69.9 / 70+ before-score), no HITL from w days before to w days after, DC both sides, ≥5 of them. Net averaged over visits with a comparison; 95% range ±1.96 SE (per visit). Measures: classroom practice (hlp+se, default), hlp, se, tsk3 (v3 only), lpf. Cards: hero (before → after, change, not visited, coaching effect + verdict Clear gain / Not clear yet / Too few <30), week-by-week chart around the first visit (custom `drawImpact`, zoomed axis, no comparison), which FICO score moves, where it works (visit number, starting band, debrief done), by sector/school, by coach (names; 'do not judge a coach on this alone'), method. Live 2026-11-09 (2 weeks, all period): 1,186 visits / 926 teachers compared, 62.7% → 63.7% (+1.0) vs +0.3 not visited, **net +0.75 (95% +0.54 to +0.97)**; teaching practices +0.72, student engagement +0.84, subject knowledge v3 +0.08 (not clear); 1 week +0.58, 3 weeks +0.91. Matching on starting band matters: unmatched, low starters looked like +3.6 (regression to the mean).
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
