-- Stations (lab sections) that CLS employees rotate through
CREATE TABLE IF NOT EXISTS stations (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO stations (name) VALUES
    ('Hematology'),
    ('Chemistry'),
    ('Microbiology'),
    ('Blood Bank'),
    ('Urinalysis');

-- Which stations each employee is qualified to cover
CREATE TABLE IF NOT EXISTS employee_stations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    station_id  INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    UNIQUE(employee_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_stations_employee ON employee_stations(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_stations_station ON employee_stations(station_id);

-- Add station_id to schedule_assignments (nullable — legacy assignments won't have one)
ALTER TABLE schedule_assignments ADD COLUMN station_id INTEGER REFERENCES stations(id);

-- Add default_shift column to employees if missing (needed for per-diem fix)
-- Already exists from initial migration, so this is a no-op safety check
