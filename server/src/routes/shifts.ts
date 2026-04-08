import { Router } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';

const router = Router();

const shiftUpdateSchema = z.object({
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  crosses_midnight: z.number().min(0).max(1).optional(),
});

// List all shifts
router.get('/', (_req, res) => {
  const shifts = db.prepare('SELECT * FROM shifts ORDER BY id').all();
  res.json(shifts);
});

// Update shift times
router.put('/:id', (req, res) => {
  const parsed = shiftUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { start_time, end_time, crosses_midnight } = parsed.data;

  const setClauses = ['start_time = ?', 'end_time = ?'];
  const values: (string | number)[] = [start_time, end_time];

  if (crosses_midnight !== undefined) {
    setClauses.push('crosses_midnight = ?');
    values.push(crosses_midnight);
  }

  values.push(Number(req.params.id));

  const result = db.prepare(
    `UPDATE shifts SET ${setClauses.join(', ')} WHERE id = ?`
  ).run(...values);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Shift not found' });
  }

  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
  res.json(shift);
});

export default router;
