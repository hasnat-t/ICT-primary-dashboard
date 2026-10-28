-- Curriculum lesson catalogue for the lesson-plan analytics: every grade 1-5 menu lesson ICT teachers have generated a
-- plan for (lesson_plans.content.v8.lesson_id, all time) or taught in a DC recording since 2026-08-01, with its grade,
-- subject and title (the most common lesson_plans.topic for that lesson). One row per subject; lessons packed
-- "lesson_id|grade|title" joined by "~".
WITH lp AS (
  SELECT JSON_VALUE(content, '$.v8.lesson_id') AS lesson, grade, subject, topic
  FROM `Niete_Rumi_db.lesson_plans`
  WHERE JSON_VALUE(content, '$.v8.lesson_id') IS NOT NULL
),
titled AS (
  SELECT lesson, ANY_VALUE(grade) AS grade, ANY_VALUE(subject) AS subject,
         ARRAY_AGG(topic IGNORE NULLS ORDER BY topic LIMIT 1)[SAFE_OFFSET(0)] AS any_topic,
         APPROX_TOP_COUNT(topic, 1)[SAFE_OFFSET(0)].value AS top_topic
  FROM lp GROUP BY lesson
),
dc AS (
  SELECT DISTINCT JSON_VALUE(cs.lesson_plan_structured, '$._fidelity_ref.lesson_id') AS lesson
  FROM `Niete_Rumi_db.coaching_sessions` cs
  WHERE cs.observation_type IS NULL AND cs.lesson_plan_link_method = 'selected_recent'
    AND SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
    AND JSON_VALUE(cs.lesson_plan_structured, '$._fidelity_ref.lesson_id') IS NOT NULL
),
cat AS (
  SELECT COALESCE(t.lesson, d.lesson) AS lesson,
         COALESCE(t.grade, REGEXP_EXTRACT(COALESCE(t.lesson, d.lesson), r'^grade_(\d+)_')) AS grade,
         COALESCE(t.subject, REGEXP_EXTRACT(COALESCE(t.lesson, d.lesson), r'^grade_\d+_(.+)_ch\d+')) AS subject,
         COALESCE(t.top_topic, t.any_topic, '') AS title
  FROM titled t FULL OUTER JOIN dc d ON d.lesson = t.lesson
)
SELECT COALESCE(subject, '(none)') AS subject, COUNT(*) AS n,
       STRING_AGG(CONCAT(lesson, '|', COALESCE(grade, ''), '|', REPLACE(REPLACE(REPLACE(title, '|', ' '), '~', ' '), '\n', ' ')), '~' ORDER BY lesson) AS t
FROM cat
GROUP BY 1
ORDER BY 1
