-- Middle/high training levels and modules per level (rules v0.41.2, training-query-rules.md §4-§5, §4b, §6b): the
-- niete_middle_high scope (NIETE order_index 2-3, Oxbridge, Beaconhouse) plus I-SAPS, found by vendor key because level
-- ids are not contiguous. Level names are gate-redacted (§7b), so the page labels levels itself.
SELECT l.id AS level_id, v.key AS vendor, l.order_index, v.passing_pct, v.has_grand_quiz,
       COUNT(DISTINCT m.id) AS modules
FROM `Niete_Rumi_db.training_levels` l
JOIN `Niete_Rumi_db.training_vendors` v ON v.id = l.vendor_id
LEFT JOIN `Niete_Rumi_db.training_courses` co ON co.level_id = l.id
LEFT JOIN `Niete_Rumi_db.training_modules` m ON m.course_id = co.id
WHERE (v.key = 'TALEEMABAD' AND l.order_index IN (2, 3)) OR v.key IN ('OXBRIDGE', 'BEACONHOUSE', 'ISAPS')
GROUP BY 1, 2, 3, 4, 5
ORDER BY vendor, order_index
