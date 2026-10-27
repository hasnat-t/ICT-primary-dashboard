# ICT Primary Dashboard

A live dashboard for NIETE covering **every ICT programme school and sector, primary teachers only**: lesson plans, Digital Coach and coach-visit observations, FICO section scores, children's quizzes and NIETE primary training, per sector, school and teacher.

**Scope: primary teachers** (about 3,250 in 354 schools across 6 sectors, Oct 2026): verified teachers at ICT programme schools (`teacher-headcount.md` §1e: role teacher, not deleted, not a test account, joined on `users.school_id`, Durbeen out) whose Rumi `teacher_level` includes PRIMARY, so primary-only teachers and those who also teach middle/high. Teachers with no level recorded are left out. A "primary school" here is a school with at least one such teacher.

## What it shows

| Area | Figures | Source rule (Taleemabad governed rules) |
|---|---|---|
| Lesson plans | Teachers who got a grade 1–5 plan (WhatsApp or teacher app), **LP engagement %** (÷ primary teachers), plans received, plans taught (teacher's own feedback answer) | `lp-query-rules.md` §0, §4, §6 |
| Digital Coach | Lessons recorded and scored, teachers who recorded | `coaching-query-rules.md` §1, `dc_complete` |
| Coach visits (HITL) | Visits held, teachers visited, debriefed / debrief pending / awaiting review | `hitl_conducted`, `hitl_complete` |
| FICO scores | Lesson-plan fidelity, Subject knowledge, Teaching practices, Student engagement — **Digital Coach and coach visits side by side, never pooled**. Subject knowledge is shown as two sections, FICO v2 (out of 32, to 7 Sep) and v3 (out of 20/24/28, from 8 Sep), because the change on 8 Sep makes them incomparable. LP fidelity only where a plan was attached. `/observe2` visits left out and counted. | `fico-scores-rules.md` §2c |
| Quizzes | Quizzes made, children who sat a lesson quiz, sittings, finished; video quizzes apart. **Counts only.** Quiz *scores* are not shown: there is no governed rule yet (ticket TKT-20261027-c75041). | `quiz-query-rules.md` §0–§7 |
| Training | On the `niete_primary` programme, finished a module, Level 0–3 certificates (Aspiring Teacher, Emerging Practitioner, Skilled Practitioner, Teacher Leader) (NIETE levels end with a grand quiz). All time. | `training-query-rules.md` §1–§7 |

**Period:** data from 1 Aug 2026. The page offers Today, Yesterday, This/Last week, This/Last month, Last 30 days, Since 1 Aug and custom dates, and Daily / Weekly / Monthly trend charts. Distinct children are exact for a single day, a whole week (Monday–Sunday), a whole month or the full period; for other ranges the page shows sittings and says why.

## Tabs

Overview · Lesson plans · Digital Coach · Coach visits · FICO scores · Quizzes · Training · All schools · Teachers (with a scorecard per teacher, and "missing X" filters) · Analytics. Every section can be saved as a PNG with **Download image**. Tables drill down sector → school → teacher.

## How it works

```
Browser ──► server.js (Railway) ──► Taleemabad data service (MCP over HTTP) ──► BigQuery (Niete_Rumi_db)
```

- `server.js` is a small Node server. At startup and at the times in `REFRESH_TIMES_PKT` it runs the queries in `sql/` through the data service's `execute_query` tool, page by page, and keeps the result in memory (plus a cache file, and Postgres if configured).
- The data service returns at most 100 rows, so each query packs one school per row (`STRING_AGG`) and the server pages through schools with a stable `ORDER BY school_id`. `unpack.js` checks every page: record counts, nothing withheld, every record matches a rostered teacher, and a result marked truncated is refused.
- Records are per teacher per day (and per session for observations), so the page can roll up any date range exactly. `public/calc.js` does the roll-ups in the browser.
- If one area's query fails, the others still update and that area keeps its previous values (when the roster is unchanged); the footer shows the error.
- Children's data never leaves the server as anything but counts per teacher, school or sector.

### Queries (`sql/`)

| File | Returns (one row per school unless noted) |
|---|---|
| `_common.sql` | Shared CTEs: programme schools, primary teachers, merged accounts |
| `roster.sql` | Primary teachers and their levels |
| `lp.sql` | Per teacher per day: got a grade 1–5 plan / grade 6–12 lesson, plans, taught, answered |
| `observations.sql` | Per session: DC or HITL, HITL stage, FICO section score and maximum |
| `quizzes.sql` | Quizzes made per teacher-day; children's sittings per day; distinct children per week, month and period, per teacher and for the whole school |
| `quiz_sectors.sql` | Distinct children per sector and all ICT (one row per sector) |
| `training.sql` | Per teacher: on niete_primary, modules finished per level, levels certified |

`node scripts/render.js <name> [--summary]` prints a query with the shared CTEs expanded (with `--summary`, wrapped to return sizes only).

## Settings (environment variables)

| Variable | Required | Meaning |
|---|---|---|
| `MCP_URL` | yes | URL of the Taleemabad data service's MCP endpoint. Keep it secret: set it only as a host variable, never in code. |
| `TALEEMABAD_USER` | yes | Email the data service logs each query under |
| `REFRESH_TOKEN` | no | Admin key for `POST /api/refresh` (header `x-refresh-token`) |
| `REFRESH_TIMES_PKT` | no | Refresh times, e.g. `07:13,14:13` (default) |
| `PAGE_SIZE` | no | Schools per query page, 10–100 (default 50) |
| `RULE_VERSION` | no | Governed rule version logged with each query (default `v0.39.3`) |
| `DATABASE_URL` | no | Postgres for the startup cache; on Railway `${{Postgres.DATABASE_URL}}` |
| `TALEEMABAD_API_TOKEN` | no | Bearer token, only if the data service turns on strict auth |
| `DATA_DIR` | no | Where the cache file is written (default `./data`) |
| `PORT` | no | Set by the host |

## Run locally

```bash
npm install
MCP_URL=... TALEEMABAD_USER=you@example.org node server.js     # open http://localhost:3000
```

Without the data service: `node scripts/fixture.js && node server.js` serves made-up schools and teachers.

Tests: `npm test`.

## Endpoints

`GET /api/data` (the whole payload, gzipped) · `GET /api/status` · `GET /healthz` · `POST /api/refresh` (admin).

## Deploy (Railway)

```bash
railway up --detach
```
