-- Lesson plans per primary teacher per Pakistan day since 2026-08-01. Governed (rules v0.39.3):
-- lp-query-rules.md §0, §6 lp_users traces (grade 1-5 plans on WhatsApp or read in the app, grade 6-12 lessons
-- delivered on WhatsApp or read in the app), §1 lp_plans (grade 1-5 plan rows), §4 lp_taught
-- (lp_feedback.used_in_class = 'taught'; answered = any used_in_class value). Merged accounts credited to the survivor.
-- opened = grade 1-5 plans opened in the teacher app (niete_lp_opens, source viewer, k5/fln) - so the page can show
-- "used" (generated or opened) apart from "generated" (lesson_plans rows).
-- Record per teacher-day: "tid:day:g15:g612:plans:taught:answered:opened" (day = days since 2026-08-01), joined by "~".
WITH {{COMMON}},
traces AS (
  SELECT p.user_id, 'g15' AS lane, 1 AS plan, 0 AS op, SAFE_CAST(p.created_at AS TIMESTAMP) AS ts
  FROM `Niete_Rumi_db.lesson_plans` p
  UNION ALL
  SELECT o.user_id, IF(o.plan_kind = 'g612', 'g612', 'g15'), 0, IF(o.plan_kind = 'g612', 0, 1), SAFE_CAST(o.opened_at AS TIMESTAMP)
  FROM `Niete_Rumi_db.niete_lp_opens` o
  WHERE o.source = 'viewer' AND o.plan_kind IN ('k5', 'g612', 'fln')
  UNION ALL
  SELECT d.user_id, 'g612', 0, 0, SAFE_CAST(d.delivered_at AS TIMESTAMP)
  FROM `Niete_Rumi_db.niete_lp612_deliveries` d
  WHERE d.surface = 'whatsapp'
),
fb AS (
  SELECT f.user_id, f.used_in_class, f.id, SAFE_CAST(f.created_at AS TIMESTAMP) AS ts
  FROM `Niete_Rumi_db.lp_feedback` f
  WHERE f.lesson_plan_id IS NOT NULL                  -- grade 1-5 plans
),
ev AS (
  SELECT COALESCE(m.survivor_id, tr.user_id) AS teacher_id, DATE(tr.ts, 'Asia/Karachi') AS d,
         tr.lane, tr.plan, tr.op, CAST(NULL AS STRING) AS used, CAST(NULL AS STRING) AS fid
  FROM traces tr LEFT JOIN ict_account_merges m ON m.retired_id = tr.user_id
  WHERE tr.ts >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
  UNION ALL
  SELECT COALESCE(m.survivor_id, fb.user_id), DATE(fb.ts, 'Asia/Karachi'), 'fb', 0, 0, fb.used_in_class, fb.id
  FROM fb LEFT JOIN ict_account_merges m ON m.retired_id = fb.user_id
  WHERE fb.ts >= TIMESTAMP('2026-08-01', 'Asia/Karachi')
),
td AS (
  SELECT t.school_id, t.teacher_id, DATE_DIFF(ev.d, DATE '2026-08-01', DAY) AS day,
         LOGICAL_OR(ev.lane = 'g15') AS g15, LOGICAL_OR(ev.lane = 'g612') AS g612,
         SUM(IF(ev.lane = 'g15', ev.plan, 0)) AS plans, SUM(ev.op) AS opened,
         COUNT(DISTINCT IF(ev.used = 'taught', ev.fid, NULL)) AS taught,
         COUNT(DISTINCT IF(ev.used IS NOT NULL, ev.fid, NULL)) AS answered
  FROM ev JOIN prim t ON t.teacher_id = ev.teacher_id
  GROUP BY 1, 2, 3
)
SELECT school_id, COUNT(*) AS n,
       STRING_AGG(CONCAT(SUBSTR(teacher_id, 1, 8), ':', CAST(day AS STRING), ':', IF(g15, '1', '0'), ':', IF(g612, '1', '0'), ':',
                         CAST(plans AS STRING), ':', CAST(taught AS STRING), ':', CAST(answered AS STRING), ':', CAST(opened AS STRING)),
                  '~' ORDER BY teacher_id, day) AS t
FROM td
GROUP BY school_id
ORDER BY school_id
LIMIT {{LIMIT}} OFFSET {{OFFSET}}
