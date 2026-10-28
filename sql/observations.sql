-- Classroom observations of primary teachers since 2026-08-01, one record per session. Governed (rules v0.39.3):
-- coaching-query-rules.md §1 and the dc_complete / hitl_conducted cards (DC = self-recording with scores back,
-- not test_cleanup; HITL = coach visit with scores, not cancelled/abandoned/failed/test_cleanup; a visit whose
-- observer is the teacher, and test observers, out), fico-scores-rules.md §2/§2c (domain_score/domain_max from
-- analysis_data.domains; lesson-plan fidelity only where a plan was attached; /observe2 fico17 visits excluded
-- and counted). DC and HITL are never pooled; FICO v3 (from 2026-09-08) is split from earlier scores by the page.
-- Plans taught (Hasnat, 2026-10-27; no governed rule yet - provisional): a DC observation in which the teacher attached one
-- of her recent Rumi plans (has_lesson_plan AND lesson_plan_link_method = 'selected_recent'); DC stage L. linked_lesson_plan_id
-- is NULL on every row, so the exact plan cannot be named; 99.6% of these followed a Rumi plan within 14 days (2026-10-27).
-- Lesson subject (DC only): analysis_data.subject, fico-scores-rules.md §2c / transcripts-rules.md - on ~95% of DC rows and
-- ~11% of HITL, so it is kept for DC only. Free text, grouped here into the primary subjects: u Urdu, m Mathematics, e English,
-- i Islamiat, s Science, c Social studies, g General knowledge, o other, '' not recorded.
-- Lesson grade from the attached plan (DC only; Hasnat 2026-10-28, provisional - the governed by-grade route is the roster,
-- coaching-query-rules.md §1g, which the page falls back to): r<g> = the Rumi plan's lesson_id (grade_<g>_...), t<g> = a clear
-- grade typed in an uploaded/pasted plan (lesson_plan_structured.grade_level: 4, 4th, Grade 4, Class IV, four, چہارم ...;
-- ranges and unclear text are left out), '' = none. g = 1..12 or ey (early years).
-- Record: "tid:day:src:stage:tsk_s:tsk_m:hlp_s:hlp_m:se_s:se_m:lpf_s:lpf_m:subj:pgrade"; src D/H; DC stage L or -; HITL stage C complete
-- (debrief done), P debrief pending, A awaiting review; day = days since 2026-08-01 (PKT).
WITH {{COMMON}},
sess_all AS (
  SELECT cs.id AS session_id, t.teacher_id, t.school_id,
         IF(cs.observation_type = 'leader_observation', 'H', 'D') AS src,
         CASE WHEN cs.observation_type IS NULL THEN IF(cs.has_lesson_plan AND cs.lesson_plan_link_method = 'selected_recent', 'L', '-')
              WHEN cs.debrief_status = 'done' THEN 'C'
              WHEN cs.status IN ('observer_review_complete', 'completed') THEN 'P'
              ELSE 'A' END AS stage,
         cs.has_lesson_plan,
         IF(cs.observation_type IS NULL, LOWER(TRIM(JSON_VALUE(cs.analysis_data, '$.subject'))), NULL) AS subj_raw,
         IF(cs.observation_type IS NULL AND cs.has_lesson_plan, REGEXP_EXTRACT(JSON_VALUE(cs.lesson_plan_structured, '$._fidelity_ref.lesson_id'), r'^grade_(\d+)_'), NULL) AS g_ref,
         IF(cs.observation_type IS NULL AND cs.has_lesson_plan, LOWER(TRIM(JSON_VALUE(cs.lesson_plan_structured, '$.grade_level'))), NULL) AS g_txt,
         JSON_VALUE(cs.analysis_data, '$.observe2.rubric') IS NOT NULL AS is_observe2,
         DATE_DIFF(DATE(SAFE_CAST(cs.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         SAFE.PARSE_JSON(cs.analysis_data) AS j
  FROM `Niete_Rumi_db.coaching_sessions` cs
  LEFT JOIN ict_account_merges m ON m.retired_id = cs.user_id
  JOIN prim t ON t.teacher_id = COALESCE(m.survivor_id, cs.user_id)            -- the teacher observed / self-recording
  LEFT JOIN `Niete_Rumi_db.users` obs ON obs.id = cs.observer_user_id           -- the coach (HITL only)
  WHERE SAFE_CAST(cs.created_at AS TIMESTAMP) >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
    AND cs.analysis_data IS NOT NULL
    AND JSON_QUERY(cs.analysis_data, '$.scores') IS NOT NULL
    AND ((cs.observation_type IS NULL AND cs.status != 'test_cleanup')
         OR (cs.observation_type = 'leader_observation'
             AND cs.status NOT IN ('cancelled', 'abandoned', 'failed', 'test_cleanup')))
    AND (cs.observer_user_id IS NULL OR cs.observer_user_id != cs.user_id)
    AND obs.is_test_user IS NOT TRUE
),
sess AS (
  SELECT * EXCEPT (g_ref, g_txt),
         CASE WHEN g_ref IS NOT NULL THEN CONCAT('r', g_ref)
              WHEN g_txt IS NULL OR g_txt = '' THEN ''
              WHEN REGEXP_CONTAINS(g_txt, r'^(nursery|kg|k\.g\.?|kindergarten|prep|ece|early years|katchi|کچی|نرسری)$') THEN 'tey'
              WHEN SAFE_CAST(REGEXP_EXTRACT(g_txt, r'^(?:grade|class|gr\.?|g\.?)?\s*[-:]?\s*(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:grade|class)?\s*-?\s*[a-z]?$') AS INT64) BETWEEN 1 AND 12
                THEN CONCAT('t', CAST(SAFE_CAST(REGEXP_EXTRACT(g_txt, r'^(?:grade|class|gr\.?|g\.?)?\s*[-:]?\s*(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:grade|class)?\s*-?\s*[a-z]?$') AS INT64) AS STRING))
              ELSE CASE REPLACE(REGEXP_EXTRACT(g_txt, r'^(?:grade|class|جماعت)?\s*(viii|vii|vi|iv|v|iii|ii|i|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth|اوّل|اول|پہلی|دوم|دوسری|سوم|تیسری|چہارم|چوتھی|پنجم|پانچویں|ششم|چھٹی)\s*(?:جماعت|گریڈ|کلاس|grade|class)?$'), 'اوّل', 'اول')
                     WHEN 'i' THEN 't1' WHEN 'one' THEN 't1' WHEN 'first' THEN 't1' WHEN 'اول' THEN 't1' WHEN 'پہلی' THEN 't1'
                     WHEN 'ii' THEN 't2' WHEN 'two' THEN 't2' WHEN 'second' THEN 't2' WHEN 'دوم' THEN 't2' WHEN 'دوسری' THEN 't2'
                     WHEN 'iii' THEN 't3' WHEN 'three' THEN 't3' WHEN 'third' THEN 't3' WHEN 'سوم' THEN 't3' WHEN 'تیسری' THEN 't3'
                     WHEN 'iv' THEN 't4' WHEN 'four' THEN 't4' WHEN 'fourth' THEN 't4' WHEN 'چہارم' THEN 't4' WHEN 'چوتھی' THEN 't4'
                     WHEN 'v' THEN 't5' WHEN 'five' THEN 't5' WHEN 'fifth' THEN 't5' WHEN 'پنجم' THEN 't5' WHEN 'پانچویں' THEN 't5'
                     WHEN 'vi' THEN 't6' WHEN 'six' THEN 't6' WHEN 'sixth' THEN 't6' WHEN 'ششم' THEN 't6' WHEN 'چھٹی' THEN 't6'
                     WHEN 'vii' THEN 't7' WHEN 'viii' THEN 't8' ELSE '' END END AS pgrade
  FROM sess_all WHERE NOT is_observe2
),
dom AS (
  SELECT s.session_id, k AS domain,
         SAFE_CAST(JSON_VALUE(s.j.domains[k].domain_score) AS FLOAT64) AS score,
         SAFE_CAST(JSON_VALUE(s.j.domains[k].domain_max)   AS FLOAT64) AS mx
  FROM sess s, UNNEST(JSON_KEYS(s.j.domains, 1)) AS k
  WHERE (k != 'lesson_plan_fidelity' OR s.has_lesson_plan IS TRUE)
),
dom_ok AS (SELECT * FROM dom WHERE mx > 0 AND score IS NOT NULL),
piv AS (
  SELECT s.school_id, s.teacher_id, s.day, s.session_id, s.src, s.stage, s.pgrade,
         CASE WHEN s.subj_raw IS NULL OR s.subj_raw IN ('', 'unable to determine') THEN ''
              WHEN REGEXP_CONTAINS(s.subj_raw, r'^(math|maths|mathematics|ریاضی)$') THEN 'm'
              WHEN REGEXP_CONTAINS(s.subj_raw, r'^urdu|اردو') THEN 'u'
              WHEN REGEXP_CONTAINS(s.subj_raw, r'^english') THEN 'e'
              WHEN REGEXP_CONTAINS(s.subj_raw, r'islam|quran|اسلامیات') THEN 'i'
              WHEN REGEXP_CONTAINS(s.subj_raw, r'general knowledge|general studies|waaqfiyat|واقفیت') THEN 'g'
              WHEN REGEXP_CONTAINS(s.subj_raw, r'computer|library') THEN 'o'
              WHEN REGEXP_CONTAINS(s.subj_raw, r'science|biology|chemistry|physics|سائنس') THEN 's'
              WHEN REGEXP_CONTAINS(s.subj_raw, r'social|history|geography|civics|معاشرتی|مطالعہ|سوشل') THEN 'c'
              ELSE 'o' END AS subj,
         MAX(IF(d.domain = 'teacher_subject_knowledge', d.score, NULL)) AS tsk_s, MAX(IF(d.domain = 'teacher_subject_knowledge', d.mx, NULL)) AS tsk_m,
         MAX(IF(d.domain = 'high_leverage_practices',   d.score, NULL)) AS hlp_s, MAX(IF(d.domain = 'high_leverage_practices',   d.mx, NULL)) AS hlp_m,
         MAX(IF(d.domain = 'student_engagement',        d.score, NULL)) AS se_s,  MAX(IF(d.domain = 'student_engagement',        d.mx, NULL)) AS se_m,
         MAX(IF(d.domain = 'lesson_plan_fidelity',      d.score, NULL)) AS lpf_s, MAX(IF(d.domain = 'lesson_plan_fidelity',      d.mx, NULL)) AS lpf_m
  FROM sess s LEFT JOIN dom_ok d ON d.session_id = s.session_id
  GROUP BY s.school_id, s.teacher_id, s.day, s.session_id, s.src, s.stage, s.pgrade, subj
),
rec AS (
  SELECT school_id, teacher_id, day, session_id,
         CONCAT(SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', src, ':', stage, ':',
                IFNULL(FORMAT('%g', tsk_s), ''), ':', IFNULL(FORMAT('%g', tsk_m), ''), ':',
                IFNULL(FORMAT('%g', hlp_s), ''), ':', IFNULL(FORMAT('%g', hlp_m), ''), ':',
                IFNULL(FORMAT('%g', se_s),  ''), ':', IFNULL(FORMAT('%g', se_m),  ''), ':',
                IFNULL(FORMAT('%g', lpf_s), ''), ':', IFNULL(FORMAT('%g', lpf_m), ''), ':', subj, ':', pgrade) AS r
  FROM piv
),
o2 AS (SELECT school_id, COUNT(DISTINCT session_id) AS observe2_excluded FROM sess_all WHERE is_observe2 GROUP BY school_id)
SELECT rec.school_id, COUNT(*) AS n, ANY_VALUE(COALESCE(o2.observe2_excluded, 0)) AS observe2_excluded,
       STRING_AGG(rec.r, '~' ORDER BY rec.teacher_id, rec.day, rec.session_id) AS t
FROM rec LEFT JOIN o2 USING (school_id)
GROUP BY rec.school_id
ORDER BY rec.school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
