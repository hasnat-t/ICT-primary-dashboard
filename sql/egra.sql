-- The learning assessment (EGRA / EGMA child test), ICT, from 2026-10-22. Governed (rules v0.39.4):
-- learning-assessment-rules.md §1-§4 - item_bank_version 'sa-battery'; a test counts once a subtask is on record
-- (child_test_blocks), completed beside it; coaches' own accounts and programme schools only (the rest are kept with
-- counted = 0 so a zero can be explained, never shown); children = distinct student_id; scores as the results page reads
-- them (tap_correct / keypad_correct on the phone, ai_marks.correct / per_minute once the AI scorer is done - a recording
-- not yet scored is empty, never 0); benchmarks are the results page's proposed ones, AI-scored, no coach check.
-- Children's data: this extract stays on the server (it carries a child key for distinct counts) and the page only ever
-- gets masked aggregates. Never selected: transcript, responses, audio/photo keys, names, notes.
-- Record ":"-separated: day, grade, completed, counted, child key, sector, ur wcpm, en wcpm, another voice, then the 17
-- current subtasks as "correct/of" ('' = not scored) in the order of the ids list below.
WITH sp AS (
  SELECT school_id, LOGICAL_OR(COALESCE(is_programme_school, FALSE)) AS is_programme_school
  FROM `taleemabad_governance.school_programme` GROUP BY school_id
),
t AS (
  SELECT t.id, t.student_id, t.school_id, t.grade, t.status, s.region,
         DATE_DIFF(DATE(SAFE_CAST(t.created_at AS TIMESTAMP), 'Asia/Karachi'), DATE '2026-08-01', DAY) AS day,
         (sp.is_programme_school IS TRUE AND u.is_test_user IS NOT TRUE) AS counted
  FROM `Niete_Rumi_db.child_test_sessions` t
  LEFT JOIN sp ON sp.school_id = t.school_id
  LEFT JOIN `Niete_Rumi_db.users` u ON u.id = t.coach_user_id
  LEFT JOIN `Niete_Rumi_db.schools` s ON s.id = t.school_id
  WHERE t.item_bank_version = 'sa-battery'
    AND EXISTS (SELECT 1 FROM `Niete_Rumi_db.child_test_blocks` b WHERE b.session_id = t.id)
),
ids AS (SELECT id, o, ofx FROM UNNEST([
  STRUCT('ur.letter_names5' AS id, 0 AS o, 5.0 AS ofx), ('ur.letter_sounds5', 1, 5), ('ur.words4', 2, 4), ('ur.story_w3', 3, NULL), ('ur.story_comp_w3', 4, 4),
  ('en.letter_names5', 5, 5), ('en.letter_sounds5', 6, 5), ('en.words4', 7, 4), ('en.story_w3', 8, NULL), ('en.story_comp_w3', 9, 3),
  ('ma.number_id8', 10, 8), ('ma.discrimination2', 11, 2), ('ma.missing4', 12, 4), ('ma.add2i', 13, 2), ('ma.sub2i', 14, 2), ('ma.mul2i', 15, 2),
  ('ma.fluency1m', 16, NULL)])),
task AS (
  SELECT b.session_id, ids.o, ids.ofx,
    CASE WHEN b.response_mode = 'tap' THEN SAFE_CAST(JSON_VALUE(b.ai_marks, '$.tap_correct') AS FLOAT64)
         WHEN b.response_mode IN ('keypad', 'keyboard') THEN SAFE_CAST(JSON_VALUE(b.ai_marks, '$.keypad_correct') AS FLOAT64)
         WHEN b.ai_status = 'scored' THEN SAFE_CAST(JSON_VALUE(b.ai_marks, '$.correct') AS FLOAT64) END AS correct,
    IF(b.ai_status = 'scored', SAFE_CAST(JSON_VALUE(b.ai_marks, '$.per_minute') AS FLOAT64), NULL) AS per_minute,
    SAFE_CAST(JSON_VALUE(b.ai_marks, '$.of') AS FLOAT64) AS of_items,
    JSON_VALUE(b.ai_marks, '$.detail.second_voice') = 'true' AS second_voice
  FROM `Niete_Rumi_db.child_test_blocks` b
  JOIN ids ON ids.id = b.block
  WHERE b.session_id IN (SELECT id FROM t)
),
voice AS (                                   -- another voice heard on any subtask of the test (§4)
  SELECT session_id, LOGICAL_OR(JSON_VALUE(ai_marks, '$.detail.second_voice') = 'true') AS v
  FROM `Niete_Rumi_db.child_test_blocks` WHERE session_id IN (SELECT id FROM t) GROUP BY session_id
),
cell AS (
  SELECT session_id, o,
         IF(o IN (3, 8, 16), COALESCE(per_minute, correct), correct) AS v,
         IF(o IN (4, 9), COALESCE(NULLIF(of_items, 0), ofx), ofx) AS of_items, second_voice
  FROM task
),
per AS (
  SELECT t.id, t.school_id, t.day, t.grade, t.status, t.counted, t.student_id, t.region,
         LOGICAL_OR(vo.v) AS voice,
         ARRAY_AGG(IF(c.o IS NULL, NULL, STRUCT(c.o AS o, c.v AS v, c.of_items AS of_items)) IGNORE NULLS) AS cells
  FROM t LEFT JOIN cell c ON c.session_id = t.id LEFT JOIN voice vo ON vo.session_id = t.id
  GROUP BY t.id, t.school_id, t.day, t.grade, t.status, t.counted, t.student_id, t.region
),
rec AS (
  SELECT school_id, id, CONCAT(
    CAST(day AS STRING), ':', IFNULL(CAST(grade AS STRING), ''), ':', IF(status = 'completed', '1', '0'), ':', IF(counted, '1', '0'), ':',
    SUBSTR(TO_HEX(SHA256(IFNULL(student_id, id))), 1, 12), ':', REGEXP_REPLACE(IFNULL(region, ''), r'[:~,/]', ' '), ':',
    IFNULL((SELECT FORMAT('%g', v) FROM UNNEST(cells) WHERE o = 3 AND v IS NOT NULL LIMIT 1), ''), ':',
    IFNULL((SELECT FORMAT('%g', v) FROM UNNEST(cells) WHERE o = 8 AND v IS NOT NULL LIMIT 1), ''), ':',
    IF(voice, '1', '0'), ':',
    (SELECT STRING_AGG(IFNULL((SELECT CONCAT(FORMAT('%g', c.v), '/', IFNULL(FORMAT('%g', c.of_items), ''))
                                FROM UNNEST(cells) c WHERE c.o = k AND c.v IS NOT NULL LIMIT 1), ''), ',' ORDER BY k)
     FROM UNNEST(GENERATE_ARRAY(0, 16)) k)) AS r
  FROM per
)
SELECT school_id, COUNT(*) AS n, STRING_AGG(r, '~' ORDER BY id) AS t
FROM rec
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
