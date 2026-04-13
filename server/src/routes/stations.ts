import { Router, type IRouter } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';

const router: IRouter = Router();

const stationSchema = z.object({
  name: z.string().min(1),
  min_staff: z.number().int().min(1).optional(),
  max_staff: z.number().int().min(1).optional(),
  min_staff_am: z.number().int().min(0).optional(),
  min_staff_pm: z.number().int().min(0).optional(),
  min_staff_night: z.number().int().min(0).optional(),
  require_cls: z.number().int().min(0).max(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  abbr: z.string().min(1).max(4).optional(),
});

// List all active stations
router.get('/', (_req, res) => {
  const stations = db.prepare('SELECT * FROM stations WHERE is_active = 1 ORDER BY name').all();
  res.json(stations);
});

// Create station
router.post('/', (req, res) => {
  const parsed = stationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const result = db.prepare('INSERT INTO stations (name) VALUES (?)').run(parsed.data.name);
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(station);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Station name already exists' });
    }
    throw err;
  }
});

// Update station
router.put('/:id', (req, res) => {
  const parsed = stationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const setClauses = ['name = ?'];
  const values: any[] = [parsed.data.name];
  if (parsed.data.min_staff !== undefined) {
    setClauses.push('min_staff = ?');
    values.push(parsed.data.min_staff);
  }
  if (parsed.data.max_staff !== undefined) {
    setClauses.push('max_staff = ?');
    values.push(parsed.data.max_staff);
  }
  if (parsed.data.min_staff_am !== undefined) {
    setClauses.push('min_staff_am = ?');
    values.push(parsed.data.min_staff_am);
  }
  if (parsed.data.min_staff_pm !== undefined) {
    setClauses.push('min_staff_pm = ?');
    values.push(parsed.data.min_staff_pm);
  }
  if (parsed.data.min_staff_night !== undefined) {
    setClauses.push('min_staff_night = ?');
    values.push(parsed.data.min_staff_night);
  }
  if (parsed.data.require_cls !== undefined) {
    setClauses.push('require_cls = ?');
    values.push(parsed.data.require_cls);
  }
  if (parsed.data.color !== undefined) {
    setClauses.push('color = ?');
    values.push(parsed.data.color);
  }
  if (parsed.data.abbr !== undefined) {
    setClauses.push('abbr = ?');
    values.push(parsed.data.abbr);
  }
  values.push(req.params.id);
  const result = db.prepare(`UPDATE stations SET ${setClauses.join(', ')} WHERE id = ? AND is_active = 1`).run(...values);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Station not found' });
  }

  const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
  res.json(station);
});

// Soft-delete station
router.delete('/:id', (req, res) => {
  const result = db.prepare('UPDATE stations SET is_active = 0 WHERE id = ? AND is_active = 1').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Station not found' });
  }
  res.status(204).end();
});

// --- Employee-Station assignments ---

// Get stations for an employee (ordered by priority)
router.get('/employee/:employeeId', (req, res) => {
  const stations = db.prepare(`
    SELECT s.*, es.priority, es.weight FROM stations s
    JOIN employee_stations es ON es.station_id = s.id
    WHERE es.employee_id = ? AND s.is_active = 1
    ORDER BY es.priority
  `).all(req.params.employeeId);
  res.json(stations);
});

// Set stations for an employee (replaces existing)
// Accepts either an array of station IDs (legacy) or an array of { station_id, weight }.
// Weight is 0-100; default 50 when not provided.
const empStationInput = z.union([
  z.array(z.number().int().positive()),
  z.array(z.object({
    station_id: z.number().int().positive(),
    weight: z.number().int().min(0).max(100).optional(),
  })),
]);

router.put('/employee/:employeeId', (req, res) => {
  const parsed = empStationInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Expected array of station IDs or { station_id, weight } objects' });
  }

  const employeeId = Number(req.params.employeeId);

  // Normalize to { station_id, weight } form
  const normalized = parsed.data.map((item, idx) => {
    if (typeof item === 'number') {
      return { station_id: item, weight: 50, priority: idx + 1 };
    }
    return { station_id: item.station_id, weight: item.weight ?? 50, priority: idx + 1 };
  });

  db.transaction(() => {
    db.prepare('DELETE FROM employee_stations WHERE employee_id = ?').run(employeeId);
    const insert = db.prepare('INSERT INTO employee_stations (employee_id, station_id, priority, weight) VALUES (?, ?, ?, ?)');
    for (const item of normalized) {
      insert.run(employeeId, item.station_id, item.priority, item.weight);
    }
  })();

  const stations = db.prepare(`
    SELECT s.*, es.priority, es.weight FROM stations s
    JOIN employee_stations es ON es.station_id = s.id
    WHERE es.employee_id = ? AND s.is_active = 1
    ORDER BY es.priority
  `).all(employeeId);
  res.json(stations);
});

export default router;
