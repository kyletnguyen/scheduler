import db from '../db/connection.js';

// ─── Types ───

interface Employee {
  id: number;
  name: string;
  employment_type: string;
  target_hours_week: number;
  default_shift: string;
  role: string;
  is_active: number;
}

interface Constraint {
  rule_type: string;
  rule_value: string;
}

interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: number;
}

interface Station {
  id: number;
  name: string;
  min_staff: number;
  max_staff: number;
  require_cls: number;
}

interface Assignment {
  employee_id: number;
  shift_id: number;
  date: string;
  station_id: number | null;
}

// ─── Warning grouping helper ───

function groupWarningsByShift(warnings: string[]): string[] {
  // Extract shift from warning text — pattern: "(AM)", "(PM)", "(Night)", or shift name in text
  const shiftOrder = ['AM', 'PM', 'Night', 'Other'];
  const buckets = new Map<string, string[]>();
  for (const s of shiftOrder) buckets.set(s, []);

  const otherWarnings: string[] = []; // non-shift-specific warnings

  for (const w of warnings) {
    const shiftMatch = w.match(/\((AM|PM|Night)\)/);
    if (shiftMatch) {
      buckets.get(shiftMatch[1])!.push(w);
    } else if (w.includes('AM shift') || w.includes('AM Shift')) {
      buckets.get('AM')!.push(w);
    } else if (w.includes('PM shift') || w.includes('PM Shift')) {
      buckets.get('PM')!.push(w);
    } else if (w.includes('Night shift') || w.includes('Night Shift')) {
      buckets.get('Night')!.push(w);
    } else {
      otherWarnings.push(w);
    }
  }

  const result: string[] = [];
  for (const shift of shiftOrder.slice(0, 3)) {
    const items = buckets.get(shift)!;
    if (items.length === 0) continue;
    const criticals = items.filter(w => w.startsWith('CRITICAL')).length;
    const pivotals = items.filter(w => w.startsWith('PIVOTAL')).length;
    const others = items.length - criticals - pivotals;
    // Unique days with issues
    const datesWithIssues = new Set(items.map(w => {
      const dateMatch = w.match(/\d{4}-\d{2}-\d{2}/);
      return dateMatch ? dateMatch[0] : '';
    }).filter(d => d));

    let summary = `── ${shift}: ${datesWithIssues.size} day(s) with issues`;
    const parts: string[] = [];
    if (criticals > 0) parts.push(`${criticals} critical`);
    if (pivotals > 0) parts.push(`${pivotals} pivotal`);
    if (others > 0) parts.push(`${others} warning`);
    if (parts.length > 0) summary += ` (${parts.join(', ')})`;
    summary += ' ──';

    result.push(summary);
    result.push(...items);
  }

  if (otherWarnings.length > 0) {
    result.push(`── General: ${otherWarnings.length} warning(s) ──`);
    result.push(...otherWarnings);
  }

  return result;
}

// ─── Utilities ───

function getShiftHours(shift: Shift): number {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  let hours = (eh * 60 + em - sh * 60 - sm) / 60;
  if (hours <= 0) hours += 24;
  return hours;
}

function getDow(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay();
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/** Sun-Sat week number: returns the Sunday date string for the week containing dateStr. */
function weekId(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay()); // roll back to Sunday
  return d.toISOString().split('T')[0];
}

/** Get the Saturday date for the weekend containing this date (Sat or Sun). */
function weekendSat(dateStr: string): string {
  const dow = getDow(dateStr);
  if (dow === 0) return addDays(dateStr, -1); // Sunday → previous Saturday
  return dateStr; // Saturday
}

// ─── Constraint helpers ───

function getConstraints(empId: number, constraintMap: Map<number, Constraint[]>): Constraint[] {
  return constraintMap.get(empId) ?? [];
}

function getWeekendAvailability(empId: number, constraintMap: Map<number, Constraint[]>): string {
  const c = getConstraints(empId, constraintMap).find(c => c.rule_type === 'weekend_availability');
  return c?.rule_value ?? 'alternating';
}

function getWeekendGroup(empId: number, constraintMap: Map<number, Constraint[]>): string {
  const c = getConstraints(empId, constraintMap).find(c => c.rule_type === 'weekend_group');
  return c?.rule_value ?? 'auto';
}

function getBlockedDays(empId: number, constraintMap: Map<number, Constraint[]>): Set<number> {
  return new Set(
    getConstraints(empId, constraintMap)
      .filter(c => c.rule_type === 'blocked_day')
      .map(c => Number(c.rule_value))
  );
}

function getAllowedShifts(empId: number, constraintMap: Map<number, Constraint[]>): Set<string> | null {
  const restrictions = getConstraints(empId, constraintMap).filter(c => c.rule_type === 'shift_restriction');
  if (restrictions.length === 0) return null;
  return new Set(restrictions.map(c => c.rule_value));
}

function getWeekendOffPattern(empId: number, constraintMap: Map<number, Constraint[]>): { before: string; after: string } | null {
  const c = getConstraints(empId, constraintMap).find(c => c.rule_type === 'weekend_off_pattern');
  if (!c || c.rule_value === 'auto') return null;
  try {
    const parsed = JSON.parse(c.rule_value);
    return { before: parsed.before ?? 'auto', after: parsed.after ?? 'auto' };
  } catch { return null; }
}

function isCustomBlocked(empId: number, dateStr: string, constraintMap: Map<number, Constraint[]>): boolean {
  for (const c of getConstraints(empId, constraintMap).filter(c => c.rule_type === 'custom_block')) {
    try {
      const { start, end } = JSON.parse(c.rule_value);
      if (dateStr >= start && dateStr <= end) return true;
    } catch {}
  }
  return false;
}

function getRequiredShifts(empId: number, constraintMap: Map<number, Constraint[]>): Map<string, string> {
  const result = new Map<string, string>();
  for (const c of getConstraints(empId, constraintMap).filter(c => c.rule_type === 'required_shift')) {
    try {
      const { date, shift } = JSON.parse(c.rule_value);
      result.set(date, shift);
    } catch {}
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// CLS SWING PATTERN
// ═══════════════════════════════════════════════════════════════
//
// ON weekend (you work Sat+Sun):
//   The pattern alternates between your ON-weekends:
//   Pattern A: OFF Thu (before) + Mon (after) → work Fri,Sat,Sun,Tue,Wed = 5
//   Pattern B: OFF Fri (before) + Tue (after) → work Thu,Sat,Sun,Mon,Wed = 5
//
// OFF weekend (you DON'T work Sat+Sun):
//   Just Sat+Sun off. You work Mon–Fri. The only weekday off-days
//   in this stretch come from the adjacent ON weekends' before/after days.
//
// Groups are staggered with OPPOSITE starting patterns:
//   Group A starts Pattern A, Group B starts Pattern B.
//   This ensures coverage on both Thu and Fri every week.
//
// ═══════════════════════════════════════════════════════════════

function computeSwingOffDays(
  weekendSats: string[],
  onWeekendSet: Set<string>,
  startPatternA: boolean, // Group A = true, Group B = false
  fixedPattern?: { before: string; after: string } | null, // override: fixed off-day pattern
): Set<string> {
  const offDays = new Set<string>();

  // Map day names to Saturday offsets
  const beforeOffset = (pattern: string | undefined, isPatternA: boolean): number => {
    if (pattern === 'thu') return -2;
    if (pattern === 'fri') return -1;
    // auto: alternate based on pattern
    return isPatternA ? -2 : -1; // A=Thu, B=Fri
  };
  const afterOffset = (pattern: string | undefined, isPatternA: boolean): number => {
    if (pattern === 'mon') return 2;
    if (pattern === 'tue') return 3;
    // auto: alternate based on pattern
    return isPatternA ? 2 : 3; // A=Mon, B=Tue
  };

  // Sort on-weekends to alternate pattern per employee's ON-weekends
  const onWeekendsSorted = weekendSats.filter(s => onWeekendSet.has(s));
  const onWeekendPatterns = new Map<string, boolean>(); // true = Pattern A
  for (let i = 0; i < onWeekendsSorted.length; i++) {
    // Alternate: 1st ON = start pattern, 2nd ON = opposite, etc.
    onWeekendPatterns.set(onWeekendsSorted[i], startPatternA ? (i % 2 === 0) : (i % 2 === 1));
  }

  for (const sat of weekendSats) {
    if (onWeekendSet.has(sat)) {
      const isPatternA = onWeekendPatterns.get(sat)!;
      const bOff = beforeOffset(fixedPattern?.before, isPatternA);
      const aOff = afterOffset(fixedPattern?.after, isPatternA);
      offDays.add(addDays(sat, bOff));
      offDays.add(addDays(sat, aOff));
    } else {
      // OFF weekend: just Sat + Sun off, no extra weekday off
      offDays.add(sat);
      offDays.add(addDays(sat, 1));
    }
  }

  return offDays;
}

function determineOnWeekends(
  weekendSats: string[],
  weekendAvail: string,
  groupIndex: number, // employee's index within the alternating group
  onceMonthlyOffset: number = 0, // stagger once_a_month employees across different weekends
): Set<string> {
  if (weekendAvail === 'none') return new Set();
  if (weekendAvail === 'all') return new Set(weekendSats);
  if (weekendAvail === 'once_a_month') {
    if (weekendSats.length === 0) return new Set();
    // Spread once-a-month employees across different weekends
    const idx = onceMonthlyOffset % weekendSats.length;
    return new Set([weekendSats[idx]]);
  }

  // 'alternating' — stagger into two groups
  const startsOn = groupIndex % 2 === 0; // Group A: on even weekends, Group B: on odd
  const result = new Set<string>();
  for (let i = 0; i < weekendSats.length; i++) {
    const isOn = startsOn ? (i % 2 === 0) : (i % 2 === 1);
    if (isOn) result.add(weekendSats[i]);
  }
  return result;
}

// ─── Analyze existing schedule for warnings ───

export function analyzeSchedule(month: string): { warnings: string[] } {
  const warnings: string[] = [];

  const employees = db.prepare('SELECT * FROM employees WHERE is_active = 1').all() as Employee[];
  const shifts = db.prepare('SELECT * FROM shifts ORDER BY id').all() as Shift[];
  const stations = db.prepare('SELECT * FROM stations WHERE is_active = 1 ORDER BY id').all() as Station[];

  const allConstraints = db.prepare(
    'SELECT * FROM employee_constraints WHERE employee_id IN (SELECT id FROM employees WHERE is_active = 1)'
  ).all() as (Constraint & { employee_id: number })[];
  const constraintMap = new Map<number, Constraint[]>();
  for (const c of allConstraints) {
    if (!constraintMap.has(c.employee_id)) constraintMap.set(c.employee_id, []);
    constraintMap.get(c.employee_id)!.push(c);
  }

  const timeOff = db.prepare("SELECT * FROM time_off WHERE date LIKE ? || '%'").all(month) as {
    employee_id: number; date: string; off_type: string;
  }[];

  const empStationRows = db.prepare(`
    SELECT es.employee_id, es.station_id FROM employee_stations es
    JOIN stations s ON es.station_id = s.id WHERE s.is_active = 1
    ORDER BY es.employee_id, es.priority
  `).all() as { employee_id: number; station_id: number }[];
  const empStationMap = new Map<number, number[]>();
  for (const row of empStationRows) {
    if (!empStationMap.has(row.employee_id)) empStationMap.set(row.employee_id, []);
    empStationMap.get(row.employee_id)!.push(row.station_id);
  }
  const allStationIds = stations.map(s => s.id);
  for (const emp of employees) {
    if (!empStationMap.has(emp.id) || empStationMap.get(emp.id)!.length === 0) {
      empStationMap.set(emp.id, [...allStationIds]);
    }
  }

  // Load current assignments
  const result = db.prepare(`
    SELECT sa.employee_id, sa.shift_id, sa.date, sa.station_id
    FROM schedule_assignments sa
    JOIN employees e ON sa.employee_id = e.id
    WHERE sa.date LIKE ? || '%'
  `).all(month) as Assignment[];

  if (result.length === 0) {
    warnings.push('No assignments found for this month');
    return { warnings };
  }

  // Date setup
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  const weekendSatsList = [...new Set(
    dates.filter(d => getDow(d) === 0 || getDow(d) === 6).map(weekendSat)
  )].filter(sat => sat >= dates[0] && sat <= dates[dates.length - 1]).sort();

  // Build indexes
  const assignedDates = new Map<number, Set<string>>();
  for (const emp of employees) assignedDates.set(emp.id, new Set());
  for (const a of result) {
    assignedDates.get(a.employee_id)?.add(a.date);
  }

  const shiftHoursMap = new Map<number, number>();
  for (const s of shifts) shiftHoursMap.set(s.id, getShiftHours(s));

  const weekNumbers = [...new Set(dates.map(weekId))];
  const weekHours = new Map<string, number>();
  for (const a of result) {
    const wk = weekId(a.date);
    const key = `${a.employee_id}-${wk}`;
    weekHours.set(key, (weekHours.get(key) ?? 0) + (shiftHoursMap.get(a.shift_id) ?? 8));
  }

  // Shift+date groups for station analysis
  const shiftDateGroups = new Map<string, Assignment[]>();
  for (const a of result) {
    const key = `${a.shift_id}-${a.date}`;
    if (!shiftDateGroups.has(key)) shiftDateGroups.set(key, []);
    shiftDateGroups.get(key)!.push(a);
  }

  // ── Station warnings (exclude Admin station) ──
  const warnStations = stations.filter(s => s.name !== 'Admin');
  if (warnStations.length > 0) {
    const empRoleMap = new Map<number, string>();
    for (const emp of employees) empRoleMap.set(emp.id, emp.role);

    // Understaffing per station per shift+date
    for (const [, group] of shiftDateGroups) {
      const groupShiftName = shifts.find(s => s.id === group[0].shift_id)?.name?.toLowerCase() ?? '';
      for (const station of warnStations) {
        const minNeeded = groupShiftName === 'am' ? (station as any).min_staff_am ?? station.min_staff ?? 1
          : groupShiftName === 'pm' ? (station as any).min_staff_pm ?? station.min_staff ?? 1
          : groupShiftName === 'night' ? (station as any).min_staff_night ?? station.min_staff ?? 1
          : station.min_staff ?? 1;
        const stationAssignees = group.filter(a => a.station_id === station.id);
        const assigned = stationAssignees.length;
        if (assigned < minNeeded) {
          const dow = getDow(group[0].date);
          const isWkend = dow === 0 || dow === 6;
          const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
          // On weekends, 1 MLT floats between Hema and Chemistry — suppress individual understaffing
          if (!(isWkend && isHemaOrChem)) {
            const shiftName = shifts.find(s => s.id === group[0].shift_id)?.name ?? 'Unknown';
            warnings.push(`CRITICAL: ${station.name} needs ${minNeeded} staff but only ${assigned} assigned on ${group[0].date} (${shiftName})`);
          }
        }
        if (stationAssignees.length > 0) {
          // Check MLT preference for stations that allow MLTs
          const allowsMLT = station.require_cls === 1;
          if (allowsMLT) {
            const hasMLT = stationAssignees.some(a => empRoleMap.get(a.employee_id) === 'mlt');
            if (!hasMLT) {
              // On weekends, MLTs float between Hema and Chemistry — suppress if partner has MLT
              const dow = getDow(group[0].date);
              const isWeekend = dow === 0 || dow === 6;
              const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
              let suppress = false;
              if (isWeekend && isHemaOrChem) {
                // On weekends, 1 MLT floats between Hema and Chemistry —
                // suppress "no MLT" for both stations entirely
                suppress = true;
              }
              if (!suppress) {
                const shiftName = shifts.find(s => s.id === group[0].shift_id)?.name ?? 'Unknown';
                warnings.push(`PIVOTAL: ${station.name} has no MLT assigned on ${group[0].date} (${shiftName})`);
              }
            }
          }
          // Check CLS coverage for stations that require it
          if (station.require_cls === 1) {
            const hasCLS = stationAssignees.some(a => {
              const role = empRoleMap.get(a.employee_id);
              return role === 'cls' || role === 'admin';
            });
            if (!hasCLS) {
              const shiftName = shifts.find(s => s.id === group[0].shift_id)?.name ?? 'Unknown';
              warnings.push(`PIVOTAL: ${station.name} has no CLS assigned on ${group[0].date} (${shiftName})`);
            }
          }
        }
      }
    }

    // Pivotal employee detection (skip Admin)
    for (const station of warnStations) {
      const qualifiedIds = employees.filter(e => empStationMap.get(e.id)?.includes(station.id)).map(e => e.id);
      if (qualifiedIds.length <= 1) {
        const name = qualifiedIds.length === 1 ? employees.find(e => e.id === qualifiedIds[0])?.name : 'No one';
        warnings.push(`CRITICAL: ${name} is the ONLY person qualified for ${station.name} — no backup`);
        continue;
      }
      for (const [, group] of shiftDateGroups) {
        const stationAssignees = group.filter(a => a.station_id === station.id);
        if (stationAssignees.length === 1) {
          // If min_staff is 1, having 1 person is fine — not a pivotal concern
          const groupShiftName = shifts.find(s => s.id === group[0].shift_id)?.name?.toLowerCase() ?? '';
          const minNeeded = groupShiftName === 'am' ? (station as any).min_staff_am ?? station.min_staff ?? 1
            : groupShiftName === 'pm' ? (station as any).min_staff_pm ?? station.min_staff ?? 1
            : groupShiftName === 'night' ? (station as any).min_staff_night ?? station.min_staff ?? 1
            : station.min_staff ?? 1;
          if (minNeeded <= 1) continue; // 1 person meets the requirement

          const pivotal = employees.find(e => e.id === stationAssignees[0].employee_id);
          const others = qualifiedIds.filter(id => id !== stationAssignees[0].employee_id);
          const anyBackup = others.some(id => result.some(r => r.employee_id === id && r.date === stationAssignees[0].date));
          if (!anyBackup) {
            const shiftName = shifts.find(s => s.id === stationAssignees[0].shift_id)?.name ?? 'Unknown';
            warnings.push(`PIVOTAL: ${pivotal?.name} is sole ${station.name} coverage on ${stationAssignees[0].date} (${shiftName})`);
          }
        }
      }
    }

    // Time-off conflicts (skip Admin)
    for (const to of timeOff) {
      const empStations = empStationMap.get(to.employee_id) ?? [];
      if (empStations.length === 0) continue;
      const empName = employees.find(e => e.id === to.employee_id)?.name ?? `Employee #${to.employee_id}`;
      for (const stationId of empStations) {
        const station = warnStations.find(s => s.id === stationId);
        if (!station) continue; // skip Admin
        const others = employees.filter(e => e.id !== to.employee_id && empStationMap.get(e.id)?.includes(stationId));
        const othersWorking = others.filter(e => result.some(r => r.employee_id === e.id && r.date === to.date));
        if (othersWorking.length === 0) {
          warnings.push(`CRITICAL: ${empName} is off ${to.date} but no other ${station.name}-qualified employee is scheduled — deny time-off or reassign coverage`);
        }
      }
    }
  }

  // Hours warnings
  for (const emp of employees) {
    for (const wk of weekNumbers) {
      const key = `${emp.id}-${wk}`;
      const hours = weekHours.get(key) ?? 0;
      if (emp.target_hours_week > 0 && hours > emp.target_hours_week + 10) {
        warnings.push(`${emp.name} has ${hours.toFixed(1)}h in week of ${wk} (target: ${emp.target_hours_week}h)`);
      }
      if (emp.employment_type !== 'per-diem' && emp.target_hours_week > 0) {
        const deficit = emp.target_hours_week - hours;
        if (deficit >= 10) {
          warnings.push(`${emp.name} is ${deficit.toFixed(1)}h under target in week of ${wk}`);
        }
      }
    }
  }

  // Back-to-back weekend check
  for (const emp of employees) {
    const empDates = assignedDates.get(emp.id)!;
    if (!empDates) continue;
    for (let i = 0; i < weekendSatsList.length - 1; i++) {
      const sat1 = weekendSatsList[i], sat2 = weekendSatsList[i + 1];
      const worked1 = empDates.has(sat1) || empDates.has(addDays(sat1, 1));
      const worked2 = empDates.has(sat2) || empDates.has(addDays(sat2, 1));
      if (worked1 && worked2 && getWeekendAvailability(emp.id, constraintMap) === 'alternating') {
        warnings.push(`SCHEDULE ERROR: ${emp.name} works back-to-back weekends (${sat1} and ${sat2})`);
      }
    }
  }

  // Shifts with zero coverage
  for (const dateStr of dates) {
    for (const shift of shifts) {
      if (!result.some(r => r.shift_id === shift.id && r.date === dateStr)) {
        warnings.push(`CRITICAL: No coverage for ${shift.name} shift on ${dateStr}`);
      }
    }
  }

  return { warnings: groupWarningsByShift(warnings) };
}

// ─── Main Generator ───

export function generateSchedule(month: string): { assignments: Assignment[]; warnings: string[] } {
  const warnings: string[] = [];

  // ─── Load data ───
  const employees = db.prepare('SELECT * FROM employees WHERE is_active = 1').all() as Employee[];
  const shifts = db.prepare('SELECT * FROM shifts ORDER BY id').all() as Shift[];
  const allConstraints = db.prepare(
    'SELECT * FROM employee_constraints WHERE employee_id IN (SELECT id FROM employees WHERE is_active = 1)'
  ).all() as (Constraint & { employee_id: number })[];

  const constraintMap = new Map<number, Constraint[]>();
  for (const c of allConstraints) {
    if (!constraintMap.has(c.employee_id)) constraintMap.set(c.employee_id, []);
    constraintMap.get(c.employee_id)!.push(c);
  }

  const timeOff = db.prepare("SELECT * FROM time_off WHERE date LIKE ? || '%'").all(month) as {
    employee_id: number; date: string; off_type: string;
  }[];
  const timeOffSet = new Set(timeOff.map(t => `${t.employee_id}-${t.date}`));

  const stations = db.prepare('SELECT * FROM stations WHERE is_active = 1 ORDER BY id').all() as Station[];
  const empStationRows = db.prepare(`
    SELECT es.employee_id, es.station_id FROM employee_stations es
    JOIN stations s ON es.station_id = s.id WHERE s.is_active = 1
    ORDER BY es.employee_id, es.priority
  `).all() as { employee_id: number; station_id: number }[];

  const empStationMap = new Map<number, number[]>();
  for (const row of empStationRows) {
    if (!empStationMap.has(row.employee_id)) empStationMap.set(row.employee_id, []);
    empStationMap.get(row.employee_id)!.push(row.station_id);
  }

  // If an employee has no station qualifications, treat them as qualified for ALL stations
  const allStationIds = stations.map(s => s.id);
  for (const emp of employees) {
    if (!empStationMap.has(emp.id) || empStationMap.get(emp.id)!.length === 0) {
      empStationMap.set(emp.id, [...allStationIds]);
    }
  }

  // ─── Date setup ───
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${month}-${String(d).padStart(2, '0')}`);
  }

  // Find all unique weekend Saturdays that fall within this month
  const weekendSats = [...new Set(
    dates.filter(d => getDow(d) === 0 || getDow(d) === 6).map(weekendSat)
  )].filter(sat => sat >= dates[0] && sat <= dates[dates.length - 1]).sort();

  // ─── Employee classification ───
  // Supervisors are scheduled like regular employees but get "Admin" station by default
  // They only cover a real station when there's a gap
  const regularEmployees = employees.filter(e => e.employment_type !== 'per-diem');
  const perDiemEmployees = employees.filter(e => e.employment_type === 'per-diem');

  // Build alternating employee list for staggering.
  // Employees with explicit weekend_group (A or B) are placed first so their
  // choice is respected; auto employees fill in remaining slots.
  const alternatingEmployees = employees.filter(e => getWeekendAvailability(e.id, constraintMap) === 'alternating');

  // Resolve each alternating employee's effective group (A=even index, B=odd index)
  const empGroupMap = new Map<number, boolean>(); // true = group A
  let autoIndex = 0;
  for (const emp of alternatingEmployees) {
    const group = getWeekendGroup(emp.id, constraintMap);
    if (group === 'A') {
      empGroupMap.set(emp.id, true);
    } else if (group === 'B') {
      empGroupMap.set(emp.id, false);
    } else {
      // Auto — assign alternating A/B based on position among auto employees
      empGroupMap.set(emp.id, autoIndex % 2 === 0);
      autoIndex++;
    }
  }

  // ─── Pre-compute: weekend on/off + swing off-days for every employee ───
  const employeeOnWeekends = new Map<number, Set<string>>();
  const employeeOffDays = new Map<number, Set<string>>();

  // Stagger once_a_month employees across different weekends
  const onceMonthlyEmployees = employees.filter(e => getWeekendAvailability(e.id, constraintMap) === 'once_a_month');

  for (const emp of employees) {
    const weekendAvail = getWeekendAvailability(emp.id, constraintMap);
    const isGroupA = empGroupMap.get(emp.id) ?? true;
    const groupIndex = isGroupA ? 0 : 1;

    // For once_a_month, each employee gets a different weekend
    const monthlyOffset = weekendAvail === 'once_a_month' ? onceMonthlyEmployees.indexOf(emp) : 0;
    const onWeekends = determineOnWeekends(weekendSats, weekendAvail, groupIndex, monthlyOffset);
    employeeOnWeekends.set(emp.id, onWeekends);

    // Compute swing off-days for full-time/part-time employees only.
    // Per-diem employees don't follow the CLS swing pattern — they just
    // work their target days on any available dates.
    //
    // If an employee already has 2+ blocked weekdays (e.g. Mon+Fri always off),
    // those ARE their weekday off-days — skip the auto-generated swing off-days.
    // The swing pattern only needs to add off-days for employees who don't
    // already have permanent blocked days covering their days off.
    const blockedWeekdays = getBlockedDays(emp.id, constraintMap);
    const blockedWeekdayCount = [...blockedWeekdays].filter(d => d >= 1 && d <= 5).length;

    if (weekendAvail === 'all' || emp.employment_type === 'per-diem' || blockedWeekdayCount >= 2) {
      employeeOffDays.set(emp.id, new Set());
    } else {
      const fixedPattern = getWeekendOffPattern(emp.id, constraintMap);
      const offDays = computeSwingOffDays(weekendSats, onWeekends, isGroupA, fixedPattern);
      employeeOffDays.set(emp.id, offDays);
    }
  }

  // ─── Tracking ───
  const result: Assignment[] = [];
  const weekHours = new Map<string, number>(); // "empId-week" -> hours
  const assignedDates = new Map<number, Set<string>>();
  for (const emp of employees) assignedDates.set(emp.id, new Set());

  function assign(empId: number, shiftId: number, dateStr: string) {
    result.push({ employee_id: empId, shift_id: shiftId, date: dateStr, station_id: null });
    const shift = shifts.find(s => s.id === shiftId)!;
    const key = `${empId}-${weekId(dateStr)}`;
    weekHours.set(key, (weekHours.get(key) ?? 0) + getShiftHours(shift));
    assignedDates.get(empId)!.add(dateStr);

    // Track admin and MLT weekend assignments
    const dow = getDow(dateStr);
    if (dow === 0 || dow === 6) {
      const emp = employees.find(e => e.id === empId);
      if (emp?.role === 'admin') {
        adminWeekendCount.set(dateStr, (adminWeekendCount.get(dateStr) ?? 0) + 1);
      }
      if (emp?.role === 'mlt') {
        mltWeekendCount.set(dateStr, (mltWeekendCount.get(dateStr) ?? 0) + 1);
      }
    }
  }

  function getHours(empId: number, dateStr: string): number {
    return weekHours.get(`${empId}-${weekId(dateStr)}`) ?? 0;
  }

  // Track admin assignments per weekend day — only 1 admin per weekend day
  const adminWeekendCount = new Map<string, number>(); // date -> count of admins assigned
  // Track MLT assignments per weekend day — max 2 MLTs per weekend day
  const mltWeekendCount = new Map<string, number>(); // date -> count of MLTs assigned

  function canWorkDate(empId: number, dateStr: string): boolean {
    if (timeOffSet.has(`${empId}-${dateStr}`)) return false;
    if (getBlockedDays(empId, constraintMap).has(getDow(dateStr))) return false;
    if (isCustomBlocked(empId, dateStr, constraintMap)) return false;

    const dow = getDow(dateStr);
    if (dow === 0 || dow === 6) {
      const sat = weekendSat(dateStr);
      const emp = employees.find(e => e.id === empId);
      // Per-diem: alternating is a preference, not a hard block — they can fill any weekend if needed
      if (!employeeOnWeekends.get(empId)?.has(sat)) {
        if (emp?.employment_type !== 'per-diem') return false;
      }

      // Only 1 admin per weekend day
      if (emp?.role === 'admin' && (adminWeekendCount.get(dateStr) ?? 0) >= 1) {
        return false;
      }
      // Max 2 MLTs per weekend day
      if (emp?.role === 'mlt' && (mltWeekendCount.get(dateStr) ?? 0) >= 2) {
        return false;
      }
    }

    if (employeeOffDays.get(empId)?.has(dateStr)) return false;
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Regular employees (full-time / part-time, non-floater)
  // ═══════════════════════════════════════════════════════════════

  for (const emp of regularEmployees) {
    if (emp.default_shift === 'floater') continue;

    const empShift = shifts.find(s => s.name.toLowerCase() === emp.default_shift);
    if (!empShift) continue;

    const allowed = getAllowedShifts(emp.id, constraintMap);
    if (allowed && !allowed.has(empShift.name.toLowerCase())) {
      warnings.push(`${emp.name} has default shift "${emp.default_shift}" but it's excluded by shift restrictions`);
      continue;
    }

    const requiredShifts = getRequiredShifts(emp.id, constraintMap);
    const targetDays = emp.target_hours_week > 0 ? Math.round(emp.target_hours_week / 8) : Infinity;

    // Step 1: Assign required shifts first (always override)
    for (const dateStr of dates) {
      const reqShiftName = requiredShifts.get(dateStr);
      if (reqShiftName) {
        const reqShift = shifts.find(s => s.name.toLowerCase() === reqShiftName);
        if (reqShift) assign(emp.id, reqShift.id, dateStr);
      }
    }

    // Step 2: Assign ON-weekend pairs (Sat+Sun together) before weekdays
    // Weekends always come as a pair — if you work the weekend, you work both days
    const onWeekends = employeeOnWeekends.get(emp.id)!;
    for (const sat of weekendSats) {
      if (!onWeekends.has(sat)) continue;
      const sun = addDays(sat, 1);
      const satInMonth = dates.includes(sat) && canWorkDate(emp.id, sat) && !assignedDates.get(emp.id)!.has(sat);
      const sunInMonth = dates.includes(sun) && canWorkDate(emp.id, sun) && !assignedDates.get(emp.id)!.has(sun);

      if (satInMonth && sunInMonth) {
        // Check both days fit within their respective week caps
        const satWk = weekId(sat);
        const sunWk = weekId(sun);
        const satWkDays = dates.filter(d => weekId(d) === satWk && assignedDates.get(emp.id)!.has(d)).length;
        const sunWkDays = dates.filter(d => weekId(d) === sunWk && assignedDates.get(emp.id)!.has(d)).length;

        if ((targetDays === Infinity || satWkDays < targetDays) &&
            (targetDays === Infinity || sunWkDays < targetDays)) {
          assign(emp.id, empShift.id, sat);
          assign(emp.id, empShift.id, sun);
        }
      }
    }

    // Step 3: Fill remaining weekday slots up to target
    for (const dateStr of dates) {
      if (assignedDates.get(emp.id)!.has(dateStr)) continue;
      if (!canWorkDate(emp.id, dateStr)) continue;

      // Skip weekends — already handled as pairs above
      const dow = getDow(dateStr);
      if (dow === 0 || dow === 6) continue;

      // Respect weekly day cap
      if (targetDays < Infinity) {
        const wk = weekId(dateStr);
        const wkDays = dates.filter(d => weekId(d) === wk && assignedDates.get(emp.id)!.has(d)).length;
        if (wkDays >= targetDays) continue;
      }

      assign(emp.id, empShift.id, dateStr);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Floaters + per-diem fill gaps
  // ═══════════════════════════════════════════════════════════════

  // Phase 2 only uses floaters for gap-fill. Per-diem employees are
  // handled in Phase 2.5 to ensure consistent days across all weeks.
  const fillEmployees = regularEmployees.filter(e => e.default_shift === 'floater');

  for (const dateStr of dates) {
    for (const shift of shifts) {
      // Skip if someone is already on this shift+date
      if (result.some(r => r.shift_id === shift.id && r.date === dateStr)) continue;

      const candidates = fillEmployees.filter(f => {
        if (assignedDates.get(f.id)!.has(dateStr)) return false;
        if (!canWorkDate(f.id, dateStr)) return false;

        const allowed = getAllowedShifts(f.id, constraintMap);
        if (allowed && !allowed.has(shift.name.toLowerCase())) return false;

        // Day cap (target_hours / 8 = max days per week)
        if (f.target_hours_week > 0) {
          const maxDays = Math.round(f.target_hours_week / 8);
          const wk = weekId(dateStr);
          const wkDays = dates.filter(d => weekId(d) === wk && assignedDates.get(f.id)!.has(d)).length;
          if (wkDays >= maxDays) return false;
        }

        return true;
      });

      if (candidates.length === 0) continue;

      // Sort: prefer matching default shift, then regular over per-diem, then fewest hours
      candidates.sort((a, b) => {
        const aMatch = a.default_shift === shift.name.toLowerCase() ? 0 : 1;
        const bMatch = b.default_shift === shift.name.toLowerCase() ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;

        const aPri = a.employment_type === 'per-diem' ? 1 : 0;
        const bPri = b.employment_type === 'per-diem' ? 1 : 0;
        if (aPri !== bPri) return aPri - bPri;

        return getHours(a.id, dateStr) - getHours(b.id, dateStr);
      });

      assign(candidates[0].id, shift.id, dateStr);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2.5: Ensure every employee hits target days EACH week
  // ═══════════════════════════════════════════════════════════════
  // target_hours_week / 8 = target days per week. For per-diem
  // employees this guarantees consistent coverage (e.g. 16h = 2
  // days every week, not 3 one week and 1 the next).

  const weekNumbers = [...new Set(dates.map(weekId))];

  for (const emp of [...regularEmployees, ...perDiemEmployees]) {
    if (emp.target_hours_week <= 0) continue;

    const targetDays = Math.round(emp.target_hours_week / 8);

    // Determine which shift to use
    let empShift: Shift | undefined;
    if (emp.default_shift !== 'floater' && emp.employment_type !== 'per-diem') {
      empShift = shifts.find(s => s.name.toLowerCase() === emp.default_shift);
      if (!empShift) continue;
      const allowed = getAllowedShifts(emp.id, constraintMap);
      if (allowed && !allowed.has(empShift.name.toLowerCase())) continue;
    }

    // Helper: resolve which shift to assign for this employee on a date
    const resolveShift = (dateStr: string): Shift | undefined => {
      if (empShift) return empShift;
      const allowed = getAllowedShifts(emp.id, constraintMap);
      const candidates = shifts.filter(s => !allowed || allowed.has(s.name.toLowerCase()));
      if (candidates.length === 0) return undefined;
      const defaultMatch = candidates.find(s => s.name.toLowerCase() === emp.default_shift);
      if (defaultMatch) return defaultMatch;
      // Pick shift with fewest people on this date
      candidates.sort((a, b) => {
        const aCount = result.filter(r => r.shift_id === a.id && r.date === dateStr).length;
        const bCount = result.filter(r => r.shift_id === b.id && r.date === dateStr).length;
        return aCount - bCount;
      });
      return candidates[0];
    };

    // Per-diem: assign ON-weekend pairs (Sat+Sun) upfront before weekly fill.
    // Weekend days always come as a pair — if you work the weekend, you work both days.
    if (emp.employment_type === 'per-diem') {
      const onWeekends = employeeOnWeekends.get(emp.id)!;
      for (const sat of weekendSats) {
        if (!onWeekends.has(sat)) continue;
        const sun = addDays(sat, 1);
        const satInMonth = dates.includes(sat);
        const sunInMonth = dates.includes(sun);
        if (!satInMonth && !sunInMonth) continue;

        // Check the week containing Saturday — does it have room?
        const satWeek = weekId(sat);
        const satWkDates = dates.filter(d => weekId(d) === satWeek);
        const satWkAssigned = satWkDates.filter(d => assignedDates.get(emp.id)!.has(d)).length;

        // Sunday is in the next week (Sun starts a new Sun-Sat week)
        const sunWeek = weekId(sun);
        const sunWkDates = dates.filter(d => weekId(d) === sunWeek);
        const sunWkAssigned = sunWkDates.filter(d => assignedDates.get(emp.id)!.has(d)).length;

        // Only assign if both days fit in their respective weeks AND pass availability checks
        if (satInMonth && canWorkDate(emp.id, sat) && satWkAssigned < targetDays &&
            sunInMonth && canWorkDate(emp.id, sun) && sunWkAssigned < targetDays) {
          const satShift = resolveShift(sat);
          const sunShift = resolveShift(sun);
          if (satShift && sunShift) {
            assign(emp.id, satShift.id, sat);
            assign(emp.id, sunShift.id, sun);
          }
        }
      }
    }

    // Fill remaining target days per week with weekdays
    for (const wk of weekNumbers) {
      const wkDates = dates.filter(d => weekId(d) === wk);
      let assigned = wkDates.filter(d => assignedDates.get(emp.id)!.has(d)).length;

      if (assigned >= targetDays) continue;

      const available = wkDates.filter(d => {
        if (assignedDates.get(emp.id)!.has(d)) return false;
        if (!canWorkDate(emp.id, d)) return false;
        // Per-diem: skip individual weekend days (weekends handled as pairs above)
        if (emp.employment_type === 'per-diem') {
          const dow = getDow(d);
          if (dow === 0 || dow === 6) return false;
        }
        return true;
      });

      available.sort((a, b) => {
        // Per-diem: prefer days with fewest total staff (fill gaps on thin days)
        if (emp.employment_type === 'per-diem') {
          const aCount = result.filter(r => r.date === a).length;
          const bCount = result.filter(r => r.date === b).length;
          if (aCount !== bCount) return aCount - bCount; // lowest headcount first
        }
        const aHasGap = shifts.some(s => !result.some(r => r.shift_id === s.id && r.date === a)) ? 0 : 1;
        const bHasGap = shifts.some(s => !result.some(r => r.shift_id === s.id && r.date === b)) ? 0 : 1;
        return aHasGap - bHasGap;
      });

      for (const dateStr of available) {
        if (assigned >= targetDays) break;
        const shiftToUse = resolveShift(dateStr);
        if (!shiftToUse) continue;
        assign(emp.id, shiftToUse.id, dateStr);
        assigned++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Station assignment — layered pipeline
  // Each day+shift is processed through 7 layers in order.
  // Each layer locks its assignments so later layers cannot undo them.
  // Multi-pass: run 25 passes with shuffled orderings, keep best.
  // ═══════════════════════════════════════════════════════════════

  const NUM_STATION_PASSES = 25;

  // Helper: shuffle array (Fisher-Yates)
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Helper: is this employee CLS-equivalent? (CLS or admin role)
  const isCLSRole = (empId: number, empRoleMap: Map<number, string>) => {
    const r = empRoleMap.get(empId);
    return r === 'cls' || r === 'admin';
  };

  // Helper: get min staff for a station on a given shift
  // min_staff_am/pm/night = number of CLS needed for that shift
  const getCLSNeeded = (station: Station, shiftName: string): number => {
    if (shiftName === 'am') return (station as any).min_staff_am ?? station.min_staff ?? 1;
    if (shiftName === 'pm') return (station as any).min_staff_pm ?? station.min_staff ?? 1;
    if (shiftName === 'night') return (station as any).min_staff_night ?? station.min_staff ?? 1;
    return station.min_staff ?? 1;
  };
  // MLT slots: 1 if station allows MLTs (require_cls=1), 0 otherwise
  const getMLTSlots = (station: Station): number => {
    return (station as any).min_mlt ?? (station.require_cls === 1 ? 1 : 0);
  };
  // Total staff = CLS needed + MLT slots
  const getMinStaff = (station: Station, shiftName: string): number => {
    return getCLSNeeded(station, shiftName) + getMLTSlots(station);
  };
  // Max CLS = CLS needed (exact, no overstaffing)
  const getMaxCLS = (station: Station, shiftName: string): number => {
    return getCLSNeeded(station, shiftName);
  };

  // Helper: count criticals + pivotals + rotation penalty for scoring passes
  const scorePass = (
    assignments: Assignment[],
    stns: typeof stations,
    shfts: typeof shifts,
    empRoleMap: Map<number, string>,
  ): { criticals: number; pivotals: number; rotationPenalty: number; total: number } => {
    const realStns = stns.filter(s => s.name !== 'Admin');
    const adminStn = stns.find(s => s.name === 'Admin');
    let criticals = 0;
    let pivotals = 0;

    const groups = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const key = `${a.shift_id}-${a.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }

    for (const [, group] of groups) {
      const shiftName = shfts.find(s => s.id === group[0].shift_id)?.name?.toLowerCase() ?? '';
      for (const station of realStns) {
        const minNeeded = getMinStaff(station, shiftName);
        const maxAllowed = getMinStaff(station, shiftName);
        const stationAssignees = group.filter(a => a.station_id === station.id);

        // Understaffed
        if (stationAssignees.length < minNeeded) {
          const dow = getDow(group[0].date);
          const isWkend = dow === 0 || dow === 6;
          const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
          if (!(isWkend && isHemaOrChem)) criticals++;
        }
        // Overstaffed
        if (stationAssignees.length > maxAllowed) criticals += 10;
        // 2+ MLTs at same station
        const mltCount = stationAssignees.filter(a => empRoleMap.get(a.employee_id) === 'mlt').length;
        if (mltCount > 1) criticals += 3 * (mltCount - 1);
        // Missing CLS at require_cls station
        if (station.require_cls === 1 && stationAssignees.length > 0) {
          if (!stationAssignees.some(a => isCLSRole(a.employee_id, empRoleMap))) pivotals++;
        }
      }
    }

    // Rotation penalty
    let rotationPenalty = 0;
    const empWeekStation = new Map<string, Map<string, number>>();
    for (const a of assignments) {
      if (a.station_id === null || (adminStn && a.station_id === adminStn.id)) continue;
      const ws = (() => { const d = new Date(a.date + 'T12:00:00'); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })();
      const key = `${a.employee_id}-${a.shift_id}`;
      if (!empWeekStation.has(key)) empWeekStation.set(key, new Map());
      empWeekStation.get(key)!.set(ws, a.station_id);
    }
    for (const [empKey, weekMap] of empWeekStation) {
      const empId = parseInt(empKey.split('-')[0]);
      const realQual = (empStationMap.get(empId) ?? []).filter(sid => !adminStn || sid !== adminStn.id);
      if (realQual.length <= 1) continue;
      const weeks = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (let i = 1; i < weeks.length; i++) {
        if (weeks[i][1] === weeks[i - 1][1]) rotationPenalty += 2;
      }
      const uniqueStations = new Set(weeks.map(w => w[1])).size;
      if (realQual.length >= 3 && weeks.length >= 3 && uniqueStations <= 2) rotationPenalty += 3;
    }

    return {
      criticals,
      pivotals,
      rotationPenalty,
      total: criticals * 10000 + pivotals * 100 + rotationPenalty,
    };
  };

  let bestStationAssignments: Map<string, number> | null = null;
  let bestScore = Infinity;

  if (stations.length > 0) {
    // ── Stable data computed once before multi-pass loop ──
    const empRoleMap = new Map<number, string>();
    for (const emp of employees) empRoleMap.set(emp.id, emp.role);
    const adminStation = stations.find(s => s.name === 'Admin');
    const realStations = stations.filter(s => s.name !== 'Admin');
    const bloodBankStation = stations.find(s => s.name === 'Blood Bank');

    // Helper: is employee admin-parked? (first station = Admin but role != admin, e.g. Shayna)
    const isAdminParked = (empId: number) => {
      const quals = empStationMap.get(empId);
      return quals && adminStation && quals[0] === adminStation.id && empRoleMap.get(empId) !== 'admin';
    };

    // Helper: get bench qualifications (stations excluding Admin)
    const getBenchQuals = (empId: number) =>
      (empStationMap.get(empId) ?? []).filter(sid => !adminStation || sid !== adminStation.id);

    // Seed rotation history from previous month's DB data
    const seedHistory = new Map<string, number>(); // "empId-stationId" -> count
    const [yearNum, monNum] = month.split('-').map(Number);
    const prevMonth = monNum === 1
      ? `${yearNum - 1}-12`
      : `${yearNum}-${String(monNum - 1).padStart(2, '0')}`;
    const prevAssigns = db.prepare(`
      SELECT sa.employee_id, sa.station_id, sa.date
      FROM schedule_assignments sa
      WHERE sa.date LIKE ? || '%' AND sa.station_id IS NOT NULL
      ORDER BY sa.date
    `).all(prevMonth) as { employee_id: number; station_id: number; date: string }[];

    const getWeekStart = (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00');
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().slice(0, 10);
    };

    const prevWeekStations = new Map<string, number>();
    for (const pa of prevAssigns) {
      const ws = getWeekStart(pa.date);
      prevWeekStations.set(`${pa.employee_id}-${ws}-${pa.station_id}`, 1);
    }
    for (const [key] of prevWeekStations) {
      const parts = key.split('-');
      const empId = parts[0];
      const stationId = parts[parts.length - 1];
      const hk = `${empId}-${stationId}`;
      seedHistory.set(hk, (seedHistory.get(hk) ?? 0) + 1);
    }

    // Seed last-week station tracking
    const seedLastWeekStation = new Map<number, number>(); // empId -> stationId
    if (prevAssigns.length > 0) {
      const lastPrevDate = prevAssigns[prevAssigns.length - 1].date;
      const lastPrevWeek = getWeekStart(lastPrevDate);
      for (const pa of prevAssigns) {
        if (getWeekStart(pa.date) === lastPrevWeek && pa.station_id) {
          seedLastWeekStation.set(pa.employee_id, pa.station_id);
        }
      }
    }

    // Group assignments by shift+date
    const shiftDateGroups = new Map<string, Assignment[]>();
    for (const a of result) {
      const key = `${a.shift_id}-${a.date}`;
      if (!shiftDateGroups.has(key)) shiftDateGroups.set(key, []);
      shiftDateGroups.get(key)!.push(a);
    }

    // Sort day+shift groups chronologically
    const sortedGroupKeys = [...shiftDateGroups.keys()].sort((a, b) => {
      const aDate = a.substring(a.indexOf('-') + 1);
      const bDate = b.substring(b.indexOf('-') + 1);
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.localeCompare(b);
    });

    // ══════════════════════════════════════════════════════════════
    // LAYER FUNCTIONS — each processes one day+shift group
    // ══════════════════════════════════════════════════════════════

    // ── Layer 1: Blood Bank — assign exactly 1 CLS, rotate fairly ──
    function layer1_bloodBank(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      bbRotation: Map<number, number>,
      passIdx: number,
    ) {
      if (!bloodBankStation) return;
      const bbQualified = pool.filter(a =>
        !locked.has(a.employee_id)
        && isCLSRole(a.employee_id, empRoleMap)
        && empRoleMap.get(a.employee_id) !== 'mlt'
        && empStationMap.get(a.employee_id)!.includes(bloodBankStation.id)
        && !isAdminParked(a.employee_id)
        && employees.find(e => e.id === a.employee_id)?.employment_type !== 'per-diem'
      );
      if (bbQualified.length === 0) return;

      // Sort by fewest BB assignments (fair rotation), break ties by shuffle on subsequent passes
      const sorted = [...bbQualified].sort((a, b) => {
        const aCount = bbRotation.get(a.employee_id) ?? 0;
        const bCount = bbRotation.get(b.employee_id) ?? 0;
        if (aCount !== bCount) return aCount - bCount;
        // On pass 0 use stable order; on later passes, randomize ties
        return passIdx === 0 ? a.employee_id - b.employee_id : Math.random() - 0.5;
      });

      const chosen = sorted[0];
      stationMap.set(chosen.employee_id, bloodBankStation.id);
      locked.add(chosen.employee_id);
      bbRotation.set(chosen.employee_id, (bbRotation.get(chosen.employee_id) ?? 0) + 1);
    }

    // ── Layer 2: MLT Placement — exactly 1 MLT per require_cls station ──
    function layer2_mltPlacement(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      mltHistory: Map<string, number>,
      lastWeekMLT: Map<number, number>,
      passIdx: number,
    ) {
      const mltStations = realStations.filter(s => s.require_cls === 1);
      // Available MLTs: not locked, not admin-parked, not per-diem, actual MLT role
      const availableMLTs = pool
        .filter(a =>
          !locked.has(a.employee_id)
          && empRoleMap.get(a.employee_id) === 'mlt'
          && !isAdminParked(a.employee_id)
          && employees.find(e => e.id === a.employee_id)?.employment_type !== 'per-diem'
        )
        .map(a => a.employee_id);

      // Deduplicate (same employee may appear in pool for multiple days in the week)
      const mltPool = [...new Set(availableMLTs)];

      // Pre-lock MLTs with only 1 bench station — they MUST go there
      const lockedMLTStations = new Set<number>();
      for (const empId of mltPool) {
        const benchQuals = getBenchQuals(empId).filter(sid =>
          mltStations.some(s => s.id === sid)
        );
        if (benchQuals.length === 1) {
          stationMap.set(empId, benchQuals[0]);
          locked.add(empId);
          lockedMLTStations.add(benchQuals[0]);
        }
      }

      // Brute-force optimizer for remaining MLTs (pool is small: ~3 stations x ~3 MLTs)
      const remainingMLTs = mltPool.filter(id => !locked.has(id));
      const remainingStations = mltStations.filter(s => !lockedMLTStations.has(s.id));

      if (remainingMLTs.length === 0 || remainingStations.length === 0) return;

      let bestAssignment = new Map<number, number>();
      let bestMLTScore = Infinity;

      const tryAssign = (stIdx: number, assignment: Map<number, number>, used: Set<number>) => {
        if (stIdx >= remainingStations.length) {
          let score = 0;
          for (const [empId, stationId] of assignment) {
            const hist = mltHistory.get(`${empId}-${stationId}`) ?? 0;
            score += hist * hist;
            if (lastWeekMLT.get(empId) === stationId) score += 10000;
          }
          // Penalize unfilled stations
          score += (remainingStations.length - assignment.size) * 1000;
          // Penalize 2+ MLTs at same station
          const counts = new Map<number, number>();
          for (const [, sid] of assignment) counts.set(sid, (counts.get(sid) ?? 0) + 1);
          for (const [, c] of counts) if (c > 1) score += 50000 * (c - 1);

          if (score < bestMLTScore) {
            bestMLTScore = score;
            bestAssignment = new Map(assignment);
          }
          return;
        }

        const station = remainingStations[stIdx];
        let candidates = remainingMLTs.filter(id =>
          !used.has(id) && empStationMap.get(id)!.includes(station.id)
        );
        // Shuffle candidates on later passes
        if (passIdx > 0) candidates = shuffle(candidates);

        for (const cand of candidates) {
          assignment.set(cand, station.id);
          used.add(cand);
          tryAssign(stIdx + 1, assignment, used);
          assignment.delete(cand);
          used.delete(cand);
        }
        // Try leaving this station without an MLT (if no candidate fits)
        tryAssign(stIdx + 1, assignment, used);
      };

      tryAssign(0, new Map(), new Set());

      for (const [empId, stationId] of bestAssignment) {
        stationMap.set(empId, stationId);
        locked.add(empId);
        mltHistory.set(`${empId}-${stationId}`, (mltHistory.get(`${empId}-${stationId}`) ?? 0) + 1);
      }
    }

    // ── Layer 3: Admin Placement — default to Admin, cover CLS gaps if needed ──
    function layer3_adminPlacement(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      shiftName: string,
    ) {
      if (!adminStation) return;

      const adminEmps = pool.filter(a =>
        !locked.has(a.employee_id) && empRoleMap.get(a.employee_id) === 'admin'
      );

      // Default all admins to Admin station
      for (const a of adminEmps) {
        stationMap.set(a.employee_id, adminStation.id);
      }

      // Look ahead: which bench stations will have 0 CLS after Layer 4?
      // Count unlocked CLS available for each station
      const unlockedCLS = pool.filter(a =>
        !locked.has(a.employee_id)
        && empRoleMap.get(a.employee_id) === 'cls'
        && employees.find(e => e.id === a.employee_id)?.employment_type !== 'per-diem'
        && !isAdminParked(a.employee_id)
      ).map(a => a.employee_id);
      const uniqueCLS = [...new Set(unlockedCLS)];

      for (const station of realStations) {
        if (station.require_cls !== 1) continue;
        const minNeeded = getMinStaff(station, shiftName);
        // How many CLS (non-admin) are qualified and available for this station?
        const clsForStation = uniqueCLS.filter(id => empStationMap.get(id)!.includes(station.id));
        // How many MLTs are already placed here?
        const mltsHere = [...stationMap.entries()].filter(([, sid]) => sid === station.id).length;
        const slotsForCLS = Math.max(0, minNeeded - mltsHere);

        if (clsForStation.length < slotsForCLS) {
          // This station will be short on CLS — pull an admin
          const coverAdmin = adminEmps.find(a =>
            stationMap.get(a.employee_id) === adminStation.id // currently at Admin
            && empStationMap.get(a.employee_id)!.includes(station.id)
          );
          if (coverAdmin) {
            stationMap.set(coverAdmin.employee_id, station.id);
          }
        }
      }

      // Lock all admins (whether at Admin or bench)
      for (const a of adminEmps) locked.add(a.employee_id);
    }

    // ── Layer 4: CLS Rotation — fill bench with CLS, optimize diversity ──
    function layer4_clsRotation(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      rotHistory: Map<string, number>,
      lastWeekStation: Map<number, number>,
      weekStationThisWeek: Map<number, number>,
      shiftName: string,
      passIdx: number,
    ) {
      const clsEmps = pool.filter(a =>
        !locked.has(a.employee_id)
        && empRoleMap.get(a.employee_id) === 'cls'
        && employees.find(e => e.id === a.employee_id)?.employment_type !== 'per-diem'
        && !isAdminParked(a.employee_id)
      );
      const uniqueCLSIds = [...new Set(clsEmps.map(a => a.employee_id))];

      // Sort: pass 0 = most-constrained-first, subsequent passes = shuffled
      let orderedCLS: number[];
      if (passIdx === 0) {
        orderedCLS = [...uniqueCLSIds].sort((a, b) => getBenchQuals(a).length - getBenchQuals(b).length);
      } else {
        orderedCLS = shuffle(uniqueCLSIds);
      }

      // Count current station occupancy from stationMap
      const stationCount = new Map<number, number>();
      for (const [, sid] of stationMap) {
        stationCount.set(sid, (stationCount.get(sid) ?? 0) + 1);
      }

      for (const empId of orderedCLS) {
        const quals = getBenchQuals(empId);
        if (quals.length === 0) continue;

        let bestStation = -1;
        let bestStationScore = Infinity;

        for (const sid of quals) {
          const station = realStations.find(s => s.id === sid);
          if (!station) continue;

          const current = stationCount.get(sid) ?? 0;
          const minNeeded = getMinStaff(station, shiftName);
          // CLS cap: reserve MLT slots (e.g., Micro max 3 with 1 MLT = 2 CLS max)
          const clsCount = [...stationMap.entries()].filter(([eid, s]) =>
            s === sid && isCLSRole(eid, empRoleMap)
          ).length;
          const maxCLS = getMaxCLS(station, shiftName);

          // Hard block: CLS slots full
          if (clsCount >= maxCLS) continue;

          let score = 0;

          // Staffing need: negative = urgently needs people (must dominate rotation concerns)
          if (current < minNeeded) score -= 5000 * (minNeeded - current);
          else score += 100;

          // Rotation history
          const hist = rotHistory.get(`${empId}-${sid}`) ?? 0;
          score += hist * 150;

          // Consecutive penalty: same station as last week
          if (lastWeekStation.get(empId) === sid) score += 1500;

          // Weekly consistency: bonus if same station earlier this week
          if (weekStationThisWeek.get(empId) === sid) score -= 300;

          // Diversity: never-visited stations get a bonus
          const allHist = quals.map(q => rotHistory.get(`${empId}-${q}`) ?? 0);
          const minHist = Math.min(...allHist);
          if (hist === 0) score -= 800;
          // Imbalance penalty
          const imbalance = hist - minHist;
          score += imbalance * imbalance * 300;

          // Scarcity: stations with fewer qualified staff get a boost
          const qualifiedCount = employees.filter(e =>
            empStationMap.get(e.id)?.includes(sid) && e.role !== 'admin'
          ).length;
          score -= (5 - Math.min(qualifiedCount, 5)) * 30;

          if (score < bestStationScore) {
            bestStationScore = score;
            bestStation = sid;
          }
        }

        if (bestStation >= 0) {
          stationMap.set(empId, bestStation);
          locked.add(empId);
          stationCount.set(bestStation, (stationCount.get(bestStation) ?? 0) + 1);
          rotHistory.set(`${empId}-${bestStation}`, (rotHistory.get(`${empId}-${bestStation}`) ?? 0) + 1);
          weekStationThisWeek.set(empId, bestStation);
        }
      }

      // Swap improvement pass: try swapping pairs to improve rotation
      for (const empA of orderedCLS) {
        if (!stationMap.has(empA)) continue;
        const stA = stationMap.get(empA)!;
        const histA = rotHistory.get(`${empA}-${stA}`) ?? 0;
        const consecA = lastWeekStation.get(empA) === stA ? 1 : 0;
        const scoreA = histA * histA + consecA * 10;

        for (const empB of orderedCLS) {
          if (empA >= empB || !stationMap.has(empB)) continue;
          const stB = stationMap.get(empB)!;
          if (stA === stB) continue;

          // Check both can work at each other's station
          if (!getBenchQuals(empA).includes(stB)) continue;
          if (!getBenchQuals(empB).includes(stA)) continue;

          const histB = rotHistory.get(`${empB}-${stB}`) ?? 0;
          const consecB = lastWeekStation.get(empB) === stB ? 1 : 0;
          const scoreBefore = histA * histA + consecA * 10 + histB * histB + consecB * 10;

          const newHistA = rotHistory.get(`${empA}-${stB}`) ?? 0;
          const newConsecA = lastWeekStation.get(empA) === stB ? 1 : 0;
          const newHistB = rotHistory.get(`${empB}-${stA}`) ?? 0;
          const newConsecB = lastWeekStation.get(empB) === stA ? 1 : 0;
          const scoreAfter = newHistA * newHistA + newConsecA * 10 + newHistB * newHistB + newConsecB * 10;

          if (scoreAfter < scoreBefore) {
            // Undo old history
            rotHistory.set(`${empA}-${stA}`, Math.max(0, (rotHistory.get(`${empA}-${stA}`) ?? 1) - 1));
            rotHistory.set(`${empB}-${stB}`, Math.max(0, (rotHistory.get(`${empB}-${stB}`) ?? 1) - 1));
            // Apply swap
            stationMap.set(empA, stB);
            stationMap.set(empB, stA);
            rotHistory.set(`${empA}-${stB}`, (rotHistory.get(`${empA}-${stB}`) ?? 0) + 1);
            rotHistory.set(`${empB}-${stA}`, (rotHistory.get(`${empB}-${stA}`) ?? 0) + 1);
            weekStationThisWeek.set(empA, stB);
            weekStationThisWeek.set(empB, stA);
            break; // one swap per employee
          }
        }
      }
    }

// ── Gap-Fill: pull admins to bench + reshuffle CLS to fix understaffing ──
    function gapFill(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      shiftName: string,
    ) {
      if (!adminStation) return;

      const getUnderstaffed = () => realStations.filter(s => {
        const current = [...stationMap.values()].filter(v => v === s.id).length;
        return current < getMinStaff(s, shiftName);
      });

      let understaffed = getUnderstaffed();
      if (understaffed.length === 0) return;

      // Phase 1: Proactively move admins from desk to their bench station to create surplus
      // This enables chain swaps later (e.g., Darwin→Chem creates surplus, then Mike→BB, Vannie→Micro)
      const adminsAtDesk = () => pool.filter(a =>
        stationMap.get(a.employee_id) === adminStation.id
        && empRoleMap.get(a.employee_id) === 'admin'
      );

      // First try direct: admin qualified for the understaffed station
      for (const needyStation of understaffed) {
        const admin = adminsAtDesk().find(a =>
          (empStationMap.get(a.employee_id) ?? []).includes(needyStation.id)
        );
        if (admin) stationMap.set(admin.employee_id, needyStation.id);
      }

      understaffed = getUnderstaffed();
      if (understaffed.length === 0) return;

      // Then try indirect: admin → their bench station (even if not understaffed) to create surplus
      for (const admin of adminsAtDesk()) {
        const benchQuals = (empStationMap.get(admin.employee_id) ?? [])
          .filter(sid => sid !== adminStation.id);
        if (benchQuals.length === 0) continue;

        // Move admin to their bench station — this creates surplus enabling CLS reshuffles
        const targetSid = benchQuals[0];
        const targetStation = realStations.find(s => s.id === targetSid);
        if (targetStation) {
          const current = [...stationMap.values()].filter(v => v === targetSid).length;
          if (current < getMinStaff(targetStation, shiftName)) {
            stationMap.set(admin.employee_id, targetSid);
          }
        }
      }

      // Phase 2: CLS reshuffle — move CLS from surplus stations to understaffed ones
      understaffed = getUnderstaffed();
      for (const needyStation of understaffed) {
        const deficit = getMinStaff(needyStation, shiftName)
          - [...stationMap.values()].filter(v => v === needyStation.id).length;
        if (deficit <= 0) continue;

        for (const [eid, sid] of [...stationMap.entries()]) {
          if (sid === needyStation.id) continue;
          if (empRoleMap.get(eid) === 'mlt') continue; // don't move MLTs
          if (!(empStationMap.get(eid) ?? []).includes(needyStation.id)) continue;

          const oldStation = realStations.find(s => s.id === sid);
          if (!oldStation) continue;
          const oldStaff = [...stationMap.values()].filter(v => v === sid).length;
          const oldMin = getMinStaff(oldStation, shiftName);

          // Only move from stations with surplus
          if (oldStaff > oldMin) {
            stationMap.set(eid, needyStation.id);
            break;
          }

          // Or if someone else can backfill from a surplus station
          const backfill = [...stationMap.entries()].find(([bid, bsid]) => {
            if (bid === eid || bsid === sid) return false;
            if (empRoleMap.get(bid) === 'mlt') return false;
            if (!(empStationMap.get(bid) ?? []).includes(sid)) return false;
            const bStation = realStations.find(s => s.id === bsid);
            if (!bStation) return false;
            const bStaff = [...stationMap.values()].filter(v => v === bsid).length;
            return bStaff > getMinStaff(bStation, shiftName);
          });

          if (backfill) {
            stationMap.set(eid, needyStation.id);
            stationMap.set(backfill[0], sid);
            break;
          }
        }
      }

      // Phase 3: If admins were moved to bench but station is no longer understaffed,
      // move them back to Admin (don't waste admin time on bench when not needed)
      understaffed = getUnderstaffed();
      if (understaffed.length === 0) {
        for (const admin of pool.filter(a => empRoleMap.get(a.employee_id) === 'admin')) {
          const sid = stationMap.get(admin.employee_id);
          if (!sid || sid === adminStation.id) continue;
          const station = realStations.find(s => s.id === sid);
          if (!station) continue;
          const current = [...stationMap.values()].filter(v => v === sid).length;
          const minNeeded = getMinStaff(station, shiftName);
          // Move back to Admin if station has surplus even without this admin
          if (current > minNeeded) {
            stationMap.set(admin.employee_id, adminStation.id);
          }
        }
      }
    }

// ── Layer 5: Admin-Parked Fill (e.g., Shayna) — only if bench stations need help ──
    // Re-optimizes ALL MLT placements to give admin-parked their preferred station
    function layer5_shaynaFill(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      shiftName: string,
    ) {
      const adminParked = pool.filter(a =>
        !locked.has(a.employee_id) && isAdminParked(a.employee_id)
      );
      const uniqueAP = [...new Map(adminParked.map(a => [a.employee_id, a])).values()];

      for (const ap of uniqueAP) {
        const benchQuals = getBenchQuals(ap.employee_id);
        if (benchQuals.length === 0) continue;
        const apRole = empRoleMap.get(ap.employee_id);
        if (apRole !== 'mlt') continue; // only handle MLT admin-parked here

        // Check if any bench station is understaffed — otherwise no reason to pull from Admin
        const anyUnderstaffed = realStations.some(s => {
          const current = [...stationMap.values()].filter(v => v === s.id).length;
          return current < getMinStaff(s, shiftName);
        });
        if (!anyUnderstaffed) continue;

        // Re-optimize: collect all MLTs currently on bench + this admin-parked person
        const mltStations = realStations.filter(s => s.require_cls === 1);
        const currentMLTs: { empId: number; stationId: number }[] = [];
        for (const [eid, sid] of stationMap) {
          if (empRoleMap.get(eid) === 'mlt' && mltStations.some(s => s.id === sid)) {
            currentMLTs.push({ empId: eid, stationId: sid });
          }
        }

        // Build expanded pool: existing bench MLTs + admin-parked
        const mltPool = [...new Set([...currentMLTs.map(m => m.empId), ap.employee_id])];
        const prefStation = benchQuals[0]; // admin-parked's #1 preference

        // Brute-force: try all valid assignments of mltPool to mltStations
        let bestAssignment = new Map<number, number>();
        let bestScore = Infinity;

        const tryAssign = (stIdx: number, assignment: Map<number, number>, used: Set<number>) => {
          if (stIdx >= mltStations.length) {
            let score = 0;
            // Penalize unfilled stations that are understaffed
            for (const st of mltStations) {
              const hasMLT = [...assignment.values()].includes(st.id);
              if (!hasMLT) {
                const current = [...stationMap.values()].filter(v => v === st.id).length;
                const minNeeded = getMinStaff(st, shiftName);
                if (current < minNeeded) score += 10000; // understaffed station without MLT
              }
            }
            // Strong bonus for admin-parked at their preferred station
            if (assignment.get(ap.employee_id) === prefStation) {
              score -= 5000;
            }
            // Penalize 2+ MLTs at same station
            const counts = new Map<number, number>();
            for (const [, sid] of assignment) counts.set(sid, (counts.get(sid) ?? 0) + 1);
            for (const [, c] of counts) if (c > 1) score += 50000 * (c - 1);

            if (score < bestScore) {
              bestScore = score;
              bestAssignment = new Map(assignment);
            }
            return;
          }

          const station = mltStations[stIdx];
          const candidates = mltPool.filter(id =>
            !used.has(id) && (empStationMap.get(id) ?? []).includes(station.id)
          );

          for (const cand of candidates) {
            assignment.set(cand, station.id);
            used.add(cand);
            tryAssign(stIdx + 1, assignment, used);
            assignment.delete(cand);
            used.delete(cand);
          }
          // Try leaving this station without an MLT from this pool
          tryAssign(stIdx + 1, assignment, used);
        };

        tryAssign(0, new Map(), new Set());

        if (bestAssignment.size === 0) continue; // no valid assignment found

        // Apply: update stationMap with new MLT assignments
        // Remove old MLT assignments from bench stations
        for (const m of currentMLTs) {
          // Only remove if this MLT is being reassigned
          if (bestAssignment.has(m.empId)) {
            stationMap.delete(m.empId);
          }
        }
        // Apply new assignments
        for (const [empId, stationId] of bestAssignment) {
          stationMap.set(empId, stationId);
          locked.add(empId);
        }
      }
    }

    // ── Layer 6: Per-Diem Fill — fill remaining gaps ──
    function layer6_perDiemFill(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      shiftName: string,
    ) {
      const perDiems = pool.filter(a => {
        if (locked.has(a.employee_id)) return false;
        const emp = employees.find(e => e.id === a.employee_id);
        return emp?.employment_type === 'per-diem';
      });
      const uniquePD = [...new Map(perDiems.map(a => [a.employee_id, a])).values()];

      // CLS per-diems: assign to their station if it needs them
      for (const pd of uniquePD) {
        const role = empRoleMap.get(pd.employee_id);
        if (role !== 'cls') continue;

        const quals = getBenchQuals(pd.employee_id);
        for (const sid of quals) {
          const station = realStations.find(s => s.id === sid);
          if (!station) continue;

          const currentStaff = [...stationMap.values()].filter(s => s === sid).length;
          const minNeeded = getMinStaff(station, shiftName);
          const clsHere = [...stationMap.entries()].filter(([eid, s]) =>
            s === sid && isCLSRole(eid, empRoleMap)
          ).length;
          const maxCLS = getMaxCLS(station, shiftName);

          // Place if understaffed and CLS slots available, or if station has no CLS at all
          if (clsHere < maxCLS && (currentStaff < minNeeded || (
            station.require_cls === 1 &&
            ![...stationMap.entries()].some(([eid, s]) => s === sid && isCLSRole(eid, empRoleMap))
          ))) {
            stationMap.set(pd.employee_id, sid);
            locked.add(pd.employee_id);
            break;
          }
        }
      }

      // MLT per-diems: fill MLT gaps at stations that need them
      for (const pd of uniquePD) {
        if (locked.has(pd.employee_id)) continue;
        const role = empRoleMap.get(pd.employee_id);
        if (role !== 'mlt') continue;

        const quals = getBenchQuals(pd.employee_id);
        for (const sid of quals) {
          const station = realStations.find(s => s.id === sid);
          if (!station || station.require_cls !== 1) continue;

          const currentStaff = [...stationMap.values()].filter(s => s === sid).length;
          const minNeeded = getMinStaff(station, shiftName);
          const mltsHere = [...stationMap.entries()].filter(([eid, s]) =>
            s === sid && empRoleMap.get(eid) === 'mlt'
          ).length;

          // Only place if station needs staff AND has no MLT yet
          if (currentStaff < minNeeded && mltsHere === 0) {
            stationMap.set(pd.employee_id, sid);
            locked.add(pd.employee_id);
            break;
          }
        }
      }
    }

    // ── Layer 7: Overflow — place remaining non-admin employees at best bench station ──
    function layer7_overflow(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      shiftName: string,
    ) {
      for (const a of pool) {
        if (stationMap.has(a.employee_id)) continue;

        // If employee has Admin in their station qualifications, send to Admin
        // (admin-role employees are handled in Layer 3, but admin-parked like Shayna may reach here)
        const allQuals = empStationMap.get(a.employee_id) ?? [];
        if (adminStation && allQuals.includes(adminStation.id)) {
          stationMap.set(a.employee_id, adminStation.id);
          continue;
        }

        // Non-admin employees go to their best bench station (never Admin)
        const benchQuals = getBenchQuals(a.employee_id);
        const empRole = empRoleMap.get(a.employee_id);
        let bestSid = -1;
        let bestNeed = -Infinity;
        for (const sid of benchQuals) {
          const station = realStations.find(s => s.id === sid);
          if (!station) continue;
          const current = [...stationMap.values()].filter(v => v === sid).length;
          const maxAllowed = getMinStaff(station, shiftName);
          if (current >= maxAllowed) continue;
          // Respect role-specific caps (CLS can't exceed CLS slots, MLT can't exceed 1)
          if (isCLSRole(a.employee_id, empRoleMap)) {
            const clsHere = [...stationMap.entries()].filter(([eid, s]) =>
              s === sid && isCLSRole(eid, empRoleMap)).length;
            if (clsHere >= getMaxCLS(station, shiftName)) continue;
          }
          if (empRole === 'mlt') {
            const mltsHere = [...stationMap.entries()].filter(([eid, s]) =>
              s === sid && empRoleMap.get(eid) === 'mlt').length;
            if (mltsHere >= 1) continue;
          }
          const need = getMinStaff(station, shiftName) - current;
          if (need > bestNeed) { bestNeed = need; bestSid = sid; }
        }
        if (bestSid >= 0) {
          stationMap.set(a.employee_id, bestSid);
        } else {
          // All role-specific slots full — try MLT swaps (count-neutral, no open slot needed)
          if (empRole === 'mlt' && adminStation) {
            // Strategy A: Replace an admin-parked MLT directly (they go back to Admin)
            for (const sid of benchQuals) {
              const apAtStation = [...stationMap.entries()].find(([eid, s]) =>
                s === sid && empRoleMap.get(eid) === 'mlt' && isAdminParked(eid)
              );
              if (apAtStation) {
                stationMap.set(apAtStation[0], adminStation.id);
                stationMap.set(a.employee_id, sid);
                break;
              }
            }

            // Strategy B: Chain swap — replace MLT at station X, that MLT replaces
            // admin-parked MLT at station Y who goes to Admin.
            // e.g., Dennis→Chem (replacing Gaby), Gaby→Hema (replacing Shayna), Shayna→Admin
            if (!stationMap.has(a.employee_id)) {
              for (const sid of benchQuals) {
                const mltHere = [...stationMap.entries()].find(([eid, s]) =>
                  s === sid && empRoleMap.get(eid) === 'mlt' && eid !== a.employee_id
                );
                if (!mltHere) continue;
                const [otherMLTId] = mltHere;
                const otherQuals = getBenchQuals(otherMLTId);
                for (const altSid of otherQuals) {
                  if (altSid === sid) continue;
                  const apAtAlt = [...stationMap.entries()].find(([eid, s]) =>
                    s === altSid && empRoleMap.get(eid) === 'mlt' && isAdminParked(eid)
                  );
                  if (apAtAlt) {
                    stationMap.set(apAtAlt[0], adminStation.id);
                    stationMap.set(otherMLTId, altSid);
                    stationMap.set(a.employee_id, sid);
                    break;
                  }
                }
                if (stationMap.has(a.employee_id)) break;
              }
            }
          }
          // Final fallback: if still unassigned, place at least-staffed station (generates warning)
          if (!stationMap.has(a.employee_id)) {
            let fallbackSid = -1;
            let fallbackNeed = -Infinity;
            for (const sid of benchQuals) {
              const station = realStations.find(s => s.id === sid);
              if (!station) continue;
              const current = [...stationMap.values()].filter(v => v === sid).length;
              const need = getMinStaff(station, shiftName) - current;
              if (need > fallbackNeed) { fallbackNeed = need; fallbackSid = sid; }
            }
            if (fallbackSid >= 0) {
              stationMap.set(a.employee_id, fallbackSid);
            }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // MULTI-PASS OPTIMIZER
    // ══════════════════════════════════════════════════════════════

    let bestPassWarnings: string[] = [];

    for (let passIdx = 0; passIdx < NUM_STATION_PASSES; passIdx++) {
      // Reset all station assignments for this pass
      for (const a of result) a.station_id = null as any;

      // Per-pass rotation tracking (starts from seed)
      const rotHistory = new Map(seedHistory);
      const mltHistory = new Map(seedHistory);
      const lastWeekStation = new Map(seedLastWeekStation);
      const lastWeekMLT = new Map<number, number>();
      for (const [empId, v] of seedLastWeekStation) {
        if (empRoleMap.get(empId) === 'mlt') lastWeekMLT.set(empId, v);
      }
      const weekStationThisWeek = new Map<number, number>();
      const bbRotation = new Map<number, number>();

      // Process each day+shift group chronologically
      let currentWeek = '';

      for (const groupKey of sortedGroupKeys) {
        const group = shiftDateGroups.get(groupKey)!;
        const date = group[0].date;
        const shiftIdNum = group[0].shift_id;
        const shiftName = shifts.find(s => s.id === shiftIdNum)?.name?.toLowerCase() ?? '';

        // Track week transitions for rotation tracking
        const week = getWeekStart(date);
        if (week !== currentWeek) {
          // New week — update lastWeekStation from this week's assignments
          if (currentWeek !== '') {
            for (const [empId, sid] of weekStationThisWeek) {
              lastWeekStation.set(empId, sid);
              if (empRoleMap.get(empId) === 'mlt') lastWeekMLT.set(empId, sid);
            }
          }
          weekStationThisWeek.clear();
          currentWeek = week;
        }

        // Build the pool: all employees working this day+shift
        const pool = group;
        const locked = new Set<number>();
        const stationMap = new Map<number, number>();

        // Run the 7 layers in order
        layer1_bloodBank(pool, locked, stationMap, bbRotation, passIdx);
        layer2_mltPlacement(pool, locked, stationMap, mltHistory, lastWeekMLT, passIdx);
        layer3_adminPlacement(pool, locked, stationMap, shiftName);
        layer4_clsRotation(pool, locked, stationMap, rotHistory, lastWeekStation, weekStationThisWeek, shiftName, passIdx);
        layer5_shaynaFill(pool, locked, stationMap, shiftName);
        layer6_perDiemFill(pool, locked, stationMap, shiftName);
        layer7_overflow(pool, locked, stationMap, shiftName);
        // Run gap-fill last — after everyone is placed, reshuffle to fix remaining understaffing
        gapFill(pool, locked, stationMap, shiftName);

        // Apply station assignments to the result assignments
        for (const a of group) {
          a.station_id = stationMap.get(a.employee_id) ?? null;
        }
      }

      // ── Generate warnings for this pass ──
      const passWarnings: string[] = [];

      for (const [, group] of shiftDateGroups) {
        const shiftName = shifts.find(s => s.id === group[0].shift_id)?.name?.toLowerCase() ?? '';
        const shiftLabel = shifts.find(s => s.id === group[0].shift_id)?.name ?? 'Unknown';
        const date = group[0].date;

        for (const station of realStations) {
          const stationAssignees = group.filter(a => a.station_id === station.id);
          const minNeeded = getMinStaff(station, shiftName);
          const maxAllowed = getMinStaff(station, shiftName);

          // CRITICAL: understaffed
          if (stationAssignees.length < minNeeded) {
            const dow = getDow(date);
            const isWkend = dow === 0 || dow === 6;
            const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
            if (!(isWkend && isHemaOrChem)) {
              passWarnings.push(`CRITICAL: ${station.name} needs ${minNeeded} staff but only ${stationAssignees.length} assigned on ${date} (${shiftLabel})`);
            }
          }

          // WARNING: overstaffed
          if (stationAssignees.length > maxAllowed) {
            passWarnings.push(`WARNING: ${station.name} has ${stationAssignees.length} staff (max ${maxAllowed}) on ${date} (${shiftLabel})`);
          }

          if (stationAssignees.length > 0) {
            // PIVOTAL: no MLT at require_cls station
            if (station.require_cls === 1) {
              const hasMLT = stationAssignees.some(a => empRoleMap.get(a.employee_id) === 'mlt');
              if (!hasMLT) {
                const dow = getDow(date);
                const isWeekend = dow === 0 || dow === 6;
                const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
                if (!(isWeekend && isHemaOrChem)) {
                  passWarnings.push(`PIVOTAL: ${station.name} has no MLT assigned on ${date} (${shiftLabel})`);
                }
              }
            }

            // PIVOTAL: no CLS at require_cls station
            if (station.require_cls === 1) {
              const hasCLS = stationAssignees.some(a => isCLSRole(a.employee_id, empRoleMap));
              if (!hasCLS) {
                passWarnings.push(`PIVOTAL: ${station.name} has no CLS assigned on ${date} (${shiftLabel})`);
              }
            }
          }
        }
      }

      // Station-level warnings
      for (const station of realStations) {
        const qualifiedEmps = employees.filter(e => empStationMap.get(e.id)?.includes(station.id));
        if (qualifiedEmps.length === 0) {
          passWarnings.push(`Station "${station.name}" has no qualified employees assigned`);
        }
        const qualifiedIds = qualifiedEmps.map(e => e.id);
        if (qualifiedIds.length <= 1 && qualifiedIds.length > 0) {
          const name = employees.find(e => e.id === qualifiedIds[0])?.name;
          passWarnings.push(`CRITICAL: ${name} is the ONLY person qualified for ${station.name} — no backup`);
        }
      }

      // Time-off conflicts
      for (const to of timeOff) {
        const empStations = empStationMap.get(to.employee_id) ?? [];
        const empName = employees.find(e => e.id === to.employee_id)?.name ?? `Employee #${to.employee_id}`;
        for (const stationId of empStations) {
          const station = realStations.find(s => s.id === stationId);
          if (!station) continue;
          const others = employees.filter(e => e.id !== to.employee_id && empStationMap.get(e.id)?.includes(stationId));
          const othersWorking = others.filter(e => result.some(r => r.employee_id === e.id && r.date === to.date));
          if (othersWorking.length === 0) {
            passWarnings.push(`CRITICAL: ${empName} is off ${to.date} but no other ${station.name}-qualified employee is scheduled — deny time-off or reassign coverage`);
          }
        }
      }

      // Score this pass
      const passScore = scorePass(result, stations, shifts, empRoleMap);
      if (passScore.total < bestScore) {
        bestScore = passScore.total;
        bestPassWarnings = [...passWarnings];
        bestStationAssignments = new Map();
        for (const a of result) {
          if (a.station_id !== null) {
            bestStationAssignments.set(`${a.employee_id}-${a.date}-${a.shift_id}`, a.station_id);
          }
        }
      }
    } // end multi-pass loop

    // Merge best pass's warnings
    warnings.push(...bestPassWarnings);

    // Apply best station assignments
    if (bestStationAssignments) {
      for (const a of result) {
        const key = `${a.employee_id}-${a.date}-${a.shift_id}`;
        const stationId = bestStationAssignments.get(key);
        a.station_id = stationId ?? (null as any);
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Warnings
  // ═══════════════════════════════════════════════════════════════

  for (const emp of employees) {
    for (const wk of weekNumbers) {
      const key = `${emp.id}-${wk}`;
      const hours = weekHours.get(key) ?? 0;

      // Only warn if significantly over (extra full day) or under (missed full day)
      if (emp.target_hours_week > 0 && hours > emp.target_hours_week + 10) {
        warnings.push(`${emp.name} has ${hours.toFixed(1)}h in week of ${wk} (target: ${emp.target_hours_week}h)`);
      }

      if (emp.employment_type !== 'per-diem' && emp.target_hours_week > 0) {
        const deficit = emp.target_hours_week - hours;
        if (deficit >= 10) {
          warnings.push(`${emp.name} is ${deficit.toFixed(1)}h under target in week of ${wk}`);
        }
      }
    }
  }

  // Back-to-back weekend check
  for (const emp of employees) {
    const empDates = assignedDates.get(emp.id)!;
    for (let i = 0; i < weekendSats.length - 1; i++) {
      const sat1 = weekendSats[i], sat2 = weekendSats[i + 1];
      const worked1 = empDates.has(sat1) || empDates.has(addDays(sat1, 1));
      const worked2 = empDates.has(sat2) || empDates.has(addDays(sat2, 1));
      if (worked1 && worked2 && getWeekendAvailability(emp.id, constraintMap) === 'alternating') {
        warnings.push(`SCHEDULE ERROR: ${emp.name} works back-to-back weekends (${sat1} and ${sat2})`);
      }
    }
  }

  // Shifts with zero coverage
  for (const dateStr of dates) {
    for (const shift of shifts) {
      if (!result.some(r => r.shift_id === shift.id && r.date === dateStr)) {
        warnings.push(`CRITICAL: No coverage for ${shift.name} shift on ${dateStr}`);
      }
    }
  }

  if (result.length === 0) {
    warnings.push('No assignments generated — check employee constraints and availability');
  }

  return { assignments: result, warnings: groupWarningsByShift(warnings) };
}
