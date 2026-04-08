-- Rename role "supervisor" -> "admin" (requires table rebuild for CHECK constraint)
CREATE TABLE employees_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    employment_type   TEXT NOT NULL DEFAULT 'full-time' CHECK (employment_type IN ('full-time', 'part-time', 'per-diem')),
    target_hours_week REAL NOT NULL DEFAULT 40,
    default_shift     TEXT NOT NULL DEFAULT 'floater' CHECK (default_shift IN ('am', 'pm', 'night', 'floater')),
    role              TEXT NOT NULL DEFAULT 'cls' CHECK (role IN ('cls', 'mlt', 'admin')),
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO employees_new (id, name, employment_type, target_hours_week, default_shift, role, is_active, created_at)
SELECT id, name, employment_type, target_hours_week, default_shift,
       CASE role WHEN 'supervisor' THEN 'admin' ELSE role END,
       is_active, created_at
FROM employees;

DROP TABLE employees;
ALTER TABLE employees_new RENAME TO employees;
