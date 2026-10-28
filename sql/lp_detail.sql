-- Lesson-plan detail per primary teacher since 2026-08-01, for the lesson-plan analytics. Plans generated: grade 1-5
-- lesson_plans rows (lp-query-rules.md §1; a menu plan carries its curriculum lesson in content.v8.lesson_id, a typed
-- plan has none). Plans taught (provisional, Hasnat 2026-10-27): DC observations with a recent Rumi plan attached
-- (has_lesson_plan AND lesson_plan_link_method = 'selected_recent'); the lesson taught is
-- lesson_plan_structured._fidelity_ref.lesson_id (6,411 of 6,456 on 2026-10-28) - no governed rule covers it yet.
-- Records joined by "~": "p:tid:day:hour:lesson_id:plans" (hour = Pakistan hour 0-23, lesson_id '' for a typed plan)
-- and "t:tid:day:lesson_id:taught". Merged accounts credited to the survivor.
WITH {{COMMON}},
gen AS (
  SELECT t.school_id, t.teacher_id, p.id,
         DATE_DIFF(DATE(SAFE_CAST(p.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         EXTRACT(HOUR FROM DATETIME(SAFE_CAST(p.created_at AS TIMESTAMP), 'Asia/Karachi')) AS hr,
         COALESCE(JSON_VALUE(p.content, '$.v8.lesson_id'), '') AS lesson
  FROM `Niete_Rumi_db.lesson_plans` p
  LEFT JOIN ict_account_merges m ON m.retired_id = p.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, p.user_id)
  WHERE SAFE_CAST(p.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
taught AS (
  SELECT t.school_id, t.teacher_id, cs.id,
         DATE_DIFF(DATE(SAFE_CAST(cs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         COALESCE(JSON_VALUE(cs.lesson_plan_structured, '$._fidelity_ref.lesson_id'), '') AS lesson
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)
  WHERE cs.observation_type IS NULL AND cs.status != 'test_cleanup'
    AND cs.analysis_data IS NOT NULL AND JSON_QUERY(cs.analysis_data, '$.scores') IS NOT NULL
    AND JSON_VALUE(cs.analysis_data, '$.observe2.rubric') IS NULL
    AND cs.has_lesson_plan AND cs.lesson_plan_link_method = 'selected_recent'
    AND SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
recs AS (
  SELECT school_id, teacher_id, CONCAT('p:', SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', CAST(hr AS STRING), ':', lesson, ':',
                                       CAST(COUNT(DISTINCT id) AS STRING)) AS r
  FROM gen GROUP BY school_id, teacher_id, day, hr, lesson
  UNION ALL
  SELECT school_id, teacher_id, CONCAT('t:', SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', lesson, ':', CAST(COUNT(DISTINCT id) AS STRING))
  FROM taught GROUP BY school_id, teacher_id, day, lesson
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY r) AS t
FROM recs
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
