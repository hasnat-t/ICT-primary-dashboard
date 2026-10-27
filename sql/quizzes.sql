-- Quizzes for primary teachers since 2026-08-01. Governed (rules v0.39.3): quiz-query-rules.md §0, §2, §5-§7 and
-- the lesson_quizzes_made / quiz_attempts cards. Made = lesson quiz (transcript, lp_v8, lp612) with status ready,
-- sent or report_sent, credited to its owner. A child sitting = share-link sitting with no user_id, credited to the
-- share code's teacher; finished = status 'completed'; children counted on student_id. Lesson (L) and video (V)
-- quizzes kept apart. Counts only - never a child, a name or a class.
-- tid '*' = the whole school (a child taught by two teachers counted once). Records joined by "~": "m:tid:day:made", "s:tid:day:kind:sittings:finished:children",
-- "w:tid:week:kind:children" (week = day index of its Monday), "o:tid:yyyymm:kind:children", "a:tid:kind:children".
WITH {{COMMON}},
made AS (
  SELECT t.school_id, t.teacher_id, DATE(SAFE_CAST(q.created_at AS TIMESTAMP), 'Asia/Karachi') AS d, q.id
  FROM `Niete_Rumi_db.quizzes` q
  LEFT JOIN ict_account_merges m ON m.retired_id = q.teacher_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, q.teacher_id)
  WHERE q.quiz_source IN ('transcript', 'lp_v8', 'lp612')
    AND q.status IN ('ready', 'sent', 'report_sent')
    AND SAFE_CAST(q.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
sittings AS (
  SELECT t.school_id, t.teacher_id, qs.id, qs.status, qs.student_id,
         DATE(SAFE_CAST(qs.created_at AS TIMESTAMP), 'Asia/Karachi') AS d,
         CASE WHEN q.quiz_source = 'video' THEN 'V' WHEN q.quiz_source IN ('transcript', 'lp_v8', 'lp612') THEN 'L' END AS kind
  FROM `Niete_Rumi_db.quiz_sessions` qs
  JOIN `Niete_Rumi_db.quiz_share_codes` sc ON sc.id = qs.share_code_id
  JOIN `Niete_Rumi_db.quizzes` q ON q.id = qs.quiz_id
  LEFT JOIN ict_account_merges m ON m.retired_id = sc.teacher_user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, sc.teacher_user_id)
  WHERE qs.source = 'share_link' AND qs.user_id IS NULL
    AND q.quiz_source IN ('transcript', 'lp_v8', 'lp612', 'video')
    AND SAFE_CAST(qs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
sk AS (                                              -- each sitting under its teacher, and under '*' for the whole school
  SELECT school_id, SUBSTR(teacher_id, 1, 8) AS k, id, status, student_id, d, kind,
         DATE_DIFF(DATE_TRUNC(d, WEEK(MONDAY)), DATE '2026-08-01', DAY) AS wk, FORMAT_DATE('%Y%m', d) AS mo FROM sittings
  UNION ALL
  SELECT school_id, '*', id, status, student_id, d, kind,
         DATE_DIFF(DATE_TRUNC(d, WEEK(MONDAY)), DATE '2026-08-01', DAY), FORMAT_DATE('%Y%m', d) FROM sittings
),
recs AS (
  SELECT school_id, CONCAT('m:', SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', CAST(COUNT(DISTINCT id) AS STRING)) AS r
  FROM (SELECT *, DATE_DIFF(d, DATE '2026-08-01', DAY) AS day FROM made) GROUP BY school_id, teacher_id, day
  UNION ALL
  SELECT school_id, CONCAT('s:', k, ':', CAST(DATE_DIFF(d, DATE '2026-08-01', DAY) AS STRING), ':', kind, ':',
                                       CAST(COUNT(DISTINCT id) AS STRING), ':', CAST(COUNT(DISTINCT IF(status = 'completed', id, NULL)) AS STRING), ':',
                                       CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sk GROUP BY school_id, k, d, kind
  UNION ALL
  SELECT school_id, CONCAT('w:', k, ':', CAST(wk AS STRING), ':', kind, ':', CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sk GROUP BY school_id, k, wk, kind
  UNION ALL
  SELECT school_id, CONCAT('o:', k, ':', mo, ':', kind, ':', CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sk GROUP BY school_id, k, mo, kind
  UNION ALL
  SELECT school_id, CONCAT('a:', k, ':', kind, ':', CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sk GROUP BY school_id, k, kind
  UNION ALL                                           -- either kind, each child once
  SELECT school_id, CONCAT('a:', k, ':E:', CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sk GROUP BY school_id, k
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY r) AS t
FROM recs
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
