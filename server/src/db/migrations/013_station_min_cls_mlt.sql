-- Add max_staff range and require_cls flag per station
-- min_staff already exists (from migration 008) as the minimum
ALTER TABLE stations ADD COLUMN max_staff INTEGER NOT NULL DEFAULT 3;
ALTER TABLE stations ADD COLUMN require_cls INTEGER NOT NULL DEFAULT 1;
