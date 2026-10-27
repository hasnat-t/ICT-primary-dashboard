-- Classroom observations of primary teachers since 2026-08-01, one record per session. Governed (rules v0.39.3):
-- coaching-query-rules.md §1 and the dc_complete / hitl_conducted cards (DC = self-recording with scores back,
-- not test_cleanup; HITL = coach visit with scores, not cancelled/abandoned/failed/test_cleanup; a visit whose
-- observer is the teacher, and test observers, out), fico-scores-rules.md §2/§2c (domain_score/domain_max from
-- analysis_data.domains; lesson-plan fidelity only where a plan was attached; /observe2 fico17 visits excluded
-- and counted). DC and HITL are never pooled; FICO v3 (from 2026-09-08) is split from earlier scores by the page.
-- Record: "tid:day:src:stage:tsk_s:tsk_m:hlp_s:hlp_m:se_s:se_m:lpf_s:lpf_m"; src D/H; HITL stage C complete
-- (debrief done), P debrief pending, A awaiting review; day = days since 2026-08-01 (PKT).
WITH {{COMMON}},
sess_all AS (
  SELECT cs.id AS session_id, t.teacher_id, t.school_id,
         IF(cs.observation_type = 'leader_observation', 'H', 'D') AS src,
         CASE WHEN cs.observation_type IS NULL THEN '-'
              WHEN cs.debrief_status = 'done' THEN 'C'
              WHEN cs.status IN ('observer_review_complete', 'completed') THEN 'P'
              ELSE 'A' END AS stage,
         cs.has_lesson_plan,
         JSON_VALUE(cs.analysis_data, '$.observe2.rubric') IS NOT NULL AS is_observe2,
         DATE_DIFF(DATE(SAFE_CAST(cs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         SAFE.PARSE_JSON(cs.analysis_data) AS j
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)            -- the teacher observed / self-recording
  LEFT JOIN `Niete_Rumi_db.users` obs ON obs.id = cs.observer_user_id           -- the coach (HITL only)
  WHERE SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
    AND cs.analysis_data IS NOT NULL
    AND JSON_QUERY(cs.analysis_data, '$.scores') IS NOT NULL
    AND ((cs.observation_type IS NULL AND cs.status != 'test_cleanup')
         OR (cs.observation_type = 'leader_observation'
             AND cs.status NOT IN ('cancelled', 'abandoned', 'failed', 'test_cleanup')))
    AND (cs.observer_user_id IS NULL OR cs.observer_user_id != cs.user_id)
    AND obs.is_test_user IS NOT TRUE
),
sess AS (SELECT * FROM sess_all WHERE NOT is_observe2),
dom AS (
  SELECT s.session_id, k AS domain,
         SAFE_CAST(JSON_VALUE(s.j.domains[k].domain_score) AS FLOAT64) AS score,
         SAFE_CAST(JSON_VALUE(s.j.domains[k].domain_max)   AS FLOAT64) AS mx
  FROM sess s, UNNEST(JSON_KEYS(s.j.domains, 1)) AS k
  WHERE (k != 'lesson_plan_fidelity' OR s.has_lesson_plan IS TRUE)
),
dom_ok AS (SELECT * FROM dom WHERE mx > 0 AND score IS NOT NULL),
piv AS (
  SELECT s.school_id, s.teacher_id, s.day, s.session_id, s.src, s.stage,
         MAX(IF(d.domain = 'teacher_subject_knowledge', d.score, NULL)) AS tsk_s, MAX(IF(d.domain = 'teacher_subject_knowledge', d.mx, NULL)) AS tsk_m,
         MAX(IF(d.domain = 'high_leverage_practices',   d.score, NULL)) AS hlp_s, MAX(IF(d.domain = 'high_leverage_practices',   d.mx, NULL)) AS hlp_m,
         MAX(IF(d.domain = 'student_engagement',        d.score, NULL)) AS se_s,  MAX(IF(d.domain = 'student_engagement',        d.mx, NULL)) AS se_m,
         MAX(IF(d.domain = 'lesson_plan_fidelity',      d.score, NULL)) AS lpf_s, MAX(IF(d.domain = 'lesson_plan_fidelity',      d.mx, NULL)) AS lpf_m
  FROM sess s LEFT JOIN dom_ok d ON d.session_id = s.session_id
  GROUP BY s.school_id, s.teacher_id, s.day, s.session_id, s.src, s.stage
),
rec AS (
  SELECT school_id, teacher_id, day, session_id,
         CONCAT(SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', src, ':', stage, ':',
                IFNULL(FORMAT('%g', tsk_s), ''), ':', IFNULL(FORMAT('%g', tsk_m), ''), ':',
                IFNULL(FORMAT('%g', hlp_s), ''), ':', IFNULL(FORMAT('%g', hlp_m), ''), ':',
                IFNULL(FORMAT('%g', se_s),  ''), ':', IFNULL(FORMAT('%g', se_m),  ''), ':',
                IFNULL(FORMAT('%g', lpf_s), ''), ':', IFNULL(FORMAT('%g', lpf_m), '')) AS r
  FROM piv
),
o2 AS (SELECT school_id, COUNT(DISTINCT session_id) AS observe2_excluded FROM sess_all WHERE is_observe2 GROUP BY school_id)
SELECT rec.school_id, COUNT(*) AS n, ANY_VALUE(COALESCE(o2.observe2_excluded, 0)) AS observe2_excluded,
       STRING_AGG(rec.r, '~' ORDER BY rec.teacher_id, rec.day, rec.session_id) AS t
FROM rec LEFT JOIN o2 USING (school_id)
GROUP BY rec.school_id
ORDER BY rec.school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
