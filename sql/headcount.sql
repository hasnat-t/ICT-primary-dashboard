-- ICT teacher headcount by level, per sector and for all ICT, as of the refresh (rules v0.41.2): teacher-headcount.md
-- 1e (role teacher, not deleted, not test, at a programme school, joined on users.school_id, Durbeen out) and
-- teacher-levels.md 1b: the four level buckets are mutually exclusive, so a teacher tagged both primary and
-- middle/high is counted once. For the Overview's "ICT teachers" strip; the rest of the dashboard is primary only.
WITH sp AS (
  SELECT school_id, LOGICAL_OR(COALESCE(is_programme_school, FALSE)) AS is_programme_school
  FROM `taleemabad_governance.school_programme` GROUP BY school_id
),
t AS (
  SELECT u.school_id, s.region AS sector,
         ARRAY(SELECT DISTINCT TRIM(UPPER(x)) FROM UNNEST(JSON_VALUE_ARRAY(u.teacher_level)) x) AS lv
  FROM `Niete_Rumi_db.users` u
  JOIN `Niete_Rumi_db.schools` s ON s.id = u.school_id
  JOIN sp ON sp.school_id = u.school_id AND sp.is_programme_school
  WHERE u.role = 'teacher' AND u.deleted_at IS NULL
    AND u.is_test_user IS NOT TRUE                    -- test accounts (data-governance.md)
    AND COALESCE(s.region, '') != 'Durbeen'
)
SELECT IF(GROUPING(sector) = 1, '__ALL__', COALESCE(sector, '(no sector)')) AS line,
       COUNT(*) AS teachers,
       COUNT(DISTINCT school_id) AS schools,
       COUNTIF('PRIMARY' IN UNNEST(lv) AND NOT ('MIDDLE' IN UNNEST(lv) OR 'HIGH' IN UNNEST(lv))) AS primary_only,
       COUNTIF(('MIDDLE' IN UNNEST(lv) OR 'HIGH' IN UNNEST(lv)) AND NOT 'PRIMARY' IN UNNEST(lv)) AS mh_only,
       COUNTIF('PRIMARY' IN UNNEST(lv) AND ('MIDDLE' IN UNNEST(lv) OR 'HIGH' IN UNNEST(lv))) AS both_levels,
       COUNTIF(ARRAY_LENGTH(lv) = 0) AS no_level
FROM t
GROUP BY ROLLUP(sector)
ORDER BY line
