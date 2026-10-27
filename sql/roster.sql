-- Primary teachers per ICT programme school: teacher-headcount.md 1e (role teacher, not deleted, not test,
-- at a programme school, joined on users.school_id, Durbeen out) limited to teachers whose teacher_level
-- includes PRIMARY (teacher-levels.md 1b). Teachers with no level recorded are left out (Hasnat, 2026-10-27).
-- One row per school; teachers packed "tid|name|levels" joined by "~". Paged by the server.
WITH sp AS (
  SELECT school_id, LOGICAL_OR(COALESCE(is_programme_school, FALSE)) AS is_programme_school
  FROM `taleemabad_governance.school_programme` GROUP BY school_id
),
ict_teachers AS (
  SELECT u.id AS teacher_id, u.name, u.school_id, s.region AS sector, s.name AS school_name, TRIM(CAST(s.emis AS STRING)) AS emis,
         ARRAY(SELECT DISTINCT TRIM(UPPER(x)) FROM UNNEST(JSON_VALUE_ARRAY(u.teacher_level)) x) AS lv
  FROM `Niete_Rumi_db.users` u
  JOIN `Niete_Rumi_db.schools` s ON s.id = u.school_id
  JOIN sp ON sp.school_id = u.school_id AND sp.is_programme_school
  WHERE u.role = 'teacher' AND u.deleted_at IS NULL
    AND u.is_test_user IS NOT TRUE
    AND COALESCE(s.region, '') != 'Durbeen'
),
prim AS (SELECT * FROM ict_teachers WHERE 'PRIMARY' IN UNNEST(lv))
SELECT school_id, ANY_VALUE(emis) AS emis, ANY_VALUE(sector) AS sector,
       REPLACE(REPLACE(ANY_VALUE(school_name), '|', ' '), '~', ' ') AS school_name,
       COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(teacher_id, 1, 8), '|',
                         REPLACE(REPLACE(COALESCE(name, ''), '|', ' '), '~', ' '), '|',
                         IF('PRIMARY' IN UNNEST(lv), 'P', ''), IF('MIDDLE' IN UNNEST(lv), 'M', ''), IF('HIGH' IN UNNEST(lv), 'H', '')),
                  '~' ORDER BY name) AS t
FROM prim
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
