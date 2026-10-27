-- Exam papers from the /assessment generator, per primary teacher per Pakistan day since 2026-08-01 (live from
-- 2026-09-05). Governed (rules v0.39.3): exam-paper-rules.md §2-§3. A request is one ask; its root paper
-- (edited_from IS NULL, exactly one per request) says whether a paper came out: delivered = root status 'ready',
-- failed = 'failed', never finished = root still 'generating' more than an hour after the request. Edited = any
-- version row branched from the family. Paper rows are never counted as papers made. Merged accounts credited to
-- the survivor. Record: "tid:day:requested:delivered:failed:never_finished:edited".
WITH {{COMMON}},
root AS (
  SELECT request_id, status FROM `Niete_Rumi_db.assessment_papers` WHERE edited_from IS NULL
),
edited AS (
  SELECT DISTINCT request_id FROM `Niete_Rumi_db.assessment_papers` WHERE edited_from IS NOT NULL
),
req AS (
  SELECT t.school_id, t.teacher_id, r.id,
         DATE_DIFF(DATE(SAFE_CAST(r.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         root.status,
         SAFE_CAST(r.created_at AS TIMESTAMP) < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR) AS over_an_hour,
         e.request_id IS NOT NULL AS was_edited
  FROM `Niete_Rumi_db.assessment_requests` r
  JOIN root ON root.request_id = r.id
  LEFT JOIN edited e ON e.request_id = r.id
  LEFT JOIN ict_account_merges m ON m.retired_id = r.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, r.user_id)
  WHERE SAFE_CAST(r.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
td AS (
  SELECT school_id, teacher_id, day,
         COUNT(DISTINCT id) AS requested,
         COUNT(DISTINCT IF(status = 'ready', id, NULL)) AS delivered,
         COUNT(DISTINCT IF(status = 'failed', id, NULL)) AS failed,
         COUNT(DISTINCT IF(status = 'generating' AND over_an_hour, id, NULL)) AS never_finished,
         COUNT(DISTINCT IF(was_edited, id, NULL)) AS edited
  FROM req GROUP BY 1, 2, 3
)
SELECT school_id, COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', CAST(requested AS STRING), ':', CAST(delivered AS STRING), ':',
                         CAST(failed AS STRING), ':', CAST(never_finished AS STRING), ':', CAST(edited AS STRING)),
                  '~' ORDER BY teacher_id, day) AS t
FROM td
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
