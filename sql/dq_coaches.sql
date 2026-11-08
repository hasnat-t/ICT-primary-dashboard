-- Data quality: coach accounts with no school assigned in leader_schools (coaches-rules.md 3: such an account is not a
-- caseload; reported as an open question, not an error). Test accounts and Gilgit-Baltistan accounts out. One row;
-- records "id8|name" joined by "~".
WITH assigned AS (
  SELECT DISTINCT ls.leader_user_id AS id
  FROM `Niete_Rumi_db.leader_schools` ls
  WHERE COALESCE(ls.name_match_quality, '') != 'test' AND ls.school_id IS NOT NULL
)
SELECT 'coaches' AS school_id, COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(u.id, 1, 8), '|', REPLACE(REPLACE(COALESCE(TRIM(u.name), ''), '|', ' '), '~', ' ')), '~' ORDER BY u.name) AS t
FROM `Niete_Rumi_db.users` u
LEFT JOIN assigned a ON a.id = u.id
WHERE u.role = 'coach' AND u.is_test_user IS NOT TRUE AND u.deleted_at IS NULL
  AND COALESCE(u.source, '') != 'main_rumi_gb'
  AND a.id IS NULL
