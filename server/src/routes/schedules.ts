import { Router } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';
import { generateSchedule, analyzeSchedule } from '../services/scheduleGenerator.js';

const router = Router();

const assignmentSchema = z.object({
  employee_id: z.number().int().positive(),
  shift_id: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  station_id: z.number().int().positive().nullable().optional(),
  force: z.boolean().optional(),
});

// Get all assignments for a month
router.get('/', (req, res) => {
  const month = req.query.month as string; // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month query param required (YYYY-MM)' });
  }

  const assignments = db.prepare(`
    SELECT sa.id, sa.employee_id, sa.shift_id, sa.date, sa.station_id,
           e.name as employee_name, e.employment_type,
           s.name as shift_name, s.start_time, s.end_time,
           st.name as station_name
    FROM schedule_assignments sa
    JOIN employees e ON sa.employee_id = e.id
    JOIN shifts s ON sa.shift_id = s.id
    LEFT JOIN stations st ON sa.station_id = st.id
    WHERE sa.date LIKE ? || '%'
    ORDER BY sa.date, sa.shift_id
  `).all(month);

  res.json(assignments);
});

// Create assignment
router.post('/', (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { employee_id, shift_id, date, station_id, force } = parsed.data;

  // Check time-off conflict
  const timeOff = db.prepare(
    'SELECT id FROM time_off WHERE employee_id = ? AND date = ?'
  ).get(employee_id, date);

  if (timeOff) {
    return res.status(409).json({ error: 'Employee is on time-off this date' });
  }

  // Check duplicate assignment
  const existing = db.prepare(
    'SELECT id FROM schedule_assignments WHERE employee_id = ? AND date = ?'
  ).get(employee_id, date);

  if (existing) {
    return res.status(409).json({ error: 'Employee already assigned on this date' });
  }

  // Check weekend rotation (skip if forced)
  const dayOfWeek = new Date(date + 'T00:00:00').getDay(); // 0=Sun, 6=Sat
  if (!force && (dayOfWeek === 0 || dayOfWeek === 6)) {
    // Find the Sat/Sun of this weekend
    const d = new Date(date + 'T00:00:00');
    const sat = new Date(d);
    const sun = new Date(d);
    if (dayOfWeek === 0) { // Sunday
      sat.setDate(d.getDate() - 1);
      sun.setDate(d.getDate());
    } else { // Saturday
      sat.setDate(d.getDate());
      sun.setDate(d.getDate() + 1);
    }

    // Previous weekend
    const prevSat = new Date(sat); prevSat.setDate(sat.getDate() - 7);
    const prevSun = new Date(sun); prevSun.setDate(sun.getDate() - 7);
    // Next weekend
    const nextSat = new Date(sat); nextSat.setDate(sat.getDate() + 7);
    const nextSun = new Date(sun); nextSun.setDate(sun.getDate() + 7);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const adjacentWeekendDates = [fmt(prevSat), fmt(prevSun), fmt(nextSat), fmt(nextSun)];
    const placeholders = adjacentWeekendDates.map(() => '?').join(',');

    const conflict = db.prepare(
      `SELECT id FROM schedule_assignments WHERE employee_id = ? AND date IN (${placeholders})`
    ).get(employee_id, ...adjacentWeekendDates);

    if (conflict) {
      return res.status(409).json({ error: 'Would violate consecutive weekend rule — employee worked an adjacent weekend' });
    }
  }

  try {
    const result = db.prepare(
      'INSERT INTO schedule_assignments (employee_id, shift_id, date, station_id) VALUES (?, ?, ?, ?)'
    ).run(employee_id, shift_id, date, station_id ?? null);

    const assignment = db.prepare(`
      SELECT sa.id, sa.employee_id, sa.shift_id, sa.date, sa.station_id,
             e.name as employee_name, e.employment_type,
             s.name as shift_name, st.name as station_name
      FROM schedule_assignments sa
      JOIN employees e ON sa.employee_id = e.id
      JOIN shifts s ON sa.shift_id = s.id
      LEFT JOIN stations st ON sa.station_id = st.id
      WHERE sa.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(assignment);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Employee already assigned on this date' });
    }
    throw err;
  }
});

// Get warnings for current assignments
router.get('/warnings', (req, res) => {
  const month = req.query.month as string;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month query param required (YYYY-MM)' });
  }
  const { warnings } = analyzeSchedule(month);
  res.json({ warnings });
});

// Auto-generate schedule for a month
router.post('/generate', (req, res) => {
  const { month, clear } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month required (YYYY-MM)' });
  }

  // Optionally clear existing assignments for the month
  if (clear) {
    db.prepare("DELETE FROM schedule_assignments WHERE date LIKE ? || '%'").run(month);
  }

  const { assignments, warnings } = generateSchedule(month);

  // Batch insert
  const insert = db.prepare('INSERT OR IGNORE INTO schedule_assignments (employee_id, shift_id, date, station_id) VALUES (?, ?, ?, ?)');
  const insertAll = db.transaction(() => {
    let count = 0;
    for (const a of assignments) {
      const result = insert.run(a.employee_id, a.shift_id, a.date, (a as any).station_id ?? null);
      if (result.changes > 0) count++;
    }
    return count;
  });

  const inserted = insertAll();

  res.json({
    generated: assignments.length,
    inserted,
    skipped: assignments.length - inserted,
    warnings,
  });
});

// Delete assignment
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM schedule_assignments WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Assignment not found' });
  }
  res.status(204).end();
});

export default router;
