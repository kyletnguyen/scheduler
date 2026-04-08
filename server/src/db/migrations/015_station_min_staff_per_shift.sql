-- Per-shift minimum staffing: different minimums for AM, PM, Night
-- Defaults to the existing min_staff value for each shift
ALTER TABLE stations ADD COLUMN min_staff_am INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stations ADD COLUMN min_staff_pm INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stations ADD COLUMN min_staff_night INTEGER NOT NULL DEFAULT 1;

-- Backfill from existing min_staff
UPDATE stations SET min_staff_am = min_staff, min_staff_pm = min_staff, min_staff_night = min_staff;
