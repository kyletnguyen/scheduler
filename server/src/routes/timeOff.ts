import { Router } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';

const router = Router();

const timeOffSchema = z.object({
  employee_id: z.number().int().positive(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  off_type: z.enum(['full', 'custom']).default('full'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().optional(),
});

// List time-off entries (filterable by employee and/or month)
router.get('/', (req, res) => {
  let sql = 'SELECT t.*, e.name as employee_name FROM time_off t JOIN employees e ON t.employee_id = e.id WHERE 1=1';
  const params: (string | number)[] = [];

  if (req.query.employee_id) {
    sql += ' AND t.employee_id = ?';
    params.push(Number(req.query.employee_id));
  }
  if (req.query.month) {
    sql += " AND t.date LIKE ? || '%'";
    params.push(req.query.month as string);
  }

  sql += ' ORDER BY t.date';
  const entries = db.prepare(sql).all(...params);
  res.json(entries);
});

// Add time-off (batch of dates)
router.post('/', (req, res) => {
  const parsed = timeOffSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { employee_id, dates, off_type, start_time, end_time, reason } = parsed.data;

  const insert = db.prepare(
    'INSERT OR REPLACE INTO time_off (employee_id, date, off_type, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((dates: string[]) => {
    for (const date of dates) {
      insert.run(employee_id, date, off_type, start_time ?? null, end_time ?? null, reason ?? null);
    }
  });

  insertMany(dates);

  const entries = db.prepare(
    `SELECT t.*, e.name as employee_name FROM time_off t JOIN employees e ON t.employee_id = e.id
     WHERE t.employee_id = ? AND t.date IN (${dates.map(() => '?').join(',')})
     ORDER BY t.date`
  ).all(employee_id, ...dates);

  res.status(201).json(entries);
});

// Clear all time-off for an employee in a month
router.delete('/clear/:employeeId/:month', (req, res) => {
  const result = db.prepare("DELETE FROM time_off WHERE employee_id = ? AND date LIKE ? || '%'")
    .run(req.params.employeeId, req.params.month);
  res.json({ deleted: result.changes });
});

// Delete time-off entry
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM time_off WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Time-off entry not found' });
  }
  res.status(204).end();
});

export default router;
