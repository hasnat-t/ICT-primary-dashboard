-- Observers of HITL observations of primary teachers since 2026-08-01, for the per-coach HITL analytics. Governed (rules
-- v0.39.3): coaching-query-rules.md §2b - observer_user_id is the coach (user_id is the teacher); the name is users.name;
-- names can be blank or collide, so the page keys on the id and shows the role beside the name. Coach names are served
-- (owner, 2026-09-08) and shown on this dashboard by Hasnat's decision (2026-10-28). One row; records "id8|name|role".
WITH {{COMMON}},
o AS (
  SELECT DISTINCT cs.observer_user_id AS id
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)
  WHERE cs.observation_type = 'leader_observation'
    AND cs.observer_user_id IS NOT NULL AND cs.observer_user_id != cs.user_id
    AND SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
)
SELECT 'coaches' AS school_id, COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(u.id, 1, 8), '|', REPLACE(REPLACE(COALESCE(TRIM(u.name), ''), '|', ' '), '~', ' '), '|', COALESCE(u.role, '')),
                  '~' ORDER BY u.id) AS t
FROM o JOIN `Niete_Rumi_db.users` u ON u.id = o.id
WHERE u.is_test_user IS NOT TRUE
