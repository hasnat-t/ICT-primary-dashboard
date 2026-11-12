-- Data quality: one row per programme school, so schools with no teacher account still show. Governed (rules v0.41.7):
-- teacher-headcount.md 1e (role teacher, not deleted, not test, at a programme school via users.school_id, Durbeen out),
-- teacher-levels.md 1b (levels parsed from the JSON array; none = "no level"), coaches-rules.md 3 (a coach is role
-- 'coach' with the school in leader_schools, test rows out; coaches having no users.school_id is by design and is NOT
-- flagged). Per school: all-level teacher count, assigned coach names, and the flagged teachers packed "tid|name|flags"
-- joined by "~", flags L = no level recorded, N = blank name, D = the same name twice or more at the school (a possible
-- duplicate account). Paged by the server.
WITH sp AS (
  SELECT school_id, LOGICAL_OR(COALESCE(is_programme_school, FALSE)) AS is_programme_school
  FROM `taleemabad_governance.school_programme` GROUP BY school_id
),
sch AS (
  SELECT s.id AS school_id, TRIM(CAST(s.emis AS STRING)) AS emis, s.region AS sector, s.name AS school_name
  FROM `Niete_Rumi_db.schools` s
  JOIN sp ON sp.school_id = s.id AND sp.is_programme_school
  WHERE COALESCE(s.region, '') != 'Durbeen'
),
t AS (
  SELECT u.id AS teacher_id, u.school_id, COALESCE(TRIM(u.name), '') AS name,
         ARRAY_LENGTH(ARRAY(SELECT DISTINCT TRIM(UPPER(x)) FROM UNNEST(JSON_VALUE_ARRAY(u.teacher_level)) x WHERE TRIM(x) != '')) AS nlv
  FROM `Niete_Rumi_db.users` u
  JOIN sch ON sch.school_id = u.school_id
  WHERE u.role = 'teacher' AND u.deleted_at IS NULL
    AND u.is_test_user IS NOT TRUE                    -- test accounts (data-governance.md)
),
tf AS (
  SELECT *, CONCAT(IF(COALESCE(nlv, 0) = 0, 'L', ''), IF(name = '', 'N', ''),
                   IF(name != '' AND COUNT(*) OVER (PARTITION BY school_id, LOWER(name)) > 1, 'D', '')) AS flags
  FROM t
),
co AS (
  -- "id8=name" so config/coach-overrides.json can rename coaches and drop staff accounts that hold the coach role (dq.js)
  SELECT ls.school_id, STRING_AGG(DISTINCT CONCAT(SUBSTR(u.id, 1, 8), '=', REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(TRIM(u.name), ''), '(no name)'), '|', ' '), '~', ' '), ',', ' ')), ', ') AS coaches,
         COUNT(DISTINCT u.id) AS ncoach
  FROM `Niete_Rumi_db.leader_schools` ls
  JOIN `Niete_Rumi_db.users` u ON u.id = ls.leader_user_id
  WHERE u.role = 'coach' AND u.is_test_user IS NOT TRUE
    AND COALESCE(ls.name_match_quality, '') != 'test' AND ls.school_id IS NOT NULL
  GROUP BY 1
)
SELECT sch.school_id, ANY_VALUE(sch.emis) AS emis, ANY_VALUE(sch.sector) AS sector,
       REPLACE(REPLACE(ANY_VALUE(sch.school_name), '|', ' '), '~', ' ') AS school_name,
       COUNT(tf.teacher_id) AS teachers,
       ANY_VALUE(COALESCE(co.ncoach, 0)) AS ncoach, ANY_VALUE(COALESCE(co.coaches, '')) AS coaches,
       COUNTIF(tf.flags != '') AS n,
       STRING_AGG(IF(tf.flags != '', CONCAT(SUBSTR(tf.teacher_id, 1, 8), '|', REPLACE(REPLACE(tf.name, '|', ' '), '~', ' '), '|', tf.flags), NULL),
                  '~' ORDER BY tf.name) AS t
FROM sch
LEFT JOIN tf ON tf.school_id = sch.school_id
LEFT JOIN co ON co.school_id = sch.school_id
GROUP BY sch.school_id
ORDER BY sch.school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
