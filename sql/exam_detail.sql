-- Exam-generator detail per primary teacher since 2026-08-01, for the exam analytics. Governed (rules v0.39.3):
-- exam-paper-rules.md §2-§3e - a request is one ask; generated = its root paper is ready; grade_code, subject_code,
-- content_source (seen / unseen / both) and surface (whatsapp / portal) group requests. question_count is what the
-- teacher asked for; question_types gives the mix (objective / subjective categories). Merged accounts to the survivor.
-- Record: "tid:day:hour:grade:subject:source:surface:chapter:requested:generated:questions:objective:subjective".
WITH {{COMMON}},
root AS (SELECT request_id, status FROM `Niete_Rumi_db.assessment_papers` WHERE edited_from IS NULL),
req AS (
  SELECT t.school_id, t.teacher_id, r.id, root.status,
         DATE_DIFF(DATE(SAFE_CAST(r.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         EXTRACT(HOUR FROM DATETIME(SAFE_CAST(r.created_at AS TIMESTAMP), 'Asia/Karachi')) AS hr,
         REGEXP_REPLACE(COALESCE(r.grade_code, ''), r'^grade_', '') AS grade,
         REPLACE(COALESCE(r.subject_code, ''), ':', ' ') AS subject,
         COALESCE(SUBSTR(r.content_source, 1, 1), '') AS src,
         COALESCE(SUBSTR(r.surface, 1, 1), '') AS surf,
         COALESCE(CAST(r.chapter_number AS STRING), '') AS chapter,
         COALESCE(r.question_count, 0) AS q,
         (SELECT COALESCE(SUM(SAFE_CAST(JSON_VALUE(x, '$.count') AS INT64)), 0) FROM UNNEST(JSON_QUERY_ARRAY(r.question_types)) x
          WHERE JSON_VALUE(x, '$.category') = 'objective') AS obj,
         (SELECT COALESCE(SUM(SAFE_CAST(JSON_VALUE(x, '$.count') AS INT64)), 0) FROM UNNEST(JSON_QUERY_ARRAY(r.question_types)) x
          WHERE JSON_VALUE(x, '$.category') != 'objective') AS subj
  FROM `Niete_Rumi_db.assessment_requests` r
  JOIN root ON root.request_id = r.id
  LEFT JOIN ict_account_merges m ON m.retired_id = r.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, r.user_id)
  WHERE SAFE_CAST(r.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
recs AS (
  SELECT school_id, teacher_id,
         CONCAT(SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', CAST(hr AS STRING), ':', grade, ':', subject, ':', src, ':', surf, ':', chapter, ':',
                CAST(COUNT(DISTINCT id) AS STRING), ':', CAST(COUNT(DISTINCT IF(status = 'ready', id, NULL)) AS STRING), ':',
                CAST(SUM(q) AS STRING), ':', CAST(SUM(obj) AS STRING), ':', CAST(SUM(subj) AS STRING)) AS r
  FROM req GROUP BY school_id, teacher_id, day, hr, grade, subject, src, surf, chapter
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY r) AS t
FROM recs
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
