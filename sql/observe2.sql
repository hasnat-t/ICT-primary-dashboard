-- /observe2 coach visits of primary teachers since 2026-08-01: the impact team's fico17 experiment (from 2026-10-09).
-- Governed (rules v0.39.3): fico-scores-rules.md "/observe2 coach visits are a different rubric" - told apart by
-- analysis_data.observe2.rubric = 'fico17', HITL only, never pooled with /observe (FICO) indicators or sections; same
-- HITL population filters as observations.sql (coaching-query-rules.md §1/§2b). The coach sets 17 levels herself
-- (observe2.final_levels: 1-4, NA = not applicable, IE = couldn't tell); observe2.priority = what to work on first
-- (an indicator or 'plan'), observe2.also = also work on, observe2.thinking.seen = the children's thinking the coach saw.
-- Record: "tid:day:coach:stage:levels:priority:also:seen:overall_pct:lpf_s:lpf_m"; levels = 17 characters in the order
-- C1-C8 D1-D5 F1-F4, each 1-4, n (NA), i (IE) or - (missing); also / seen are comma lists.
WITH {{COMMON}},
v AS (
  SELECT t.school_id, t.teacher_id, cs.id,
         DATE_DIFF(DATE(SAFE_CAST(cs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         SUBSTR(cs.observer_user_id, 1, 8) AS coach,
         CASE WHEN cs.debrief_status = 'done' THEN 'C'
              WHEN cs.status IN ('observer_review_complete', 'completed') THEN 'P' ELSE 'A' END AS stage,
         cs.has_lesson_plan,
         SAFE.PARSE_JSON(cs.analysis_data) AS j
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)
  LEFT JOIN `Niete_Rumi_db.users` obs ON obs.id = cs.observer_user_id
  WHERE cs.observation_type = 'leader_observation'
    AND JSON_VALUE(cs.analysis_data, '$.observe2.rubric') = 'fico17'
    AND cs.status NOT IN ('cancelled', 'abandoned', 'failed', 'test_cleanup')
    AND JSON_QUERY(cs.analysis_data, '$.scores') IS NOT NULL
    AND cs.observer_user_id IS NOT NULL AND cs.observer_user_id != cs.user_id
    AND obs.is_test_user IS NOT TRUE
    AND SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
rec AS (
  SELECT school_id, teacher_id, day, id,
         CONCAT(SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', coach, ':', stage, ':',
                (SELECT STRING_AGG(CASE JSON_VALUE(j.observe2.final_levels[k]) WHEN '1' THEN '1' WHEN '2' THEN '2' WHEN '3' THEN '3'
                                        WHEN '4' THEN '4' WHEN 'NA' THEN 'n' WHEN 'IE' THEN 'i' ELSE '-' END, '' ORDER BY o)
                 FROM UNNEST(['C1','C2','C3','C4','C5','C6','C7','C8','D1','D2','D3','D4','D5','F1','F2','F3','F4']) k WITH OFFSET o), ':',
                IFNULL(REGEXP_REPLACE(JSON_VALUE(j.observe2.priority), r'[:,~]', ''), ''), ':',
                IFNULL(ARRAY_TO_STRING(ARRAY(SELECT REGEXP_REPLACE(x, r'[:,~]', '') FROM UNNEST(JSON_VALUE_ARRAY(j.observe2.also)) x), ','), ''), ':',
                IFNULL(ARRAY_TO_STRING(ARRAY(SELECT REGEXP_REPLACE(x, r'[:,~]', '') FROM UNNEST(JSON_VALUE_ARRAY(j.observe2.thinking.seen)) x), ','), ''), ':',
                IFNULL(FORMAT('%g', SAFE_CAST(JSON_VALUE(j.scores.overall_percentage) AS FLOAT64)), ''), ':',
                IF(has_lesson_plan, IFNULL(FORMAT('%g', SAFE_CAST(JSON_VALUE(j.domains.lesson_plan_fidelity.domain_score) AS FLOAT64)), ''), ''), ':',
                IF(has_lesson_plan, IFNULL(FORMAT('%g', SAFE_CAST(JSON_VALUE(j.domains.lesson_plan_fidelity.domain_max) AS FLOAT64)), ''), '')) AS r
  FROM v
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY teacher_id, day, id) AS t
FROM rec
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
