-- Add default shift to employees
ALTER TABLE employees ADD COLUMN default_shift TEXT NOT NULL DEFAULT 'floater' CHECK (default_shift IN ('morning', 'pm', 'graveyard', 'floater'));

-- Flexible constraints table: one row per rule per employee
CREATE TABLE IF NOT EXISTS employee_constraints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    rule_type   TEXT NOT NULL,
    rule_value  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_constraints_employee ON employee_constraints(employee_id);

-- rule_type / rule_value examples:
-- 'weekend_availability' / 'all' | 'none' | 'alternating'
-- 'blocked_day'          / '0' (Sun) | '1' (Mon) | ... | '6' (Sat)
-- 'shift_restriction'    / 'morning' | 'pm' | 'graveyard'  (can ONLY work this shift; multiple rows = multiple allowed shifts)
-- 'max_consecutive_days' / '5' (number as string)
-- 'custom_block'         / JSON '{"start":"2026-04-01","end":"2026-04-05","note":"Training"}'
-- 'weekend_swing'        / 'fri_off' | 'mon_off'  (if working weekend: off Friday before OR off Monday after)
