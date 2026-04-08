-- Rename "Morning" shift to "AM"
UPDATE shifts SET name = 'AM' WHERE name = 'Morning';

-- Recreate employees table with updated CHECK constraint
CREATE TABLE employees_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    employment_type   TEXT NOT NULL CHECK (employment_type IN ('full-time', 'part-time', 'per-diem')),
    target_hours_week REAL NOT NULL DEFAULT 40,
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    default_shift     TEXT NOT NULL DEFAULT 'floater' CHECK (default_shift IN ('am', 'pm', 'graveyard', 'floater'))
);

INSERT INTO employees_new (id, name, employment_type, target_hours_week, is_active, created_at, default_shift)
SELECT id, name, employment_type, target_hours_week, is_active, created_at,
       CASE default_shift WHEN 'morning' THEN 'am' ELSE default_shift END
FROM employees;

DROP TABLE employees;
ALTER TABLE employees_new RENAME TO employees;

-- Update shift_restriction constraints
UPDATE employee_constraints SET rule_value = 'am' WHERE rule_type = 'shift_restriction' AND rule_value = 'morning';
