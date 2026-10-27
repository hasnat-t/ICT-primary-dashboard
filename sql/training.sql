-- NIETE primary training per primary teacher, all time. Governed (rules v0.39.3): training-query-rules.md §1-§7 and
-- the training_funnel / training_module_completions / training_certified cards. On the programme = an active
-- niete_primary assignment; niete_primary covers the NIETE (TALEEMABAD) vendor's whole catalogue, levels 1-4
-- (training_program_scopes, level_ids NULL). A teacher_training_progress row IS a finished module (distinct
-- user-module pairs); a certificate is one per teacher per level (NIETE levels need the grand quiz).
-- Record per teacher with any of the three: "tid:assigned:m1:m2:m3:m4:certs" - mN = modules finished at the
-- level with order_index N-1, certs = the levels certified, e.g. "12".
WITH {{COMMON}},
lvl AS (
  SELECT l.id AS level_id, l.order_index + 1 AS n
  FROM `Niete_Rumi_db.training_levels` l JOIN `Niete_Rumi_db.training_vendors` v ON v.id = l.vendor_id
  WHERE v.key = 'TALEEMABAD'
),
assigned AS (
  SELECT DISTINCT a.user_id
  FROM `Niete_Rumi_db.teacher_training_assignments` a
  JOIN `Niete_Rumi_db.training_programs` tp ON tp.id = a.program_id
  WHERE a.is_active AND tp.key = 'niete_primary'
),
done AS (
  SELECT pr.user_id, lvl.n, COUNT(DISTINCT pr.module_id) AS modules
  FROM `Niete_Rumi_db.teacher_training_progress` pr
  JOIN `Niete_Rumi_db.training_modules` m  ON m.id = pr.module_id
  JOIN `Niete_Rumi_db.training_courses` co ON co.id = m.course_id
  JOIN lvl ON lvl.level_id = co.level_id
  GROUP BY 1, 2
),
cert AS (
  SELECT c.user_id, STRING_AGG(DISTINCT CAST(lvl.n AS STRING), '' ORDER BY CAST(lvl.n AS STRING)) AS levels
  FROM `Niete_Rumi_db.training_certificates` c JOIN lvl ON lvl.level_id = c.level_id
  GROUP BY 1
),
per_t AS (
  SELECT t.school_id, t.teacher_id,
         a.user_id IS NOT NULL AS on_programme,
         SUM(IF(d.n = 1, d.modules, 0)) AS m1, SUM(IF(d.n = 2, d.modules, 0)) AS m2,
         SUM(IF(d.n = 3, d.modules, 0)) AS m3, SUM(IF(d.n = 4, d.modules, 0)) AS m4,
         ANY_VALUE(c.levels) AS certs
  FROM prim t
  LEFT JOIN assigned a ON a.user_id = t.teacher_id
  LEFT JOIN done d ON d.user_id = t.teacher_id
  LEFT JOIN cert c ON c.user_id = t.teacher_id
  GROUP BY 1, 2, 3
)
SELECT school_id, COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(teacher_id, 1, 8), ':', IF(on_programme, '1', '0'), ':', CAST(m1 AS STRING), ':', CAST(m2 AS STRING), ':',
                         CAST(m3 AS STRING), ':', CAST(m4 AS STRING), ':', COALESCE(certs, '')), '~' ORDER BY teacher_id) AS t
FROM per_t
WHERE on_programme OR m1 + m2 + m3 + m4 > 0 OR certs IS NOT NULL
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
