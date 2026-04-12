-- Add color (hex) and abbreviation columns to stations
ALTER TABLE stations ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE stations ADD COLUMN abbr TEXT NOT NULL DEFAULT '';

-- Set default colors and abbreviations for existing stations
UPDATE stations SET color = '#8b5cf6', abbr = 'HM' WHERE name = 'Hematology/UA';
UPDATE stations SET color = '#d97706', abbr = 'CH' WHERE name = 'Chemistry';
UPDATE stations SET color = '#059669', abbr = 'MC' WHERE name = 'Microbiology';
UPDATE stations SET color = '#dc2626', abbr = 'BB' WHERE name = 'Blood Bank';
UPDATE stations SET color = '#0ea5e9', abbr = 'AD' WHERE name = 'Admin';
