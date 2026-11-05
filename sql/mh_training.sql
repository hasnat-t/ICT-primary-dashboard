-- Middle/high teachers and their middle/high training, all time. Its own roster, because the main roster holds primary
-- teachers only: teacher-headcount.md 1e (role teacher, not deleted, not test, at a programme school, joined on
-- users.school_id, Durbeen out) with teacher_level including MIDDLE or HIGH in any combination, primary included
-- (teacher-levels.md 1b). Training (rules v0.41.2, training-query-rules.md §1-§5, §4b): the middle/high programme is
-- niete_middle_high (active assignment) over NIETE levels 3-4 (order_index 2-3), Oxbridge and Beaconhouse; I-SAPS is
-- reported on its own. A teacher_training_progress row IS a finished module; one certificate per teacher per level.
-- One row per school; teachers packed "tid|name|levels|on_programme|modules|certs" joined by "~", where levels is P/M/H,
-- modules is "level_id:count" pairs joined by "," and certs the certified level ids joined by ",". Paged by the server.
WITH sp AS (
  SELECT school_id, LOGICAL_OR(COALESCE(is_programme_school, FALSE)) AS is_programme_school
  FROM `taleemabad_governance.school_programme` GROUP BY school_id
),
t AS (
  SELECT u.id AS teacher_id, u.name, u.school_id, s.region AS sector, s.name AS school_name, TRIM(CAST(s.emis AS STRING)) AS emis,
         ARRAY(SELECT DISTINCT TRIM(UPPER(x)) FROM UNNEST(JSON_VALUE_ARRAY(u.teacher_level)) x) AS lv
  FROM `Niete_Rumi_db.users` u
  JOIN `Niete_Rumi_db.schools` s ON s.id = u.school_id
  JOIN sp ON sp.school_id = u.school_id AND sp.is_programme_school
  WHERE u.role = 'teacher' AND u.deleted_at IS NULL
    AND u.is_test_user IS NOT TRUE                    -- test accounts (data-governance.md)
    AND COALESCE(s.region, '') != 'Durbeen'
),
mh AS (
  SELECT teacher_id, name, school_id, sector, school_name, emis,
         CONCAT(IF('PRIMARY' IN UNNEST(lv), 'P', ''), IF('MIDDLE' IN UNNEST(lv), 'M', ''), IF('HIGH' IN UNNEST(lv), 'H', '')) AS lvs
  FROM t WHERE 'MIDDLE' IN UNNEST(lv) OR 'HIGH' IN UNNEST(lv)
),
lvl AS (                                              -- by vendor, not fixed ids (level ids are not contiguous, §7b)
  SELECT l.id AS level_id
  FROM `Niete_Rumi_db.training_levels` l JOIN `Niete_Rumi_db.training_vendors` v ON v.id = l.vendor_id
  WHERE (v.key = 'TALEEMABAD' AND l.order_index IN (2, 3)) OR v.key IN ('OXBRIDGE', 'BEACONHOUSE', 'ISAPS')
),
prog AS (                                             -- is_active picks the current programme (§3)
  SELECT a.user_id, LOGICAL_OR(tp.key = 'niete_middle_high') AS on_mh
  FROM `Niete_Rumi_db.teacher_training_assignments` a
  JOIN `Niete_Rumi_db.training_programs` tp ON tp.id = a.program_id
  WHERE a.is_active
  GROUP BY 1
),
done AS (                                             -- finished modules per level: distinct (user, module)
  SELECT pr.user_id, co.level_id, COUNT(DISTINCT pr.module_id) AS modules
  FROM `Niete_Rumi_db.teacher_training_progress` pr
  JOIN `Niete_Rumi_db.training_modules` m  ON m.id = pr.module_id
  JOIN `Niete_Rumi_db.training_courses` co ON co.id = m.course_id
  JOIN lvl ON lvl.level_id = co.level_id
  GROUP BY 1, 2
),
mods AS (
  SELECT user_id, STRING_AGG(CONCAT(CAST(level_id AS STRING), ':', CAST(modules AS STRING)), ',' ORDER BY level_id) AS mods
  FROM done GROUP BY 1
),
cert AS (
  SELECT c.user_id, STRING_AGG(DISTINCT CAST(c.level_id AS STRING), ',') AS certs
  FROM `Niete_Rumi_db.training_certificates` c JOIN lvl ON lvl.level_id = c.level_id
  GROUP BY 1
)
SELECT mh.school_id, ANY_VALUE(mh.emis) AS emis, ANY_VALUE(mh.sector) AS sector,
       REPLACE(REPLACE(ANY_VALUE(mh.school_name), '|', ' '), '~', ' ') AS school_name,
       COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(mh.teacher_id, 1, 8), '|', REPLACE(REPLACE(COALESCE(mh.name, ''), '|', ' '), '~', ' '), '|', mh.lvs, '|',
                         IF(COALESCE(prog.on_mh, FALSE), '1', '0'), '|', COALESCE(mods.mods, ''), '|', COALESCE(cert.certs, '')),
                  '~' ORDER BY mh.name) AS t
FROM mh
LEFT JOIN prog ON prog.user_id = mh.teacher_id
LEFT JOIN mods ON mods.user_id = mh.teacher_id
LEFT JOIN cert ON cert.user_id = mh.teacher_id
GROUP BY mh.school_id
ORDER BY mh.school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
