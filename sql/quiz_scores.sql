-- Children's lesson-quiz scores for primary teachers since 2026-08-01. PROVISIONAL: there is no governed rule for quiz
-- scores yet (request TKT-20261027-c75041); Hasnat asked for them on 2026-10-28. Sittings are the governed child
-- sittings (quiz_attempts card: share-link sitting with no user_id, credited to the share code's teacher), lesson quizzes
-- only, finished only (status = 'completed'). Score = correct_answers / total_questions_answered, pooled; mastery_level is
-- the app's own band. Aggregates only - never a child, a name or a class.
-- Record per teacher, day, quiz grade and subject:
-- "tid:day:grade:subject:finished:correct:answered:mastered:developing:needs_practice", joined by "~".
WITH {{COMMON}},
fin AS (
  SELECT t.school_id, t.teacher_id, qs.id,
         DATE_DIFF(DATE(SAFE_CAST(qs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         REPLACE(REPLACE(COALESCE(TRIM(q.grade), ''), ':', ' '), '~', ' ') AS grade,
         REPLACE(REPLACE(LOWER(COALESCE(TRIM(q.subject), '')), ':', ' '), '~', ' ') AS subject,
         COALESCE(qs.correct_answers, 0) AS c, COALESCE(qs.total_questions_answered, 0) AS n, qs.mastery_level AS ml
  FROM `Niete_Rumi_db.quiz_sessions` qs
  JOIN `Niete_Rumi_db.quiz_share_codes` sc ON sc.id = qs.share_code_id
  JOIN `Niete_Rumi_db.quizzes` q ON q.id = qs.quiz_id
  LEFT JOIN ict_account_merges m ON m.retired_id = sc.teacher_user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, sc.teacher_user_id)
  WHERE qs.source = 'share_link' AND qs.user_id IS NULL AND qs.status = 'completed'
    AND q.quiz_source IN ('transcript', 'lp_v8', 'lp612')
    AND SAFE_CAST(qs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
recs AS (
  SELECT school_id, teacher_id, day,
         CONCAT(SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', grade, ':', subject, ':',
                CAST(COUNT(DISTINCT id) AS STRING), ':', CAST(SUM(c) AS STRING), ':', CAST(SUM(n) AS STRING), ':',
                CAST(COUNTIF(ml = 'mastered') AS STRING), ':', CAST(COUNTIF(ml = 'developing') AS STRING), ':',
                CAST(COUNTIF(ml = 'needs_practice') AS STRING)) AS r
  FROM fin GROUP BY school_id, teacher_id, day, grade, subject
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY teacher_id, day) AS t
FROM recs
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
