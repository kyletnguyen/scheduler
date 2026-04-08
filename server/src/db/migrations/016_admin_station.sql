-- Create Admin station for supervisors/admins to be assigned to by default
INSERT OR IGNORE INTO stations (name, min_staff, max_staff, min_staff_am, min_staff_pm, min_staff_night, require_cls, is_active)
VALUES ('Admin', 1, 5, 1, 1, 1, 0, 1);

-- Auto-assign all admin-role employees to the Admin station as #1 priority
-- (shifting their existing station priorities down by 1)
UPDATE employee_stations
SET priority = priority + 1
WHERE employee_id IN (SELECT id FROM employees WHERE role = 'admin');

INSERT OR IGNORE INTO employee_stations (employee_id, station_id, priority)
SELECT e.id, s.id, 1
FROM employees e, stations s
WHERE e.role = 'admin' AND s.name = 'Admin' AND e.is_active = 1;
