-- The grades each primary teacher teaches, from the class roster. Governed (rules v0.39.3): coaching-query-rules.md §1g -
-- an observation has no grade of its own; "by grade" goes through each grade of the observed teacher's active classes
-- (class_teachers.is_active AND classes.is_active), so a teacher on two grades counts in each and the grade lines never add up.
-- Teachers with no active class are absent here and shown as "no class on the roster" by the page.
-- Record: "tid|grades", grades = comma list of 1..12 or ey (early years).
WITH {{COMMON}},
g AS (
  SELECT DISTINCT ct.teacher_user_id, c.grade_code
  FROM `Niete_Rumi_db.class_teachers` ct
  JOIN `Niete_Rumi_db.classes` c ON c.id = ct.class_id
  WHERE ct.is_active AND c.is_active AND c.grade_code IS NOT NULL
),
tg AS (
  SELECT p.school_id, p.teacher_id,
         STRING_AGG(DISTINCT REGEXP_REPLACE(REPLACE(g.grade_code, 'early_years', 'ey'), r'^grade_', ''), ',') AS grades
  FROM prim p
  JOIN g ON g.teacher_user_id = p.teacher_id
  GROUP BY p.school_id, p.teacher_id
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(CONCAT(SUBSTR(teacher_id, 1, 8), '|', grades), '~' ORDER BY teacher_id) AS t
FROM tg
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
