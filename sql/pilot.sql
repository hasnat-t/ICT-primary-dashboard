-- FICO /observe2 pilot (study design of 7 Oct 2026): one record per field form in observation_field_forms, for the pilot
-- analysis tab. Ungoverned - the table is not yet in the data rules - so every figure built on it is provisional.
-- Read from the form itself (verified 2026-10-29): evidence_review.added = the coach's provisional levels, sealed before
-- the DC evidence check (F1-F4 are only rated at the final step); rumi_levels = the DC's own levels, never shown to the
-- coach (it rates only what it can hear); final_levels = the coach's final levels; answers.priority / evidence_review.
-- priority_final = provisional / final coaching priority; evidence_review.heard_<kind>_N = the coach's yes/no on each DC
-- evidence item; added_hole = evidence the DC found for a gap in the coach's record; fid_r_N = lesson-plan step verdicts.
-- Test observers are left out. Record (":"-separated): form8, coach8, teacher8, school_id, sector, day, state (o open,
-- s sealed, c final), provisional levels, DC levels, final levels (17 characters each, C1-C8 D1-D5 F1-F4: 1-4, n NA,
-- i couldn't tell, - not rated), provisional priority, final priority, evidence marks "ask yes,ask no,explain yes,
-- explain no,wrong yes,wrong no,work yes,work no", gaps filled, plan steps "executed,partial,not done,substituted,
-- not adjudicable", linked to a coaching session (1/0), minutes "open->sealed,sealed->final".
WITH f AS (
  SELECT ff.*, SAFE.PARSE_JSON(ff.evidence_review) AS r, SAFE.PARSE_JSON(ff.rumi_levels) AS l,
         SAFE.PARSE_JSON(ff.final_levels) AS fl, SAFE.PARSE_JSON(ff.answers) AS a, u.school_id, s.region
  FROM `Niete_Rumi_db.observation_field_forms` ff
  LEFT JOIN `Niete_Rumi_db.users` obs ON obs.id = ff.observer_user_id
  LEFT JOIN `Niete_Rumi_db.users` u ON u.id = ff.teacher_user_id
  LEFT JOIN `Niete_Rumi_db.schools` s ON s.id = u.school_id
  WHERE obs.is_test_user IS NOT TRUE AND COALESCE(u.is_test_user, FALSE) IS NOT TRUE
),
lv AS (SELECT * FROM UNNEST(['C1','C2','C3','C4','C5','C6','C7','C8','D1','D2','D3','D4','D5','F1','F2','F3','F4']) k WITH OFFSET o),
rec AS (
  SELECT CONCAT(
    SUBSTR(f.id, 1, 8), ':', SUBSTR(IFNULL(f.observer_user_id, ''), 1, 8), ':', SUBSTR(IFNULL(f.teacher_user_id, ''), 1, 8), ':',
    IFNULL(f.school_id, ''), ':', REGEXP_REPLACE(IFNULL(f.region, ''), r'[:~,]', ' '), ':',
    IFNULL(CAST(DATE_DIFF(DATE(SAFE_CAST(COALESCE(f.opened_at, f.created_at) AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS STRING), ''), ':',
    IF(f.final_levels IS NOT NULL, 'c', IF(f.sealed_at IS NOT NULL, 's', 'o')), ':',
    (SELECT STRING_AGG(CASE JSON_VALUE(f.r.added[k]) WHEN '1' THEN '1' WHEN '2' THEN '2' WHEN '3' THEN '3' WHEN '4' THEN '4'
            WHEN 'NA' THEN 'n' WHEN 'IE' THEN 'i' ELSE '-' END, '' ORDER BY o) FROM lv), ':',
    (SELECT STRING_AGG(CASE CAST(JSON_VALUE(f.l[k].level) AS STRING) WHEN '1' THEN '1' WHEN '2' THEN '2' WHEN '3' THEN '3' WHEN '4' THEN '4'
            ELSE '-' END, '' ORDER BY o) FROM lv), ':',
    (SELECT STRING_AGG(CASE JSON_VALUE(f.fl[k]) WHEN '1' THEN '1' WHEN '2' THEN '2' WHEN '3' THEN '3' WHEN '4' THEN '4'
            WHEN 'NA' THEN 'n' WHEN 'IE' THEN 'i' ELSE '-' END, '' ORDER BY o) FROM lv), ':',
    REGEXP_REPLACE(IFNULL(JSON_VALUE(f.a.priority), ''), r'[:~,]', ''), ':',
    REGEXP_REPLACE(IFNULL(JSON_VALUE(f.r.priority_final), ''), r'[:~,]', ''), ':',
    (SELECT ARRAY_TO_STRING(ARRAY(
       SELECT CAST(COUNTIF(REGEXP_CONTAINS(key, CONCAT('^heard_', kind, '_[0-9]+$')) AND JSON_VALUE(f.r[key]) = ans) AS STRING)
       FROM UNNEST(['ask', 'explain', 'wrong', 'work']) kind WITH OFFSET ko, UNNEST(['yes', 'no']) ans WITH OFFSET ao
       LEFT JOIN UNNEST(JSON_KEYS(f.r, 1)) key ON TRUE
       GROUP BY ko, ao ORDER BY ko, ao), ',')), ':',
    CAST(IFNULL(ARRAY_LENGTH(JSON_KEYS(f.r.added_hole, 1)), 0) AS STRING), ':',
    (SELECT ARRAY_TO_STRING(ARRAY(
       SELECT CAST(COUNTIF(REGEXP_CONTAINS(key, r'^fid_r_[0-9]+$') AND JSON_VALUE(f.r[key]) IN UNNEST(vs)) AS STRING)
       FROM UNNEST([STRUCT(0 AS o, ['executed'] AS vs), STRUCT(1, ['partial']), STRUCT(2, ['not_done']),
                    STRUCT(3, ['substituted_equivalent', 'substituted_better']), STRUCT(4, ['not_adjudicable'])]) v
       LEFT JOIN UNNEST(JSON_KEYS(f.r, 1)) key ON TRUE
       GROUP BY v.o ORDER BY v.o), ',')), ':',
    IF(f.coaching_session_id IS NOT NULL, '1', '0'), ':',
    IFNULL(CAST(TIMESTAMP_DIFF(SAFE_CAST(f.sealed_at AS TIMESTAMP), SAFE_CAST(f.opened_at AS TIMESTAMP), MINUTE) AS STRING), ''), ',',
    IFNULL(CAST(TIMESTAMP_DIFF(SAFE_CAST(f.checked_at AS TIMESTAMP), SAFE_CAST(f.sealed_at AS TIMESTAMP), MINUTE) AS STRING), '')
  ) AS r, f.opened_at, f.id
  FROM f
)
SELECT 'pilot' AS school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY opened_at, id) AS t FROM rec
