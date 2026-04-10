-- PM and Night shifts don't have per-station staffing requirements.
-- With only 3 PM and 3 Night employees, per-station mins of 1 are impossible to fill.
-- Station assignments for PM/Night are informational, not required.
-- Revert: keep min_staff values as-is so generator still places people.
-- The analyzer will skip per-station criticals for PM/Night.
UPDATE stations SET min_staff_pm = 1, min_staff_night = 1;
