ALTER TABLE time_off ADD COLUMN off_type TEXT NOT NULL DEFAULT 'full' CHECK (off_type IN ('full', 'custom'));
ALTER TABLE time_off ADD COLUMN start_time TEXT;
ALTER TABLE time_off ADD COLUMN end_time TEXT;
