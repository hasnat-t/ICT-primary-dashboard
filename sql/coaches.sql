-- Observers of HITL observations of programme-school teachers (primary, middle and high; 2026-11-17) since 2026-08-01, for the per-coach HITL analytics. Governed (rules
-- v0.39.3): coaching-query-rules.md §2b - observer_user_id is the coach (user_id is the teacher); the name is users.name;
-- names can be blank or collide, so the page keys on the id and shows the role beside the name. Coach names are served
-- (owner, 2026-09-08) and shown on this dashboard by Hasnat's decision (2026-10-28). One row; records "id8|name|role|emis|school" (emis and school name only for principals: their own school, users.school_id).
WITH {{COMMON}},
tall AS (                                             -- every programme-school teacher, any level (for middle/high visits)
  SELECT u.id AS teacher_id
  FROM `Niete_Rumi_db.users` u
  JOIN `Niete_Rumi_db.schools` s ON s.id = u.school_id
  JOIN sp ON sp.school_id = u.school_id AND sp.is_programme_school
  WHERE u.role = 'teacher' AND u.deleted_at IS NULL AND u.is_test_user IS NOT TRUE
    AND COALESCE(s.region, '') != 'Durbeen'
),
o AS (
  SELECT DISTINCT cs.observer_user_id AS id
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN tall t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)
  WHERE cs.observation_type = 'leader_observation'
    AND cs.observer_user_id IS NOT NULL AND cs.observer_user_id != cs.user_id
    AND SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
)
SELECT 'coaches' AS school_id, COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(u.id, 1, 8), '|', REPLACE(REPLACE(COALESCE(TRIM(u.name), ''), '|', ' '), '~', ' '), '|', COALESCE(u.role, ''), '|',
                         IF(u.role = 'principal', COALESCE(TRIM(CAST(sc.emis AS STRING)), ''), ''), '|',
                         IF(u.role = 'principal', REPLACE(REPLACE(COALESCE(TRIM(sc.name), ''), '|', ' '), '~', ' '), '')),
                  '~' ORDER BY u.id) AS t
FROM o JOIN `Niete_Rumi_db.users` u ON u.id = o.id
LEFT JOIN `Niete_Rumi_db.schools` sc ON sc.id = u.school_id
WHERE u.is_test_user IS NOT TRUE
