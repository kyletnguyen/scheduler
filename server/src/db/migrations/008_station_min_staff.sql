-- Add minimum staffing requirement per station
ALTER TABLE stations ADD COLUMN min_staff INTEGER NOT NULL DEFAULT 1;
