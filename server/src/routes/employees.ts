import { Router, type IRouter } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';

const router: IRouter = Router();

const employeeSchema = z.object({
  name: z.string().min(1),
  employment_type: z.enum(['full-time', 'part-time', 'per-diem']),
  target_hours_week: z.number().min(0).default(40),
  default_shift: z.enum(['am', 'pm', 'night', 'floater']).default('floater'),
  role: z.enum(['cls', 'mlt', 'admin']).default('cls'),
});

// List all active employees (include their constraints and station qualifications)
router.get('/', (_req, res) => {
  const employees = db.prepare('SELECT * FROM employees WHERE is_active = 1 ORDER BY name').all() as any[];
  const constraints = db.prepare('SELECT * FROM employee_constraints ORDER BY employee_id').all() as any[];
  const empStations = db.prepare(`
    SELECT es.employee_id, s.id, s.name, s.color, s.abbr, es.priority, es.weight FROM employee_stations es
    JOIN stations s ON es.station_id = s.id
    WHERE s.is_active = 1
    ORDER BY es.employee_id, es.priority
  `).all() as any[];

  // Group constraints by employee
  const constraintMap = new Map<number, any[]>();
  for (const c of constraints) {
    if (!constraintMap.has(c.employee_id)) constraintMap.set(c.employee_id, []);
    constraintMap.get(c.employee_id)!.push(c);
  }

  // Group stations by employee
  const stationMap = new Map<number, any[]>();
  for (const es of empStations) {
    if (!stationMap.has(es.employee_id)) stationMap.set(es.employee_id, []);
    stationMap.get(es.employee_id)!.push({ id: es.id, name: es.name, color: es.color, abbr: es.abbr, priority: es.priority, weight: es.weight });
  }

  const result = employees.map((emp) => ({
    ...emp,
    constraints: constraintMap.get(emp.id) ?? [],
    stations: stationMap.get(emp.id) ?? [],
  }));

  res.json(result);
});

// Create employee
router.post('/', (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, employment_type, target_hours_week, default_shift, role } = parsed.data;
  const result = db.prepare(
    'INSERT INTO employees (name, employment_type, target_hours_week, default_shift, role) VALUES (?, ?, ?, ?, ?)'
  ).run(name, employment_type, target_hours_week, default_shift, role);

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...employee as any, constraints: [] });
});

// Update employee
router.put('/:id', (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, employment_type, target_hours_week, default_shift, role } = parsed.data;
  const result = db.prepare(
    'UPDATE employees SET name = ?, employment_type = ?, target_hours_week = ?, default_shift = ?, role = ? WHERE id = ? AND is_active = 1'
  ).run(name, employment_type, target_hours_week, default_shift, role, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  const constraints = db.prepare('SELECT * FROM employee_constraints WHERE employee_id = ?').all(req.params.id);
  res.json({ ...employee as any, constraints });
});

// Soft-delete employee
router.delete('/:id', (req, res) => {
  const result = db.prepare('UPDATE employees SET is_active = 0 WHERE id = ? AND is_active = 1').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  res.status(204).end();
});

// --- Constraints ---

const constraintSchema = z.object({
  rule_type: z.enum(['weekend_availability', 'weekend_group', 'weekend_off_pattern', 'blocked_day', 'shift_restriction', 'max_consecutive_days', 'custom_block', 'required_shift']),
  rule_value: z.string().min(1),
});

// Get constraints for an employee
router.get('/:id/constraints', (req, res) => {
  const constraints = db.prepare('SELECT * FROM employee_constraints WHERE employee_id = ? ORDER BY rule_type').all(req.params.id);
  res.json(constraints);
});

// Set all constraints for an employee (replaces existing)
router.put('/:id/constraints', (req, res) => {
  const parsed = z.array(constraintSchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const employeeId = Number(req.params.id);

  db.transaction(() => {
    db.prepare('DELETE FROM employee_constraints WHERE employee_id = ?').run(employeeId);
    const insert = db.prepare('INSERT INTO employee_constraints (employee_id, rule_type, rule_value) VALUES (?, ?, ?)');
    for (const rule of parsed.data) {
      insert.run(employeeId, rule.rule_type, rule.rule_value);
    }
  })();

  const constraints = db.prepare('SELECT * FROM employee_constraints WHERE employee_id = ? ORDER BY rule_type').all(employeeId);
  res.json(constraints);
});

// Add single constraint
router.post('/:id/constraints', (req, res) => {
  const parsed = constraintSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = db.prepare(
    'INSERT INTO employee_constraints (employee_id, rule_type, rule_value) VALUES (?, ?, ?)'
  ).run(Number(req.params.id), parsed.data.rule_type, parsed.data.rule_value);

  const constraint = db.prepare('SELECT * FROM employee_constraints WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(constraint);
});

// Delete single constraint
router.delete('/constraints/:constraintId', (req, res) => {
  const result = db.prepare('DELETE FROM employee_constraints WHERE id = ?').run(req.params.constraintId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Constraint not found' });
  }
  res.status(204).end();
});

export default router;
