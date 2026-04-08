-- Add role to employees: cls, mlt, supervisor
ALTER TABLE employees ADD COLUMN role TEXT NOT NULL DEFAULT 'cls' CHECK (role IN ('cls', 'mlt', 'supervisor'));
