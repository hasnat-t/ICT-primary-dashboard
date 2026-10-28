-- HITL debrief reports per primary teacher since 2026-08-01, for the coach -> teacher view. Same HITL population as
-- observations.sql (coaching-query-rules.md §1/§2b: conducted leader observations with scores, observer is not the
-- teacher, no test observers, /observe2 left out; merged accounts to the survivor). Narrative keys from analysis_data
-- (fico-scores-rules.md, "the whole analysis_data object"): executive_summary, strengths (title, impact),
-- growth_opportunities (area, observation, strategies), recommendations (the action plan), focus_area (title,
-- rationale, try_this_tomorrow). Shown publicly by Hasnat's decision (2026-10-28); the verbatim classroom fields -
-- strengths.evidence, observer_debrief (transcript, feedback evidence), focus_area.lever_question - are never selected,
-- and the server blanks any quoted span left in the text, so children's words are not published.
-- One row per school; t = JSON array of sessions ordered by teacher, day.
WITH {{COMMON}},
h AS (
  SELECT t.school_id, t.teacher_id, cs.id,
         DATE_DIFF(DATE(SAFE_CAST(cs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         SUBSTR(cs.observer_user_id, 1, 8) AS coach,
         CASE WHEN cs.debrief_status = 'done' THEN 'C'
              WHEN cs.status IN ('observer_review_complete', 'completed') THEN 'P' ELSE 'A' END AS stage,
         SAFE.PARSE_JSON(cs.analysis_data) AS j
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)
  LEFT JOIN `Niete_Rumi_db.users` obs ON obs.id = cs.observer_user_id
  WHERE cs.observation_type = 'leader_observation'
    AND cs.status NOT IN ('cancelled', 'abandoned', 'failed', 'test_cleanup')
    AND JSON_QUERY(cs.analysis_data, '$.scores') IS NOT NULL
    AND JSON_VALUE(cs.analysis_data, '$.observe2.rubric') IS NULL
    AND cs.observer_user_id IS NOT NULL AND cs.observer_user_id != cs.user_id
    AND obs.is_test_user IS NOT TRUE
    AND SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
)
SELECT school_id, COUNT(*) AS n,
       TO_JSON_STRING(ARRAY_AGG(STRUCT(
         SUBSTR(teacher_id, 1, 8) AS tid, day AS d, coach AS c, stage AS s,
         JSON_VALUE(j.executive_summary) AS su,
         ARRAY(SELECT AS STRUCT JSON_VALUE(x.title) AS t, JSON_VALUE(x.impact) AS i
               FROM UNNEST(JSON_QUERY_ARRAY(j.strengths)) x) AS st,
         ARRAY(SELECT AS STRUCT JSON_VALUE(x.area) AS a, JSON_VALUE(x.observation) AS o, JSON_VALUE_ARRAY(x.strategies) AS s
               FROM UNNEST(JSON_QUERY_ARRAY(j.growth_opportunities)) x) AS gr,
         JSON_VALUE_ARRAY(j.recommendations) AS rec,
         STRUCT(JSON_VALUE(j.focus_area.title) AS t, JSON_VALUE(j.focus_area.rationale) AS r,
                JSON_VALUE(j.focus_area.try_this_tomorrow) AS y) AS fo
       ) ORDER BY teacher_id, day, id)) AS t
FROM h
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
