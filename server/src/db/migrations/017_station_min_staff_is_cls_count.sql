-- min_staff_am/pm/night now represents CLS count (not total staff).
-- Total staff = CLS count + MLT slots (derived from min_mlt).
-- Update existing values: subtract min_mlt from current values.

-- Stations with min_mlt=1 (Hematology, Chemistry, Microbiology):
-- Their min_staff values were total (CLS+MLT), now just CLS.
UPDATE stations SET
  min_staff = min_staff - min_mlt,
  min_staff_am = min_staff_am - min_mlt,
  min_staff_pm = min_staff_pm - min_mlt,
  min_staff_night = CASE WHEN min_staff_night - min_mlt < 1 THEN 1 ELSE min_staff_night - min_mlt END
WHERE min_mlt > 0 AND name != 'Admin';

-- BB and Admin stay the same (min_mlt=0, so no change needed)
