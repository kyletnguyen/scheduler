import { Router, type IRouter } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';
import { generateSchedule, analyzeSchedule } from '../services/scheduleGenerator.js';

const router: IRouter = Router();

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

  // Check time-off conflict (only full-day PTO blocks assignment; partial PTO still works)
  const timeOff = db.prepare(
    "SELECT id, off_type FROM time_off WHERE employee_id = ? AND date = ?"
  ).get(employee_id, date) as any;

  if (timeOff && timeOff.off_type === 'full') {
    return res.status(409).json({ error: 'Employee is on full-day PTO this date' });
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

// Check PTO impact — would this employee taking PTO cause critical coverage gaps?
// Two-pronged check:
//   1. Existing schedule: if they're assigned, what breaks when they're removed?
//   2. Availability pool: even without a schedule, is the remaining staff pool too small?
router.post('/pto-impact', (req, res) => {
  const { employee_id, dates } = req.body;
  if (!employee_id || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'employee_id and dates[] required' });
  }

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id) as any;
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const shifts = db.prepare('SELECT * FROM shifts ORDER BY id').all() as any[];
  const stations = db.prepare("SELECT * FROM stations WHERE is_active = 1 AND name != 'Admin' ORDER BY id").all() as any[];

  const allEmps = db.prepare('SELECT id, name, role, default_shift, employment_type FROM employees WHERE is_active = 1').all() as any[];
  const empRoles = new Map<number, string>();
  const empShifts = new Map<number, string>();
  for (const e of allEmps) {
    empRoles.set(e.id, e.role);
    empShifts.set(e.id, e.default_shift);
  }

  // Load all time-off for the relevant month(s) so we know who else is already off
  const months = [...new Set(dates.map(d => d.substring(0, 7)))];
  const allTimeOff: any[] = [];
  for (const m of months) {
    const rows = db.prepare("SELECT employee_id, date, off_type FROM time_off WHERE date LIKE ? || '%'").all(m);
    allTimeOff.push(...rows);
  }
  const timeOffByDate = new Map<string, Set<number>>();
  for (const t of allTimeOff) {
    if (t.off_type !== 'full') continue;
    if (!timeOffByDate.has(t.date)) timeOffByDate.set(t.date, new Set());
    timeOffByDate.get(t.date)!.add(t.employee_id);
  }

  // Load constraints for blocked days
  const allConstraints = db.prepare(
    "SELECT employee_id, rule_type, rule_value FROM employee_constraints WHERE rule_type = 'blocked_day'"
  ).all() as any[];
  const blockedDays = new Map<number, Set<number>>(); // emp -> set of blocked day-of-week
  for (const c of allConstraints) {
    if (!blockedDays.has(c.employee_id)) blockedDays.set(c.employee_id, new Set());
    blockedDays.get(c.employee_id)!.add(Number(c.rule_value));
  }

  const getCLSNeeded = (station: any, shiftName: string): number => {
    if (shiftName === 'am') return station.min_staff_am ?? station.min_staff ?? 1;
    if (shiftName === 'pm') return station.min_staff_pm ?? station.min_staff ?? 1;
    if (shiftName === 'night') return station.min_staff_night ?? station.min_staff ?? 1;
    return station.min_staff ?? 1;
  };
  const getMLTSlots = (station: any, shiftName: string): number => {
    if (shiftName !== 'am') return 0;
    return station.min_mlt ?? (station.require_cls === 1 ? 1 : 0);
  };

  const getDow = (dateStr: string): number => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  };

  const issues: { date: string; severity: 'critical' | 'warning'; message: string }[] = [];

  for (const date of dates) {
    const dow = getDow(date);

    // ── Check 1: Existing schedule impact ──
    const empAssignment = db.prepare(
      'SELECT sa.*, s.name as shift_name FROM schedule_assignments sa JOIN shifts s ON sa.shift_id = s.id WHERE sa.employee_id = ? AND sa.date = ?'
    ).get(employee_id, date) as any;

    if (empAssignment) {
      const shiftName = empAssignment.shift_name?.toLowerCase() ?? '';

      const allAssignments = db.prepare(`
        SELECT sa.employee_id, sa.station_id, s.name as shift_name
        FROM schedule_assignments sa JOIN shifts s ON sa.shift_id = s.id
        WHERE sa.date = ? AND sa.shift_id = ?
      `).all(date, empAssignment.shift_id) as any[];

      const remainingCount = allAssignments.filter(a => a.employee_id !== employee_id).length;
      const totalNeeded = stations.reduce((sum, st) => sum + getCLSNeeded(st, shiftName) + getMLTSlots(st, shiftName), 0);

      if (remainingCount < totalNeeded) {
        issues.push({
          date, severity: 'critical',
          message: `${empAssignment.shift_name} shift would only have ${remainingCount} of ${totalNeeded} needed staff`,
        });
      }

      if (empAssignment.station_id) {
        const station = stations.find(s => s.id === empAssignment.station_id);
        if (station) {
          const stationRemaining = allAssignments.filter(a => a.station_id === station.id && a.employee_id !== employee_id);
          const minNeeded = getCLSNeeded(station, shiftName) + getMLTSlots(station, shiftName);
          if (stationRemaining.length < minNeeded) {
            issues.push({
              date, severity: 'critical',
              message: `${station.name} would only have ${stationRemaining.length} of ${minNeeded} needed staff on ${empAssignment.shift_name}`,
            });
          }
        }
      }

      if (remainingCount === 0) {
        issues.push({ date, severity: 'critical', message: `No one left to cover ${empAssignment.shift_name} shift` });
      }

      continue; // Already checked via schedule — skip pool check for this date
    }

    // ── Check 2: Available staff pool (no schedule or employee not on it) ──
    const offOnDate = timeOffByDate.get(date) ?? new Set();

    const empShift = employee.default_shift;
    const shiftLabel = empShift === 'am' ? 'AM' : empShift === 'pm' ? 'PM' : empShift === 'night' ? 'Night' : 'AM';

    // Count available staff for this employee's shift on this date
    const availableForShift = allEmps.filter(e => {
      if (e.id === employee_id) return false;
      if (e.default_shift !== empShift && e.default_shift !== 'floater') return false;
      if (offOnDate.has(e.id)) return false;
      if (blockedDays.get(e.id)?.has(dow)) return false;
      if (e.employment_type === 'per-diem') return false;
      return true;
    });

    // Who else from this shift is off on this date?
    const othersOff = allEmps.filter(e => {
      if (e.id === employee_id) return false;
      if (e.default_shift !== empShift) return false;
      if (e.employment_type === 'per-diem') return false;
      return offOnDate.has(e.id);
    });

    const availableCLS = availableForShift.filter(e => e.role === 'cls' || e.role === 'admin');
    const availableMLT = availableForShift.filter(e => e.role === 'mlt');

    const totalCLSNeeded = stations.reduce((sum, st) => sum + getCLSNeeded(st, empShift), 0);
    const totalMLTNeeded = stations.reduce((sum, st) => sum + getMLTSlots(st, empShift), 0);
    const totalNeeded = totalCLSNeeded + totalMLTNeeded;

    // Staff can't work every day — they have weekly hour targets.
    // With a 5-day/40h week, each person covers ~71% of days.
    // So we need roughly: totalNeeded / 0.71 ≈ totalNeeded * 1.4 pool to sustain coverage.
    // Use totalNeeded + 3 as a practical "tight" threshold (allows days off rotation).
    const tightThreshold = totalNeeded + 3;
    const othersOffStr = othersOff.length > 0
      ? ` (also off: ${othersOff.map(e => e.name).join(', ')})`
      : '';

    const spare = availableForShift.length - totalNeeded;

    if (availableForShift.length < totalNeeded) {
      issues.push({
        date, severity: 'critical',
        message: `Not enough staff for ${shiftLabel} — only ${availableForShift.length} available, need ${totalNeeded}${othersOffStr}`,
      });
    } else if (availableCLS.length < totalCLSNeeded) {
      issues.push({
        date, severity: 'critical',
        message: `Not enough CLS for ${shiftLabel} — only ${availableCLS.length} available, need ${totalCLSNeeded}${othersOffStr}`,
      });
    } else if (availableForShift.length < tightThreshold) {
      issues.push({
        date, severity: 'warning',
        message: `${shiftLabel} is thin — only ${spare} extra staff beyond the ${totalNeeded} needed${othersOffStr}`,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueIssues = issues.filter(i => {
    const key = `${i.date}-${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json({
    employee_name: employee.name,
    dates_checked: dates.length,
    issues: uniqueIssues,
    has_critical: uniqueIssues.some(i => i.severity === 'critical'),
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
