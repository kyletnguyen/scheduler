-- Restore min_staff_pm and min_staff_night to 1 for bench stations.
-- PM/Night staff are few but still need station assignments for scheduling.
-- The analyzer handles PM/Night differently (no per-station criticals).
UPDATE stations SET min_staff_pm = 1, min_staff_night = 1 WHERE name != 'Admin';
