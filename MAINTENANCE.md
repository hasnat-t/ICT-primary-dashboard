# Keeping the ICT Primary Dashboard healthy

Live site: https://web-production-5de5b7.up.railway.app · owner: Hasnat Tariq (NIETE).
This file is for whoever looks after the dashboard: a developer, or the daily Claude Code health-check routine.

## How it works

- `server.js` runs on Railway. Twice a day (07:13 and 14:13 Pakistan time) and on every start it **refreshes**:
  it runs the queries in `sql/` against the Taleemabad data service (about 150 queries, spaced 3.2 s apart because the
  service allows 20 a minute), turns them into one data payload (`unpack.js`, `egra.js`) and serves it to the page.
- Each query file is one **part** (`lp`, `observations`, `debriefs`, `egra`, …). A part that fails keeps its previous
  data (when the teacher roster is unchanged) and the error is recorded; the rest of the refresh carries on.
- The page (`public/index.html`, `app.js`, `calc.js`, `app.css`) does all the maths in the browser from that payload.
  Child-level learning-assessment records and debrief text never go to the page; they are served through `/api/egra` and
  `/api/debrief` as aggregates or one teacher at a time.
- Last good data is saved to Postgres (`DATABASE_URL`), so a restart starts with data.

## User feedback

- Every page has a **Feedback** button. Messages are stored in the Postgres table `feedback` (created automatically;
  a local run without `DATABASE_URL` uses `data/feedback.json`). Only the message, its type, the tab and filters the
  person was looking at, and an optional name and contact are kept — no IP address is stored.
- Review page: `/admin/feedback`, opened with the password in the Railway variable `ADMIN_TOKEN`. Without that variable
  the review endpoints stay closed. Statuses: new, approved, later, declined, done; notes and a CSV export.
- Limits: 8 messages an hour per visitor, 500 a day in total, 3,000 characters a message, a hidden spam field.

## School calendar

- Tab **School calendar** (Directory). Coaches add entries (reason, dates, one or more schools / a sector / all ICT,
  note). No passcode: anyone with the link can add or remove (owner decision 2026-10-30), rate-limited per visitor;
  `CALENDAR_TOKEN` is no longer read and can be deleted from Railway.
  Stored in the Postgres table `school_events` (local runs: `data/events.json`); removal is a soft delete.
  Anyone can read entries at `GET /api/events`.
- Federal public holidays are built in (`NATIONAL` in `events.js`, read-only). Add each year's Cabinet Division circular
  and every moon-sighting notification (Eids, Ashura, Milad) there; cite the notification in the entry's note.

## Checking health

`GET /api/health` (public, no secrets):

| Field | Meaning |
|---|---|
| `ok` | true when data is loaded, the last refresh had no errors and the data is under 26 hours old |
| `parts.<name>` | `ok`, `error` (the message), `at`, `last_ok` for every part of the last refresh |
| `last_refresh` | when it finished, how long it took, how many errors |
| `data_age_hours`, `refreshing`, `version` (deployed git commit), `started_at` | |

A refresh takes about 8–10 minutes; while `refreshing` is true, wait.

## Common failures and fixes

| Error in `parts.<name>.error` | Cause | Fix |
|---|---|---|
| `RATE_LIMITED` | over 20 queries a minute | `executeQuery` already waits and retries; if it still fails, raise `MIN_GAP_MS` in `server.js` |
| `a school came back twice across pages` | (old OFFSET paging) | paging is by school id now; if seen again, check `runPaged` |
| `record count mismatch` / `malformed record` | a query's packed record has a different number of fields than `unpack.js` expects, usually after editing a query | make the record format in the `.sql` file and the parser in `unpack.js` / `egra.js` agree; update `test/` |
| `records for teachers not in the roster` | a query's teacher population drifted from `roster.sql` (`_common.sql` CTE `prim`) | use the shared `prim` CTE in that query |
| `Unrecognized name` / `not found` / SQL syntax | a table or column changed in the data | find the change, fix the query; keep the governed rule comments at the top of the file true |
| `query status error` with a rule message (e.g. `policy`, `redacted`) | the data service's rules changed | read the message; never work around a governance block — open an issue for Hasnat instead |
| `data service HTTP 401/403` | the service credentials on Railway expired | cannot be fixed in code — open an issue for Hasnat |
| page shows "Loading the latest data…" forever | a JavaScript error in `public/app.js` or `calc.js` | `node -e "new (require('vm').Script)(require('fs').readFileSync('public/app.js','utf8'))"` finds syntax errors |

## Before anything goes live (the gate)

```
node -e "const vm=require('vm');for(const f of ['public/app.js','public/calc.js'])new vm.Script(require('fs').readFileSync(f,'utf8'))"
node --check server.js && node --check unpack.js && node --check egra.js
npm test                          # must end with "fail 0"
node scripts/fixture.js && PORT=8800 node server.js &   # made-up data, no data service needed
curl -s localhost:8800/healthz; curl -s localhost:8800/api/data | head -c 200; curl -s "localhost:8800/api/egra?from=0&to=200" | head -c 200
```

Only push to `main` when all of that passes. Railway deploys `main` automatically; the new server refreshes on start.
After ~10 minutes `/api/health` should show `version` = the new commit and `ok: true`. If it got worse, revert the
commit (`git revert`) and push.

## Rules that never bend

- Never commit, print or log the data-service URL (`MCP_URL`), tokens or any Railway variable.
- Children's data: counts and aggregates only; never a child's id, name, recording or transcript; groups of fewer than
  five children are masked.
- DC and HITL observations are never pooled; `/observe2` is never added to HITL; FICO v2 and v3 subject knowledge stay
  apart. These come from the data rules (`v0.39.x`) quoted at the top of each `sql/` file.
- Don't change what a figure means to make an error go away. If the right fix changes a definition, open an issue.
- UI text inside single-quoted JS strings uses a typographic apostrophe (’) — a plain `'` breaks the page.
