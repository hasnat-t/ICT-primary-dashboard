-- HITL coach visits that the primary FICO dataset (observations.sql) does not score, since 2026-08-01, one record per visit:
--   * every visit of a MIDDLE/HIGH-only teacher (teacher_level without PRIMARY), any form;
--   * every visit on a form other than the FICO (v3) /observe form: FICO v6 (`fico17_v6`, from 2026-11-13) and the FDE
--     grade 6-12 forms (`obs612-enur-v1` English & Urdu, `obs612-msci-v1` Maths & Science, `obs612-gen-v1` General).
-- Population: the hitl_conducted card (coaching-query-rules.md §1/§2b, rules v0.42.1) - leader_observation with $.scores,
-- not cancelled/abandoned/failed/test_cleanup, observer is not the teacher and not a test user - over every programme-
-- school teacher (teacher-headcount.md 1e, any teacher_level; teacher-levels.md 1b: P = level includes PRIMARY, M = middle
-- or high without primary, U = no level). /observe2 (fico17) visits stay out (their own tab). Principals count as observers
-- (coaches-rules.md §3b).
-- PROVISIONAL (owner request 2026-11-17): the rules know FICO v6 is coming (fico-v6-rules.md §1-§2: never pool or compare
-- with v3, never map v6 indicators to v3 ones) but do not yet say how v6 or the FDE forms are stored; the paths below
-- were read from the data on 2026-11-17:
--   v6: AI levels  levels.<ind>.result (1-4; the 11 indicators the AI scores), AI marks scores.overall_marks/_max_marks (44);
--       coach's final levels fico17_v6_review.levels.<ind> (17 indicators), final marks fico17_v6_review.totals
--       {marks,max,percentage} (68); fico17_v6_review.change_reasons = indicators the coach changed. Sections (AI):
--       domains.v6_teacher /20, v6_subject /16, v6_children /8.
--   FDE forms: obs612.result - enur {pct, band.label, sections[{key,score,max}]}, gen {yes, of, sections[{key,yes,of}]},
--       msci {indicators[{key,level}]} on a 0-3 scale (obs612.answers), obs612.grade, obs612.subject.
-- Record "tid8|grp|name|lv|day|obs8|orole|stage|form|pct|aipct|band|grade|subj|ai17|fin17|secs|edit":
--   grp P/M/U; name and lv (P/M/H letters) only for M/U teachers (P teachers come from the main roster);
--   orole c coach, p principal, o other; stage C debriefed, P debrief pending, A awaiting review;
--   form f FICO v3, 6 FICO v6, e/m/g FDE English & Urdu / Maths & Science / General, h hots, x other;
--   pct = the form's overall % (v6: coach's final); aipct = v6 AI-only %; band = FDE English & Urdu band;
--   grade = FDE form grade; subj = u/m/e/i/s/c/g/o or ''; ai17 / fin17 = 17 characters C1-C8 D1-D5 F1-F4, each 1-4,
--   n (not applicable), i (couldn't tell) or - (none); secs = "key=score/max" joined by ","; edit = u/n/r (FICO v3 form edits,
--   as observations.sql) or, for v6, r coach changed a level / u reviewed unchanged / a not reviewed yet.
WITH {{COMMON}},
tall AS (
  SELECT u.id AS teacher_id, u.school_id, u.name,
         ARRAY(SELECT DISTINCT TRIM(UPPER(x)) FROM UNNEST(JSON_VALUE_ARRAY(u.teacher_level)) x) AS lv
  FROM `Niete_Rumi_db.users` u
  JOIN `Niete_Rumi_db.schools` s ON s.id = u.school_id
  JOIN sp ON sp.school_id = u.school_id AND sp.is_programme_school
  WHERE u.role = 'teacher' AND u.deleted_at IS NULL AND u.is_test_user IS NOT TRUE
    AND COALESCE(s.region, '') != 'Durbeen'
),
v AS (
  SELECT t.school_id, t.teacher_id, cs.id,
         CASE WHEN 'PRIMARY' IN UNNEST(t.lv) THEN 'P' WHEN 'MIDDLE' IN UNNEST(t.lv) OR 'HIGH' IN UNNEST(t.lv) THEN 'M' ELSE 'U' END AS grp,
         t.name,
         CONCAT(IF('PRIMARY' IN UNNEST(t.lv), 'P', ''), IF('MIDDLE' IN UNNEST(t.lv), 'M', ''), IF('HIGH' IN UNNEST(t.lv), 'H', '')) AS lvs,
         DATE_DIFF(DATE(SAFE_CAST(cs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         SUBSTR(cs.observer_user_id, 1, 8) AS obs8,
         CASE obs.role WHEN 'coach' THEN 'c' WHEN 'principal' THEN 'p' ELSE 'o' END AS orole,
         CASE WHEN cs.debrief_status = 'done' THEN 'C'
              WHEN cs.status IN ('observer_review_complete', 'completed') THEN 'P' ELSE 'A' END AS stage,
         COALESCE(JSON_VALUE(cs.analysis_data, '$.framework'), '') AS fw,
         SAFE.PARSE_JSON(cs.analysis_data) AS j
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN tall t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)
  LEFT JOIN `Niete_Rumi_db.users` obs ON obs.id = cs.observer_user_id
  WHERE cs.observation_type = 'leader_observation'
    AND SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
    AND cs.analysis_data IS NOT NULL
    AND JSON_QUERY(cs.analysis_data, '$.scores') IS NOT NULL
    AND cs.status NOT IN ('cancelled', 'abandoned', 'failed', 'test_cleanup')
    AND cs.observer_user_id IS NOT NULL AND cs.observer_user_id != cs.user_id
    AND obs.is_test_user IS NOT TRUE
    AND JSON_VALUE(cs.analysis_data, '$.observe2.rubric') IS NULL
),
w AS (
  SELECT *,
         CASE fw WHEN 'fico' THEN 'f' WHEN 'fico17_v6' THEN '6' WHEN 'obs612-enur-v1' THEN 'e' WHEN 'obs612-msci-v1' THEN 'm'
                 WHEN 'obs612-gen-v1' THEN 'g' WHEN 'hots' THEN 'h' ELSE 'x' END AS form,
         LOWER(TRIM(COALESCE(JSON_VALUE(j.obs612.subject), JSON_VALUE(j.subject), ''))) AS subj_raw
  FROM v
  WHERE grp != 'P' OR fw != 'fico'
),
rec AS (
  SELECT school_id, teacher_id, day, id,
    CONCAT(SUBSTR(teacher_id, 1, 8), '|', grp, '|',
      IF(grp = 'P', '', REPLACE(REPLACE(COALESCE(TRIM(name), ''), '|', ' '), '~', ' ')), '|', IF(grp = 'P', '', lvs), '|',
      CAST(day AS STRING), '|', obs8, '|', orole, '|', stage, '|', form, '|',
      IFNULL(FORMAT('%g', ROUND(CASE form
        WHEN 'f' THEN SAFE_CAST(JSON_VALUE(j.scores.overall_percentage) AS FLOAT64)
        WHEN '6' THEN SAFE_CAST(JSON_VALUE(j.fico17_v6_review.totals.percentage) AS FLOAT64)
        WHEN 'e' THEN SAFE_CAST(JSON_VALUE(j.obs612.result.pct) AS FLOAT64)
        WHEN 'g' THEN SAFE_DIVIDE(100 * SAFE_CAST(JSON_VALUE(j.obs612.result.yes) AS FLOAT64), SAFE_CAST(JSON_VALUE(j.obs612.result.of) AS FLOAT64))
        WHEN 'm' THEN (SELECT SAFE_DIVIDE(100 * SUM(SAFE_CAST(JSON_VALUE(x.level) AS FLOAT64)), 3 * COUNT(JSON_VALUE(x.level)))
                       FROM UNNEST(JSON_QUERY_ARRAY(j.obs612.result.indicators)) x)
        ELSE SAFE_CAST(JSON_VALUE(j.scores.overall_percentage) AS FLOAT64) END, 1)), ''), '|',
      IF(form = '6', IFNULL(FORMAT('%g', ROUND(SAFE_CAST(JSON_VALUE(j.scores.overall_percentage) AS FLOAT64), 1)), ''), ''), '|',
      IF(form = 'e', REGEXP_REPLACE(IFNULL(JSON_VALUE(j.obs612.result.band.label), ''), r'[|~,:=]', ''), ''), '|',
      IFNULL(REGEXP_EXTRACT(JSON_VALUE(j.obs612.grade), r'^\d{1,2}$'), ''), '|',
      CASE WHEN subj_raw IN ('', 'unable to determine') THEN ''
           WHEN REGEXP_CONTAINS(subj_raw, r'^(math|maths|mathematics|ریاضی)$') THEN 'm'
           WHEN REGEXP_CONTAINS(subj_raw, r'^urdu|اردو') THEN 'u'
           WHEN REGEXP_CONTAINS(subj_raw, r'^english') THEN 'e'
           WHEN REGEXP_CONTAINS(subj_raw, r'islam|quran|اسلامیات') THEN 'i'
           WHEN REGEXP_CONTAINS(subj_raw, r'general knowledge|general studies|waaqfiyat|واقفیت') THEN 'g'
           WHEN REGEXP_CONTAINS(subj_raw, r'science|biology|chemistry|physics|سائنس') THEN 's'
           WHEN REGEXP_CONTAINS(subj_raw, r'social|history|geography|civics|pakistan studies|معاشرتی|مطالعہ|سوشل') THEN 'c'
           ELSE 'o' END, '|',
      IF(form = '6', (SELECT STRING_AGG(CASE UPPER(COALESCE(JSON_VALUE(j.levels[k].result), JSON_VALUE(j.levels[k].level), ''))
                                          WHEN '1' THEN '1' WHEN '2' THEN '2' WHEN '3' THEN '3' WHEN '4' THEN '4'
                                          WHEN 'NA' THEN 'n' WHEN 'N/A' THEN 'n' WHEN 'IE' THEN 'i' ELSE '-' END, '' ORDER BY o)
                      FROM UNNEST(['C1','C2','C3','C4','C5','C6','C7','C8','D1','D2','D3','D4','D5','F1','F2','F3','F4']) k WITH OFFSET o), ''), '|',
      IF(form = '6', (SELECT STRING_AGG(CASE UPPER(COALESCE(JSON_VALUE(j.fico17_v6_review.levels[k].result), JSON_VALUE(j.fico17_v6_review.levels[k].level),
                                                            JSON_VALUE(j.fico17_v6_review.levels[k]), ''))
                                          WHEN '1' THEN '1' WHEN '2' THEN '2' WHEN '3' THEN '3' WHEN '4' THEN '4'
                                          WHEN 'NA' THEN 'n' WHEN 'N/A' THEN 'n' WHEN 'IE' THEN 'i' ELSE '-' END, '' ORDER BY o)
                      FROM UNNEST(['C1','C2','C3','C4','C5','C6','C7','C8','D1','D2','D3','D4','D5','F1','F2','F3','F4']) k WITH OFFSET o), ''), '|',
      IFNULL(CASE form
        WHEN 'e' THEN (SELECT STRING_AGG(CONCAT(REGEXP_REPLACE(JSON_VALUE(x.key), r'[|~,:=/]', ''), '=', IFNULL(JSON_VALUE(x.score), ''), '/', IFNULL(JSON_VALUE(x.max), '')), ',')
                       FROM UNNEST(JSON_QUERY_ARRAY(j.obs612.result.sections)) x)
        WHEN 'g' THEN (SELECT STRING_AGG(CONCAT(REGEXP_REPLACE(JSON_VALUE(x.key), r'[|~,:=/]', ''), '=', IFNULL(JSON_VALUE(x.yes), ''), '/', IFNULL(JSON_VALUE(x.of), '')), ',')
                       FROM UNNEST(JSON_QUERY_ARRAY(j.obs612.result.sections)) x)
        WHEN 'm' THEN (SELECT STRING_AGG(CONCAT(REGEXP_REPLACE(JSON_VALUE(x.key), r'[|~,:=/]', ''), '=', IFNULL(JSON_VALUE(x.level), ''), '/3'), ',')
                       FROM UNNEST(JSON_QUERY_ARRAY(j.obs612.result.indicators)) x)
        ELSE (SELECT STRING_AGG(CONCAT(REGEXP_REPLACE(k, r'[|~,:=/]', ''), '=', FORMAT('%g', SAFE_CAST(JSON_VALUE(j.domains[k].domain_score) AS FLOAT64)), '/',
                                       FORMAT('%g', SAFE_CAST(JSON_VALUE(j.domains[k].domain_max) AS FLOAT64))), ',' ORDER BY k)
              FROM UNNEST(JSON_KEYS(j.domains, 1)) k
              WHERE SAFE_CAST(JSON_VALUE(j.domains[k].domain_max) AS FLOAT64) > 0 AND JSON_VALUE(j.domains[k].domain_score) IS NOT NULL
                AND (k != 'lesson_plan_fidelity' OR JSON_VALUE(j.has_lesson_plan) = 'true' OR JSON_VALUE(j.scores.has_lesson_plan) = 'true'))
      END, ''), '|',
      CASE WHEN form = '6' THEN CASE WHEN j.fico17_v6_review.levels IS NULL THEN 'a'
                                     WHEN ARRAY_LENGTH(JSON_KEYS(j.fico17_v6_review.change_reasons, 1)) > 0 THEN 'r' ELSE 'u' END
           WHEN j.observer_edit_summary IS NULL OR JSON_TYPE(j.observer_edit_summary) = 'null' THEN 'u'
           WHEN COALESCE(SAFE_CAST(JSON_VALUE(j.observer_edit_summary.indicators_rescored) AS INT64), 0) > 0 THEN 'r'
           ELSE 'n' END) AS r
  FROM w
)
SELECT rec.school_id, COUNT(*) AS n,
       ANY_VALUE(TRIM(CAST(s.emis AS STRING))) AS emis, ANY_VALUE(s.region) AS sector, ANY_VALUE(s.name) AS school_name,
       STRING_AGG(rec.r, '~' ORDER BY rec.teacher_id, rec.day, rec.id) AS t
FROM rec JOIN `Niete_Rumi_db.schools` s ON s.id = rec.school_id
GROUP BY rec.school_id
ORDER BY rec.school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
