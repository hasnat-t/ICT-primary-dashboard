-- Distinct children taking quizzes from primary teachers, per sector and for all ICT, since 2026-08-01, so a sector
-- or ICT total never adds up school counts (a child can sit quizzes from more than one teacher or school).
-- Same governed sittings as quizzes.sql (quiz_attempts card). Counts only.
-- Records joined by "~": "d:day:kind:children", "w:week:kind:children", "o:yyyymm:kind:children", "a:kind:children";
-- kind L lesson, V video, E either kind.
WITH {{COMMON}},
sittings AS (
  SELECT s.region AS sector, qs.student_id, DATE(SAFE_CAST(qs.created_at AS TIMESTAMP), 'Asia/Karachi') AS d,
         IF(q.quiz_source = 'video', 'V', 'L') AS kind
  FROM `Niete_Rumi_db.quiz_sessions` qs
  JOIN `Niete_Rumi_db.quiz_share_codes` sc ON sc.id = qs.share_code_id
  JOIN `Niete_Rumi_db.quizzes` q ON q.id = qs.quiz_id
  LEFT JOIN ict_account_merges m ON m.retired_id = sc.teacher_user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, sc.teacher_user_id)
  JOIN `Niete_Rumi_db.schools` s ON s.id = t.school_id
  WHERE qs.source = 'share_link' AND qs.user_id IS NULL
    AND q.quiz_source IN ('transcript', 'lp_v8', 'lp612', 'video')
    AND SAFE_CAST(qs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
sx AS (
  SELECT sector AS area, student_id, d, kind FROM sittings
  UNION ALL SELECT 'ALL', student_id, d, kind FROM sittings
),
sxk AS (
  SELECT area, student_id, kind, DATE_DIFF(d, DATE '2026-08-01', DAY) AS day,
         DATE_DIFF(DATE_TRUNC(d, WEEK(MONDAY)), DATE '2026-08-01', DAY) AS wk, FORMAT_DATE('%Y%m', d) AS mo
  FROM (SELECT area, student_id, d, kind FROM sx UNION ALL SELECT area, student_id, d, 'E' FROM sx)
),
recs AS (
  SELECT area, CONCAT('d:', CAST(day AS STRING), ':', kind, ':', CAST(COUNT(DISTINCT student_id) AS STRING)) AS r
  FROM sxk GROUP BY area, day, kind
  UNION ALL
  SELECT area, CONCAT('w:', CAST(wk AS STRING), ':', kind, ':', CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sxk GROUP BY area, wk, kind
  UNION ALL
  SELECT area, CONCAT('o:', mo, ':', kind, ':', CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sxk GROUP BY area, mo, kind
  UNION ALL
  SELECT area, CONCAT('a:', kind, ':', CAST(COUNT(DISTINCT student_id) AS STRING))
  FROM sxk GROUP BY area, kind
)
SELECT area, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY r) AS t
FROM recs GROUP BY area ORDER BY area
