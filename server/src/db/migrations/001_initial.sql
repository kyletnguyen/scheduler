CREATE TABLE IF NOT EXISTS shifts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    start_time      TEXT NOT NULL,
    end_time        TEXT NOT NULL,
    crosses_midnight INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO shifts (name, start_time, end_time, crosses_midnight) VALUES
    ('AM',    '06:30', '15:00', 0),
    ('PM',    '15:00', '23:30', 0),
    ('Night', '23:30', '07:30', 1);

CREATE TABLE IF NOT EXISTS employees (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    employment_type   TEXT NOT NULL DEFAULT 'full-time' CHECK (employment_type IN ('full-time', 'part-time', 'per-diem')),
    target_hours_week REAL NOT NULL DEFAULT 40,
    default_shift     TEXT NOT NULL DEFAULT 'am' CHECK (default_shift IN ('am', 'pm', 'night', 'floater')),
    role              TEXT NOT NULL DEFAULT 'cls' CHECK (role IN ('cls', 'mlt', 'admin')),
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_shift_overrides (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id    INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    UNIQUE(employee_id, shift_id)
);

CREATE TABLE IF NOT EXISTS schedule_assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id    INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    station_id  INTEGER REFERENCES stations(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_assignments_date ON schedule_assignments(date);
CREATE INDEX IF NOT EXISTS idx_assignments_employee ON schedule_assignments(employee_id);

CREATE TABLE IF NOT EXISTS time_off (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    off_type    TEXT NOT NULL DEFAULT 'full' CHECK (off_type IN ('full', 'custom')),
    start_time  TEXT,
    end_time    TEXT,
    reason      TEXT,
    UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_timeoff_employee ON time_off(employee_id);
CREATE INDEX IF NOT EXISTS idx_timeoff_date ON time_off(date);

CREATE TABLE IF NOT EXISTS employee_constraints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    rule_type   TEXT NOT NULL,
    rule_value  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_constraints_employee ON employee_constraints(employee_id);

CREATE TABLE IF NOT EXISTS stations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    is_active       INTEGER NOT NULL DEFAULT 1,
    min_staff       INTEGER NOT NULL DEFAULT 1,
    min_cls         INTEGER NOT NULL DEFAULT 1,
    min_mlt         INTEGER NOT NULL DEFAULT 0,
    max_staff       INTEGER NOT NULL DEFAULT 3,
    require_cls     INTEGER NOT NULL DEFAULT 1,
    min_staff_am    INTEGER NOT NULL DEFAULT 1,
    min_staff_pm    INTEGER NOT NULL DEFAULT 1,
    min_staff_night INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO stations (name, min_staff, min_cls, min_mlt, max_staff, require_cls, min_staff_am, min_staff_pm, min_staff_night) VALUES
    ('Hematology/UA',  1, 1, 0, 3, 1, 1, 1, 1),
    ('Chemistry',      1, 1, 0, 3, 1, 1, 1, 1),
    ('Microbiology',   1, 1, 0, 3, 1, 1, 1, 1),
    ('Blood Bank',     1, 1, 0, 3, 1, 1, 1, 1),
    ('Admin',          1, 1, 0, 5, 0, 1, 1, 1);

CREATE TABLE IF NOT EXISTS employee_stations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    station_id  INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    priority    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(employee_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_stations_employee ON employee_stations(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_stations_station ON employee_stations(station_id);
