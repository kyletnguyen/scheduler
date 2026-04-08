-- Add max_staff range and require_cls (allows MLT) flag
ALTER TABLE stations ADD COLUMN max_staff INTEGER NOT NULL DEFAULT 3;
ALTER TABLE stations ADD COLUMN require_cls INTEGER NOT NULL DEFAULT 1;
