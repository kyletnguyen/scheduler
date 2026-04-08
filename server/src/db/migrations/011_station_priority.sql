-- Add priority column to employee_stations for station preference ordering
-- Priority 1 = most preferred station
ALTER TABLE employee_stations ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;

-- Set initial priorities based on current insertion order
UPDATE employee_stations SET priority = (
    SELECT COUNT(*) FROM employee_stations es2
    WHERE es2.employee_id = employee_stations.employee_id AND es2.id <= employee_stations.id
);
