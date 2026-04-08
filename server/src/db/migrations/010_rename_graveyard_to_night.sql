-- Rename "Graveyard" shift to "Night" in shifts table
UPDATE shifts SET name = 'Night' WHERE name = 'Graveyard';

-- Rename graveyard -> night in employees.default_shift (requires table rebuild for CHECK)
CREATE TABLE employees_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    employment_type   TEXT NOT NULL DEFAULT 'full-time' CHECK (employment_type IN ('full-time', 'part-time', 'per-diem')),
    target_hours_week REAL NOT NULL DEFAULT 40,
    default_shift     TEXT NOT NULL DEFAULT 'floater' CHECK (default_shift IN ('am', 'pm', 'night', 'floater')),
    role              TEXT NOT NULL DEFAULT 'cls' CHECK (role IN ('cls', 'mlt', 'supervisor')),
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO employees_new (id, name, employment_type, target_hours_week, default_shift, role, is_active, created_at)
SELECT id, name, employment_type, target_hours_week,
       CASE default_shift WHEN 'graveyard' THEN 'night' ELSE default_shift END,
       role, is_active, created_at
FROM employees;

DROP TABLE employees;
ALTER TABLE employees_new RENAME TO employees;

-- Update any constraint rule_values that reference 'graveyard'
UPDATE employee_constraints SET rule_value = 'night' WHERE rule_value = 'graveyard';
