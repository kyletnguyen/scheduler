CREATE TABLE IF NOT EXISTS shifts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    start_time      TEXT NOT NULL,
    end_time        TEXT NOT NULL,
    crosses_midnight INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO shifts (name, start_time, end_time, crosses_midnight) VALUES
    ('AM',        '06:30', '15:00', 0),
    ('PM',        '15:00', '23:30', 0),
    ('Graveyard', '23:30', '07:30', 1);

CREATE TABLE IF NOT EXISTS employees (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    employment_type   TEXT NOT NULL CHECK (employment_type IN ('full-time', 'part-time', 'per-diem')),
    target_hours_week REAL NOT NULL DEFAULT 40,
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
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_assignments_date ON schedule_assignments(date);
CREATE INDEX IF NOT EXISTS idx_assignments_employee ON schedule_assignments(employee_id);

CREATE TABLE IF NOT EXISTS time_off (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    reason      TEXT,
    UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_timeoff_employee ON time_off(employee_id);
CREATE INDEX IF NOT EXISTS idx_timeoff_date ON time_off(date);
