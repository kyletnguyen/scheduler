-- Add weight column to employee_stations (0-100, higher = stronger preference)
-- Default 50 = neutral preference across all qualified stations
ALTER TABLE employee_stations ADD COLUMN weight INTEGER NOT NULL DEFAULT 50;
