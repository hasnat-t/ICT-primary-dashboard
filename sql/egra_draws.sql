-- The learning assessment's random sample (child_test_draws) per programme school, for the sampling progress line.
-- Governed (rules v0.39.4): learning-assessment-rules.md §1/§5 - draws answer sampling questions (drawn, absent, refused),
-- not "tested"; programme schools only. Counts only; outcome_note is never selected.
-- One row per school; t = "cycle|status|count" records joined by "~".
WITH sp AS (
  SELECT school_id, LOGICAL_OR(COALESCE(is_programme_school, FALSE)) AS is_programme_school
  FROM `taleemabad_governance.school_programme` GROUP BY school_id
),
c AS (
  SELECT d.school_id, REGEXP_REPLACE(IFNULL(d.cycle_id, ''), r'[|~]', ' ') AS cycle, REGEXP_REPLACE(IFNULL(d.status, ''), r'[|~]', ' ') AS status, COUNT(*) AS k
  FROM `Niete_Rumi_db.child_test_draws` d
  JOIN sp ON sp.school_id = d.school_id AND sp.is_programme_school
  GROUP BY 1, 2, 3
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(CONCAT(cycle, '|', status, '|', CAST(k AS STRING)), '~' ORDER BY cycle, status) AS t
FROM c
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
