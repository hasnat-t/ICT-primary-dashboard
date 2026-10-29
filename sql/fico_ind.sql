-- FICO indicator scores per school, kind and week, FICO v3 only (observations from 2026-09-08). Governed (rules v0.39.3):
-- fico-scores-rules.md §2c per-indicator - domains.<section>.indicators[{id, score "1"-"4"}], grouped by id, reported as
-- AVG(score)/4; DC and HITL never pooled; one rubric version (v3, from 2026-09-08); lesson-plan fidelity (B1-B10) only
-- where a plan was attached (has_lesson_plan); F5/F6/F7 count only where scored (v3 leaves them null when they do not
-- apply) - and for HITL not at all: HITL still scores them on nearly every lesson and records the subject on ~11%, so
-- they cannot be read (§2c subject trap). Same observation population as observations.sql; /observe2 left out.
-- Record "kind:week:" + 37 "sum/count" pairs in the order B1-B10 C1-C12 D1-D7 F1-F8 ('' = none); week 0 = w/c 7 Sep.
WITH {{COMMON}},
s AS (
  SELECT t.school_id, cs.id, IF(cs.observation_type = 'leader_observation', 'H', 'D') AS kind, cs.has_lesson_plan,
         DIV(DATE_DIFF(DATE(SAFE_CAST(cs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-09-07', DAY), 7) AS wk,
         SAFE.PARSE_JSON(cs.analysis_data) AS j
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)
  LEFT JOIN `Niete_Rumi_db.users` obs ON obs.id = cs.observer_user_id
  WHERE SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-09-08', 'Asia/Karachi')
    AND JSON_QUERY(cs.analysis_data, '$.scores') IS NOT NULL
    AND JSON_VALUE(cs.analysis_data, '$.observe2.rubric') IS NULL
    AND ((cs.observation_type IS NULL AND cs.status != 'test_cleanup')
         OR (cs.observation_type = 'leader_observation'
             AND cs.status NOT IN ('cancelled', 'abandoned', 'failed', 'test_cleanup')))
    AND (cs.observer_user_id IS NULL OR cs.observer_user_id != cs.user_id)
    AND obs.is_test_user IS NOT TRUE
),
ids AS (SELECT id, o FROM UNNEST(['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','C1','C2','C3','C4','C5','C6','C7','C8','C9','C10',
  'C11','C12','D1','D2','D3','D4','D5','D6','D7','F1','F2','F3','F4','F5','F6','F7','F8']) id WITH OFFSET o),
i AS (
  SELECT s.school_id, s.kind, s.wk, JSON_VALUE(x.id) AS id, SAFE_CAST(JSON_VALUE(x.score) AS INT64) AS score
  FROM s, UNNEST(JSON_KEYS(s.j.domains, 1)) d, UNNEST(JSON_QUERY_ARRAY(s.j.domains[d].indicators)) x
  WHERE (d != 'lesson_plan_fidelity' OR s.has_lesson_plan IS TRUE)
),
agg AS (
  SELECT i.school_id, i.kind, i.wk, ids.o, SUM(i.score) AS sm, COUNT(i.score) AS n
  FROM i JOIN ids ON ids.id = i.id
  WHERE i.score BETWEEN 1 AND 4 AND NOT (i.kind = 'H' AND i.id IN ('F5', 'F6', 'F7'))
  GROUP BY 1, 2, 3, 4
),
cells AS (
  SELECT k.school_id, k.kind, k.wk, ids.o, a.sm, a.n
  FROM (SELECT DISTINCT school_id, kind, wk FROM agg) k CROSS JOIN ids
  LEFT JOIN agg a ON a.school_id = k.school_id AND a.kind = k.kind AND a.wk = k.wk AND a.o = ids.o
),
recs AS (
  SELECT school_id, CONCAT(kind, ':', CAST(wk AS STRING), ':',
         STRING_AGG(IF(n IS NULL, '', CONCAT(CAST(sm AS STRING), '/', CAST(n AS STRING))), ',' ORDER BY o)) AS r
  FROM cells GROUP BY school_id, kind, wk
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY r) AS t
FROM recs
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
