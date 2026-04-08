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
      if (!employeeOnWeekends.get(empId)?.has(sat)) return false;

      // Only 1 admin per weekend day
      const emp = employees.find(e => e.id === empId);
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
  // PHASE 3: Weekly station assignment with rotation
  // Multi-pass: run station assignment multiple times with different
  // employee orderings, count criticals, keep the best result.
  // ═══════════════════════════════════════════════════════════════

  const NUM_STATION_PASSES = 10;

  // Helper: shuffle array (Fisher-Yates)
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Helper: count criticals from a set of station assignments
  const countCriticals = (assignments: Assignment[], stns: typeof stations, shfts: typeof shifts) => {
    const realStns = stns.filter(s => s.name !== 'Admin');
    let criticals = 0;
    const empRoles = new Map<number, string>();
    for (const emp of employees) empRoles.set(emp.id, emp.role);
    // Group by shift+date
    const groups = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const key = `${a.shift_id}-${a.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    for (const [, group] of groups) {
      const shiftName = shfts.find(s => s.id === group[0].shift_id)?.name?.toLowerCase() ?? '';
      for (const station of realStns) {
        const minNeeded = shiftName === 'am' ? (station as any).min_staff_am ?? station.min_staff ?? 1
          : shiftName === 'pm' ? (station as any).min_staff_pm ?? station.min_staff ?? 1
          : shiftName === 'night' ? (station as any).min_staff_night ?? station.min_staff ?? 1
          : station.min_staff ?? 1;
        const maxAllowed = (station as any).max_staff ?? 99;
        const stationAssignees = group.filter(a => a.station_id === station.id);
        if (stationAssignees.length < minNeeded) {
          // On weekends, Hema/Chem share an MLT float — don't penalize individual understaffing
          const dow = getDow(group[0].date);
          const isWkend = dow === 0 || dow === 6;
          const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
          if (!(isWkend && isHemaOrChem)) criticals++;
        }
        if (stationAssignees.length > maxAllowed) criticals += 2; // over max is bad
        // Penalize 2+ MLTs at the same station
        const mltCount = stationAssignees.filter(a => empRoles.get(a.employee_id) === 'mlt').length;
        if (mltCount > 1) criticals += 3 * (mltCount - 1);
      }
    }
    // Add rotation penalty: penalize poor station diversity and consecutive same-station
    const empWeekStation = new Map<string, Map<string, number>>(); // "empId-shiftId" -> weekStart -> stationId
    const adminStn = stns.find(s => s.name === 'Admin');
    for (const a of assignments) {
      if (a.station_id === null) continue;
      if (adminStn && a.station_id === adminStn.id) continue;
      const ws = (() => { const d = new Date(a.date + 'T12:00:00'); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })();
      const key = `${a.employee_id}-${a.shift_id}`;
      if (!empWeekStation.has(key)) empWeekStation.set(key, new Map());
      empWeekStation.get(key)!.set(ws, a.station_id);
    }
    for (const [empKey, weekMap] of empWeekStation) {
      const empId = parseInt(empKey.split('-')[0]);
      const realQual = (empStationMap.get(empId) ?? []).filter(sid => !adminStn || sid !== adminStn.id);
      if (realQual.length <= 1) continue; // locked, ignore

      const weeks = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      // Consecutive penalty: 2 per back-to-back same station
      for (let i = 1; i < weeks.length; i++) {
        if (weeks[i][1] === weeks[i - 1][1]) criticals += 2;
      }
      // Diversity penalty: if they have 3+ station options but only visited 2, penalize
      const uniqueStations = new Set(weeks.map(w => w[1])).size;
      if (realQual.length >= 3 && weeks.length >= 3 && uniqueStations <= 2) {
        criticals += 3; // stuck alternating between 2 stations
      }
    }

    return criticals;
  };

  let bestStationAssignments: Map<string, number> | null = null; // "empId-date" -> stationId
  let bestCriticalCount = Infinity;

  if (stations.length > 0) {
    // ── Stable data computed once before multi-pass loop ──
    const empRoleMap = new Map<number, string>();
    for (const emp of employees) empRoleMap.set(emp.id, emp.role);
    const adminStation = stations.find(s => s.name === 'Admin');
    const realStations = stations.filter(s => s.name !== 'Admin');

    const getWeekStart = (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00');
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      return d.toISOString().slice(0, 10);
    };

    // Seed rotation history from previous month's DB data
    const seedHistory = new Map<string, number>();
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

    const prevWeekStations = new Map<string, number>();
    for (const pa of prevAssigns) {
      const d = new Date(pa.date + 'T12:00:00');
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      const ws = d.toISOString().slice(0, 10);
      prevWeekStations.set(`${pa.employee_id}-${ws}-${pa.station_id}`, 1);
    }
    for (const [key] of prevWeekStations) {
      const parts = key.split('-');
      const empId = parts[0];
      const stationId = parts[parts.length - 1];
      const hk = `${empId}-${stationId}`;
      seedHistory.set(hk, (seedHistory.get(hk) ?? 0) + 1);
    }

    // Seed last-week tracking from last week of previous month
    // seedLastWeekMLT: "empId-shiftId" -> stationId (for MLT optimizer consecutive penalty)
    // seedLastWeekStation: "empId-shiftId" -> stationId (for ALL employees consecutive penalty)
    const seedLastWeekMLT = new Map<string, number>();
    const seedLastWeekStation = new Map<string, number>();
    if (prevAssigns.length > 0) {
      const lastPrevDate = prevAssigns[prevAssigns.length - 1].date;
      const lastPrevWeekStart = getWeekStart(lastPrevDate);
      const lastWeekAssigns = prevAssigns.filter(pa => getWeekStart(pa.date) === lastPrevWeekStart);
      for (const pa of lastWeekAssigns) {
        const shiftRow = db.prepare('SELECT shift_id FROM schedule_assignments WHERE employee_id = ? AND date = ? AND station_id = ?')
          .get(pa.employee_id, pa.date, pa.station_id) as { shift_id: number } | undefined;
        if (shiftRow) {
          seedLastWeekMLT.set(`${pa.employee_id}-${shiftRow.shift_id}`, pa.station_id);
          seedLastWeekStation.set(`${pa.employee_id}-${shiftRow.shift_id}`, pa.station_id);
        }
      }
    }

    // Group assignments by shift+date (stable grouping — same objects, only station_id changes per pass)
    const shiftDateGroups = new Map<string, Assignment[]>();
    for (const a of result) {
      const key = `${a.shift_id}-${a.date}`;
      if (!shiftDateGroups.has(key)) shiftDateGroups.set(key, []);
      shiftDateGroups.get(key)!.push(a);
    }

    const weekShiftGroups = new Map<string, string[]>();
    for (const [key] of shiftDateGroups) {
      const dashIdx = key.indexOf('-');
      const sid = key.substring(0, dashIdx);
      const dt = key.substring(dashIdx + 1);
      const ws = getWeekStart(dt);
      const wsKey = `${ws}-${sid}`;
      if (!weekShiftGroups.has(wsKey)) weekShiftGroups.set(wsKey, []);
      weekShiftGroups.get(wsKey)!.push(dt);
    }

    const sortedWeekShiftKeys = [...weekShiftGroups.keys()].sort();

    // ── Multi-pass loop: try different orderings, keep best ──
    let bestPassWarnings: string[] = [];
    for (let passIdx = 0; passIdx < NUM_STATION_PASSES; passIdx++) {
    // Reset all station assignments and rotation tracking for this pass
    for (const a of result) a.station_id = null as any;
    const weeklyStationHistory = new Map(seedHistory);
    const lastWeekMLT = new Map(seedLastWeekMLT);
    const lastWeekStation = new Map(seedLastWeekStation); // "empId-shiftId" -> stationId (all employees)
    const passWarnings: string[] = [];

    for (const wsKey of sortedWeekShiftKeys) {
      const [weekStart, shiftId] = [wsKey.substring(0, 10), wsKey.substring(11)];
      const weekDates = weekShiftGroups.get(wsKey)!.sort();
      const shiftIdNum = parseInt(shiftId);
      const groupShiftName = shifts.find(s => s.id === shiftIdNum)?.name?.toLowerCase() ?? '';

      // Collect all employees working this shift in this week
      const weekEmployeeIds = new Set<number>();
      const dailyGroups: Assignment[][] = [];
      for (const date of weekDates) {
        const group = shiftDateGroups.get(`${shiftId}-${date}`);
        if (group) {
          dailyGroups.push(group);
          for (const a of group) weekEmployeeIds.add(a.employee_id);
        }
      }

      // Split into non-admin and admin pools
      // Shuffle employee order on subsequent passes for variety
      const nonAdminIds = passIdx === 0
        ? [...weekEmployeeIds].filter(id => empRoleMap.get(id) !== 'admin')
        : shuffle([...weekEmployeeIds].filter(id => empRoleMap.get(id) !== 'admin'));
      const adminIds = [...weekEmployeeIds].filter(id => empRoleMap.get(id) === 'admin');

      // Build scarcity: how many non-admin employees can cover each real station this week
      const stationsByScarcity = [...realStations].filter(s => {
        return nonAdminIds.some(id => empStationMap.get(id)?.includes(s.id));
      }).sort((a, b) => {
        const aCount = nonAdminIds.filter(id => empStationMap.get(id)!.includes(a.id)).length;
        const bCount = nonAdminIds.filter(id => empStationMap.get(id)!.includes(b.id)).length;
        return aCount - bCount;
      });

      // Pre-compute sole MLT reservations for this week's pool
      const mltReservedFor = new Map<number, number>();
      for (const station of stationsByScarcity) {
        if (station.require_cls !== 1) continue;
        const availableMLTs = nonAdminIds.filter(
          id => empStationMap.get(id)!.includes(station.id) && empRoleMap.get(id) === 'mlt'
        );
        if (availableMLTs.length === 1 && !mltReservedFor.has(availableMLTs[0])) {
          mltReservedFor.set(availableMLTs[0], station.id);
        }
      }

      // Assign each non-admin employee a station for the week
      const weekAssignment = new Map<number, number>(); // empId -> stationId
      const used = new Set<number>();

      // Pre-lock MLTs with only 1 real station — they MUST go there regardless of optimizer
      const lockedMLTs = new Map<number, number>(); // empId -> stationId
      const stationsWithLockedMLT = new Set<number>();
      for (const id of nonAdminIds) {
        if (used.has(id)) continue;
        // Skip admin-preferred (inline check — isAdminPreferred not defined yet)
        if (adminStation && empStationMap.get(id)![0] === adminStation.id) continue;
        if (empRoleMap.get(id) !== 'mlt') continue;
        const realQual = empStationMap.get(id)!.filter(sid => !adminStation || sid !== adminStation.id);
        if (realQual.length === 1) {
          lockedMLTs.set(id, realQual[0]);
          stationsWithLockedMLT.add(realQual[0]);
          weekAssignment.set(id, realQual[0]);
          used.add(id);
        }
      }

      // Pre-pass: plan MLT assignments globally with rotation
      // Use brute-force search over all valid MLT→station assignments (pool is small)
      const mltStations = stationsByScarcity.filter(s => s.require_cls === 1);
      // Exclude Admin-preferred MLTs (e.g. Shayna) and already-locked MLTs from optimizer
      const mltPool = nonAdminIds.filter(id =>
        empRoleMap.get(id) === 'mlt' &&
        !lockedMLTs.has(id) &&
        !(adminStation && empStationMap.get(id)![0] === adminStation.id)
      );

      // lastWeekMLT is declared outside the loop — tracks previous week's assignment

      // Generate all valid MLT→station assignments using recursive search
      const bestMLTAssignment = new Map<number, number>();
      let bestScore = Infinity;

      const tryAssign = (stationIdx: number, assignment: Map<number, number>, usedMLTs: Set<number>) => {
        if (stationIdx >= mltStations.length) {
          // Score: penalize repeat assignments (total history squared)
          // + heavy penalty for consecutive same station as last week
          let score = 0;
          for (const [empId, stationId] of assignment) {
            const hist = weeklyStationHistory.get(`${empId}-${stationId}`) ?? 0;
            score += hist * hist;
            // Consecutive penalty: MUST rotate — same station as last week is near-forbidden
            const lastStation = lastWeekMLT.get(`${empId}-${shiftId}`);
            if (lastStation === stationId) score += 10000;
            // Penalty for pulling someone whose #1 is Admin into a real station
            const empPrefs = empStationMap.get(empId)!;
            if (adminStation && empPrefs[0] === adminStation.id) score += 500;
            // Max 1 MLT per station: heavily penalize if locked MLT already covers this station
            if (stationsWithLockedMLT.has(stationId)) score += 50000;
          }
          // Also penalize 2+ optimizer MLTs at the same station
          const stationCounts = new Map<number, number>();
          for (const [, sid] of assignment) {
            stationCounts.set(sid, (stationCounts.get(sid) ?? 0) + 1);
          }
          for (const [sid, count] of stationCounts) {
            if (count > 1) score += 50000 * (count - 1);
          }
          // Penalize missing MLTs: stations that need an MLT but didn't get one
          const unfilledCount = mltStations.length - assignment.size;
          score += unfilledCount * 1000;

          if (score < bestScore) {
            bestScore = score;
            bestMLTAssignment.clear();
            for (const [k, v] of assignment) bestMLTAssignment.set(k, v);
          }
          return;
        }

        const station = mltStations[stationIdx];
        const candidates = mltPool.filter(
          id => !usedMLTs.has(id) && empStationMap.get(id)!.includes(station.id)
        );

        // Try each candidate
        for (const candidate of candidates) {
          assignment.set(candidate, station.id);
          usedMLTs.add(candidate);
          tryAssign(stationIdx + 1, assignment, usedMLTs);
          assignment.delete(candidate);
          usedMLTs.delete(candidate);
        }

        // Also try leaving this station without an MLT
        // (allows optimizer to skip when only Admin-preferred MLTs are available)
        tryAssign(stationIdx + 1, assignment, usedMLTs);
      };

      tryAssign(0, new Map(), new Set());

      // Apply best MLT assignment
      for (const [empId, stationId] of bestMLTAssignment) {
        weekAssignment.set(empId, stationId);
        used.add(empId);
      }

      // ── Station assignment: employee-first with rotation + staffing fix-up ──
      // Instead of greedy station-by-station (which traps flexible employees),
      // let each employee pick their best rotation station, then fix shortages.

      const getMinNeededForStation = (station: Station) =>
        groupShiftName === 'am' ? (station as any).min_staff_am ?? station.min_staff ?? 1
        : groupShiftName === 'pm' ? (station as any).min_staff_pm ?? station.min_staff ?? 1
        : groupShiftName === 'night' ? (station as any).min_staff_night ?? station.min_staff ?? 1
        : station.min_staff ?? 1;

      const getMaxForStation = (station: Station) =>
        (station as any).max_staff ?? 99;

      const isAdminPreferred = (id: number) =>
        !!(adminStation && empStationMap.get(id)![0] === adminStation.id);

      // Step A: Locked employees (flex=1) — they have no choice, regardless of role
      for (const id of nonAdminIds) {
        if (used.has(id) || isAdminPreferred(id)) continue;
        const realQual = empStationMap.get(id)!.filter(sid => !adminStation || sid !== adminStation.id);
        if (realQual.length === 1) {
          weekAssignment.set(id, realQual[0]);
          used.add(id);
        }
      }
      const nonAdminNonMLT = nonAdminIds.filter(id =>
        !used.has(id) && empRoleMap.get(id) !== 'mlt' && !isAdminPreferred(id)
      );

      // Step B: Employee-first rotation assignment for remaining non-admin, non-MLT employees
      // Sort: least flexible first (they have fewer options, assign them early)
      let flexEmployees = nonAdminNonMLT.filter(id => !used.has(id));
      if (passIdx === 0) {
        // First pass: least flexible first (deterministic)
        flexEmployees.sort((a, b) => {
          const aFlex = empStationMap.get(a)!.filter(sid => !adminStation || sid !== adminStation.id).length;
          const bFlex = empStationMap.get(b)!.filter(sid => !adminStation || sid !== adminStation.id).length;
          return aFlex - bFlex;
        });
      } else {
        // Subsequent passes: shuffle to explore different orderings
        flexEmployees = shuffle(flexEmployees);
      }

      for (const empId of flexEmployees) {
        const realQual = empStationMap.get(empId)!.filter(sid => !adminStation || sid !== adminStation.id);
        // Score each station: lower = better
        let bestStation = realQual[0];
        let bestScore = Infinity;
        for (const sid of realQual) {
          let score = 0;
          const stn = realStations.find(s => s.id === sid);
          if (!stn) continue;
          const currentStaff = [...weekAssignment.values()].filter(s => s === sid).length;
          const minNeeded = getMinNeededForStation(stn);
          const maxAllowed = getMaxForStation(stn);

          // Hard block: never exceed max_staff
          if (currentStaff >= maxAllowed) {
            score += 100000; // effectively forbidden
          } else if (currentStaff < minNeeded) {
            score -= 200 * (minNeeded - currentStaff); // needs staff (Step C will fix if needed)
          } else {
            score += 100; // station is at or above min
          }

          // Rotation: avoid stations you've been at recently
          const hist = weeklyStationHistory.get(`${empId}-${sid}`) ?? 0;
          score += hist * 150; // strong history penalty — each prior week adds cost
          if (lastWeekStation.get(`${empId}-${shiftId}`) === sid) score += 1500; // consecutive week penalty

          // Diversity: ensure employees rotate through ALL qualified stations evenly
          const allHists = realQual.map(s => weeklyStationHistory.get(`${empId}-${s}`) ?? 0);
          const totalWeeks = allHists.reduce((sum, h) => sum + h, 0);
          const minHist = Math.min(...allHists);
          const maxHist = Math.max(...allHists);

          if (totalWeeks > 0 && hist === 0) {
            // Never visited — very strong pull that grows over time
            score -= 800 - Math.min(totalWeeks * 30, 300);
          }
          if (totalWeeks >= 2) {
            // Penalize imbalance: exponential push away from over-visited stations
            const imbalance = hist - minHist;
            if (imbalance >= 1) score += imbalance * imbalance * 300;
          }
          // Bonus for under-visited: pull toward least-visited station
          if (totalWeeks >= realQual.length && hist === minHist && maxHist > minHist) {
            score -= 500;
          }
          // Extra: if qualified for 3+ stations and one has 0 visits, strongly pull
          if (realQual.length >= 3 && hist === 0 && totalWeeks >= 2) {
            score -= 400;
          }

          // Scarcity: prefer stations with fewer qualified employees (you're more needed)
          const qualCount = nonAdminIds.filter(id => empStationMap.get(id)!.includes(sid)).length;
          score -= Math.max(0, 5 - qualCount) * 30; // bonus for scarce stations

          if (score < bestScore) {
            bestScore = score;
            bestStation = sid;
          }
        }
        weekAssignment.set(empId, bestStation);
        used.add(empId);
      }

      // Step C: Fix understaffed stations — pull the most flexible person from
      // an overstaffed or fully-staffed station to the understaffed one
      for (const station of stationsByScarcity) {
        const minNeeded = getMinNeededForStation(station);
        const maxAllowed = getMaxForStation(station);
        let currentStaff = [...weekAssignment.values()].filter(sid => sid === station.id).length;
        while (currentStaff < minNeeded && currentStaff < maxAllowed) {
          // Find someone to reassign: prefer most-flexible person at an overstaffed station
          const candidates = [...weekAssignment.entries()]
            .filter(([eid, sid]) => {
              if (sid === station.id) return false; // already here
              if (!empStationMap.get(eid)!.includes(station.id)) return false; // can't do this station
              if (isAdminPreferred(eid)) return false;
              const theirStation = realStations.find(s => s.id === sid);
              if (!theirStation) return false;
              const theirMin = getMinNeededForStation(theirStation);
              const theirCurrent = [...weekAssignment.values()].filter(s => s === sid).length;
              if (theirCurrent <= theirMin) return false; // would understaff their station
              return true;
            })
            .sort((a, b) => {
              // Prefer most flexible (they can go anywhere)
              const aFlex = empStationMap.get(a[0])!.filter(sid => !adminStation || sid !== adminStation.id).length;
              const bFlex = empStationMap.get(b[0])!.filter(sid => !adminStation || sid !== adminStation.id).length;
              return bFlex - aFlex; // higher flex first
            });

          if (candidates.length === 0) {
            // No one from overstaffed — try pulling admins
            const admCandidate = adminIds.find(
              id => !used.has(id) && empStationMap.get(id)!.includes(station.id)
            );
            if (admCandidate) {
              weekAssignment.set(admCandidate, station.id);
              used.add(admCandidate);
              currentStaff++;
            } else {
              break; // truly no one available
            }
            continue;
          }
          // Reassign the best candidate to this station
          weekAssignment.set(candidates[0][0], station.id);
          currentStaff++;
        }
      }

      // MLT rebalance: if a station that allows MLTs has none, swap from another
      for (const station of stationsByScarcity) {
        if (station.require_cls !== 1) continue;
        const assignedHere = [...weekAssignment.entries()].filter(([, sid]) => sid === station.id);
        const hasMLT = assignedHere.some(([eid]) => empRoleMap.get(eid) === 'mlt');
        if (hasMLT || assignedHere.length === 0) continue;

        for (const otherStation of stationsByScarcity) {
          if (otherStation.id === station.id) continue;
          const otherAssigned = [...weekAssignment.entries()].filter(([, sid]) => sid === otherStation.id);
          const otherMLTs = otherAssigned.filter(([eid]) => empRoleMap.get(eid) === 'mlt');
          if (otherMLTs.length === 0) continue;

          for (const [mltId] of otherMLTs) {
            if (!empStationMap.get(mltId)!.includes(station.id)) continue;
            // Find a non-MLT here that can go to the other station
            const swapCandidate = assignedHere.find(([eid]) =>
              empRoleMap.get(eid) !== 'mlt' && empStationMap.get(eid)!.includes(otherStation.id)
            );
            if (!swapCandidate) continue;
            weekAssignment.set(mltId, station.id);
            weekAssignment.set(swapCandidate[0], otherStation.id);
            break;
          }
          const recheckMLT = [...weekAssignment.entries()].filter(([, sid]) => sid === station.id)
            .some(([eid]) => empRoleMap.get(eid) === 'mlt');
          if (recheckMLT) break;
        }
      }

      // Assign remaining non-admins to their preferred station (respecting max limits)
      for (const id of nonAdminIds) {
        if (used.has(id)) continue;
        const qualStations = empStationMap.get(id)!;
        // If their #1 is Admin, let them have it; otherwise prefer non-Admin with room
        if (adminStation && qualStations[0] === adminStation.id) {
          weekAssignment.set(id, adminStation.id);
        } else {
          const isMLT = empRoleMap.get(id) === 'mlt';
          // Pick a non-Admin station that's under max, preferring understaffed ones
          const nonAdminStations = qualStations
            .filter(sid => !adminStation || sid !== adminStation.id)
            .map(sid => {
              const stn = realStations.find(s => s.id === sid);
              const current = [...weekAssignment.values()].filter(s => s === sid).length;
              const max = stn ? getMaxForStation(stn) : 99;
              const min = stn ? getMinNeededForStation(stn) : 1;
              // Check if station already has an MLT assigned
              const hasMLT = [...weekAssignment.entries()]
                .some(([eid, s]) => s === sid && empRoleMap.get(eid) === 'mlt');
              return { sid, current, max, min, hasMLT };
            })
            .filter(s => s.current < s.max) // only consider stations with room
            .sort((a, b) => {
              // If this employee is an MLT, strongly prefer stations without an MLT (max 1 per station)
              if (isMLT) {
                if (a.hasMLT !== b.hasMLT) return a.hasMLT ? 1 : -1;
              }
              return (a.current - a.min) - (b.current - b.min); // most understaffed first
            });
          if (nonAdminStations.length > 0) {
            weekAssignment.set(id, nonAdminStations[0].sid);
          } else {
            // All real stations at max — MLTs should never go to Admin, pick least-full real station
            if (isMLT) {
              const realOptions = qualStations
                .filter(sid => !adminStation || sid !== adminStation.id)
                .map(sid => ({ sid, count: [...weekAssignment.values()].filter(s => s === sid).length }))
                .sort((a, b) => a.count - b.count);
              weekAssignment.set(id, realOptions.length > 0 ? realOptions[0].sid : qualStations[0]);
            } else {
              weekAssignment.set(id, adminStation?.id ?? qualStations[0]);
            }
          }
        }
        used.add(id);
      }

      // Admins default to Admin station for the week
      if (adminStation) {
        for (const id of adminIds) {
          if (!used.has(id)) {
            weekAssignment.set(id, adminStation.id);
            used.add(id);
          }
        }
      }

      // ── Rotation enforcement swap pass ──
      // Two goals: (1) no same-station-as-last-week, (2) spread employees
      // across ALL their qualified stations, not just alternating between two.
      //
      // Score each employee's assignment: higher = worse rotation.
      // Try swapping the worst-scored employees with better partners.
      const canSwap = (eId: number, eSid: number, oId: number, oSid: number) => {
        if (!empStationMap.get(eId)!.includes(oSid)) return false;
        if (!empStationMap.get(oId)!.includes(eSid)) return false;
        // Don't swap into a station that would exceed max (net effect is neutral for swaps, but check anyway)
        const eStn = realStations.find(s => s.id === eSid);
        const oStn = realStations.find(s => s.id === oSid);
        if (eStn && [...weekAssignment.values()].filter(s => s === eSid).length >= getMaxForStation(eStn) + 1) return false;
        if (oStn && [...weekAssignment.values()].filter(s => s === oSid).length >= getMaxForStation(oStn) + 1) return false;
        // Don't create consecutive assignment for the other person
        if (lastWeekStation.get(`${oId}-${shiftId}`) === eSid) return false;
        // Don't swap into consecutive for the employee either
        if (lastWeekStation.get(`${eId}-${shiftId}`) === oSid) return false;
        // Preserve MLT coverage
        const eRole = empRoleMap.get(eId)!;
        const oRole = empRoleMap.get(oId)!;
        if (eStn?.require_cls === 1 && eRole === 'mlt') {
          const otherMLTs = [...weekAssignment.entries()].filter(
            ([id, sid]) => sid === eSid && id !== eId && empRoleMap.get(id) === 'mlt'
          );
          if (otherMLTs.length === 0 && oRole !== 'mlt') return false;
        }
        if (oStn?.require_cls === 1 && oRole === 'mlt') {
          const otherMLTs = [...weekAssignment.entries()].filter(
            ([id, sid]) => sid === oSid && id !== oId && empRoleMap.get(id) === 'mlt'
          );
          if (otherMLTs.length === 0 && eRole !== 'mlt') return false;
        }
        return true;
      };

      // Rotation score: how "stuck" is this employee at their current station?
      const rotationScore = (empId: number, stationId: number) => {
        const realQual = empStationMap.get(empId)!.filter(sid => !adminStation || sid !== adminStation.id);
        if (realQual.length <= 1) return -1; // locked, ignore
        let score = 0;
        // Consecutive: same as last week
        if (lastWeekStation.get(`${empId}-${shiftId}`) === stationId) score += 100;
        // History imbalance: how many times at this station vs their least-visited station
        const thisHist = weeklyStationHistory.get(`${empId}-${stationId}`) ?? 0;
        const minHist = Math.min(...realQual.map(sid => weeklyStationHistory.get(`${empId}-${sid}`) ?? 0));
        score += (thisHist - minHist) * 10;
        return score;
      };

      // Build list of swap candidates sorted by worst rotation score first
      const swapCandidates = [...weekAssignment.entries()]
        .filter(([, sid]) => !adminStation || sid !== adminStation.id)
        .map(([empId, sid]) => ({ empId, sid, score: rotationScore(empId, sid) }))
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score);

      for (const { empId, sid: stationId } of swapCandidates) {
        // Check if still at this station (a prior swap may have moved them)
        if (weekAssignment.get(empId) !== stationId) continue;

        // Find the best swap partner
        let bestSwap: { otherId: number; otherSid: number; improvement: number } | null = null;
        for (const [otherId, otherSid] of weekAssignment) {
          if (otherId === empId || otherSid === stationId) continue;
          if (adminStation && otherSid === adminStation.id) continue;
          if (!canSwap(empId, stationId, otherId, otherSid)) continue;
          // Calculate improvement: does the swap improve TOTAL rotation score?
          const curScore = rotationScore(empId, stationId) + rotationScore(otherId, otherSid);
          const newEmpScore = rotationScore(empId, otherSid);
          const newOtherScore = rotationScore(otherId, stationId);
          // Only use history portion for new scores (consecutive check uses current lastWeek,
          // but after swap the new stations won't be consecutive if canSwap passed)
          const improvement = curScore - (Math.max(newEmpScore, 0) + Math.max(newOtherScore, 0));
          if (improvement > 0 && (!bestSwap || improvement > bestSwap.improvement)) {
            bestSwap = { otherId, otherSid, improvement };
          }
        }
        if (bestSwap) {
          weekAssignment.set(empId, bestSwap.otherSid);
          weekAssignment.set(bestSwap.otherId, stationId);
        }
      }

      // Update rotation history and last-week tracking (ALL employees)
      for (const [empId, stationId] of weekAssignment) {
        const hk = `${empId}-${stationId}`;
        weeklyStationHistory.set(hk, (weeklyStationHistory.get(hk) ?? 0) + 1);
        lastWeekMLT.set(`${empId}-${shiftId}`, stationId);
        lastWeekStation.set(`${empId}-${shiftId}`, stationId);
      }

      // Apply weekly assignment to each day's assignments
      for (const dailyGroup of dailyGroups) {
        for (const a of dailyGroup) {
          const assignedStation = weekAssignment.get(a.employee_id);
          if (assignedStation !== undefined) {
            a.station_id = assignedStation;
          }
        }

        // Daily fix-up: after weekly assignment is applied, fix staffing and MLT gaps
        // using Admin-parked employees (admins and Admin-preferred like Shayna)
        const getMinNeeded = (station: any) =>
          groupShiftName === 'am' ? station.min_staff_am ?? station.min_staff ?? 1
          : groupShiftName === 'pm' ? station.min_staff_pm ?? station.min_staff ?? 1
          : groupShiftName === 'night' ? station.min_staff_night ?? station.min_staff ?? 1
          : station.min_staff ?? 1;
        const getMaxNeeded = (station: any) => station.max_staff ?? 99;

        // Step 1: Pull admins from Admin to understaffed real stations
        for (const station of realStations) {
          const minNeeded = getMinNeeded(station);
          const maxAllowed = getMaxNeeded(station);
          let currentStaff = dailyGroup.filter(a => a.station_id === station.id).length;
          while (currentStaff < minNeeded && currentStaff < maxAllowed) {
            const sup = dailyGroup.find(a =>
              adminStation && a.station_id === adminStation.id &&
              empRoleMap.get(a.employee_id) === 'admin' &&
              empStationMap.get(a.employee_id)!.includes(station.id)
            );
            if (!sup) break;
            sup.station_id = station.id;
            currentStaff++;
          }
        }

        // Step 1b: Before pulling admin-parked employees, try moving bench MLTs
        // from overstaffed stations to understaffed ones. This avoids pulling
        // admin-parked employees (like Shayna) when regular MLTs can cover.
        for (const station of realStations) {
          const minNeeded = getMinNeeded(station);
          const maxAllowed = getMaxNeeded(station);
          let currentStaff = dailyGroup.filter(a => a.station_id === station.id).length;
          while (currentStaff < minNeeded && currentStaff < maxAllowed) {
            // Find an MLT at an overstaffed station who can work here
            const donor = dailyGroup.find(a => {
              if (a.station_id === station.id) return false;
              if (!empStationMap.get(a.employee_id)!.includes(station.id)) return false;
              if (empRoleMap.get(a.employee_id) === 'admin') return false;
              if (adminStation && a.station_id === adminStation.id) return false; // handled later
              const theirStation = realStations.find(s => s.id === a.station_id);
              if (!theirStation) return false;
              const theirMin = getMinNeeded(theirStation);
              const theirCurrent = dailyGroup.filter(x => x.station_id === a.station_id).length;
              return theirCurrent > theirMin; // only from overstaffed
            });
            if (!donor) break;
            donor.station_id = station.id;
            currentStaff++;
          }
        }

        // Step 2: Pull Admin-parked non-admins (like Shayna) for staffing gaps
        // These employees are last-resort fillers — only pull them when no other
        // MLT at a bench station can cover the gap. Prefer their specialty station.
        // Sort stations so we fill the admin-parked employee's preferred bench station first.
        const adminParkedCandidates = adminStation ? dailyGroup.filter(a =>
          a.station_id === adminStation.id &&
          empRoleMap.get(a.employee_id) !== 'admin'
        ) : [];
        if (adminParkedCandidates.length > 0) {
          // Sort stations: prefer the candidate's higher-priority qualified stations
          const stationsNeedingStaff = realStations
            .filter(station => {
              const minNeeded = getMinNeeded(station);
              const currentStaff = dailyGroup.filter(a => a.station_id === station.id).length;
              return currentStaff < minNeeded;
            })
            .sort((a, b) => {
              // For each station, find the best-priority admin-parked candidate
              const aPrio = Math.min(...adminParkedCandidates
                .filter(c => empStationMap.get(c.employee_id)!.includes(a.id))
                .map(c => {
                  const quals = empStationMap.get(c.employee_id)!.filter(sid => sid !== adminStation!.id);
                  return quals.indexOf(a.id);
                })
                .filter(i => i >= 0), 99);
              const bPrio = Math.min(...adminParkedCandidates
                .filter(c => empStationMap.get(c.employee_id)!.includes(b.id))
                .map(c => {
                  const quals = empStationMap.get(c.employee_id)!.filter(sid => sid !== adminStation!.id);
                  return quals.indexOf(b.id);
                })
                .filter(i => i >= 0), 99);
              return aPrio - bPrio; // lower index = higher priority station for them
            });

          for (const station of stationsNeedingStaff) {
            const minNeeded = getMinNeeded(station);
            const maxAllowed = getMaxNeeded(station);
            let currentStaff = dailyGroup.filter(a => a.station_id === station.id).length;
            while (currentStaff < minNeeded && currentStaff < maxAllowed) {
              // Pick the candidate whose highest-priority bench station matches this one
              const candidate = adminParkedCandidates.find(a =>
                a.station_id === adminStation!.id &&
                empStationMap.get(a.employee_id)!.includes(station.id)
              );
              if (!candidate) break;
              candidate.station_id = station.id;
              currentStaff++;
            }
          }
        }

        // Step 2b: Swap admin-parked employees to their preferred bench station.
        // If Shayna ended up at Micro but prefers Hema, and there's an MLT at Hema
        // who can also do Micro, swap them so Shayna goes to her preferred station.
        for (const ap of adminParkedCandidates) {
          if (adminStation && ap.station_id === adminStation.id) continue; // still at Admin, skip
          const empId = ap.employee_id;
          const currentSid = ap.station_id!;
          if (!currentSid) continue;
          const benchQuals = empStationMap.get(empId)!.filter(sid => !adminStation || sid !== adminStation.id);
          const preferredSid = benchQuals[0]; // their #1 bench station
          if (!preferredSid || preferredSid === currentSid) continue; // already at preferred

          // Find someone at the preferred station who can cover where Shayna currently is
          const swapTarget = dailyGroup.find(a => {
            if (a.station_id !== preferredSid) return false;
            if (a.employee_id === empId) return false;
            if (!empStationMap.get(a.employee_id)!.includes(currentSid)) return false;
            // Don't swap admin-role employees off their assigned station
            if (empRoleMap.get(a.employee_id) === 'admin') return false;
            return true;
          });
          if (swapTarget) {
            ap.station_id = preferredSid;
            swapTarget.station_id = currentSid;
          }
        }

        // Step 3: MLT rebalance — if a station needs an MLT but doesn't have one,
        // try to pull an MLT from Admin or swap MLTs between stations
        for (const station of realStations) {
          if (station.require_cls !== 1) continue;
          const assignees = dailyGroup.filter(a => a.station_id === station.id);
          if (assignees.length === 0) continue;
          const hasMLT = assignees.some(a => empRoleMap.get(a.employee_id) === 'mlt');
          if (hasMLT) continue;

          // Try pulling an MLT from Admin (but NOT Admin-preferred employees —
          // they only get pulled for actual understaffing in Step 2, not MLT preference)
          if (adminStation) {
            const stationMax = getMaxNeeded(station);
            const stationCurrent = dailyGroup.filter(a => a.station_id === station.id).length;
            if (stationCurrent < stationMax) {
              const mltFromAdmin = dailyGroup.find(a =>
                a.station_id === adminStation.id &&
                empRoleMap.get(a.employee_id) === 'mlt' &&
                empStationMap.get(a.employee_id)!.includes(station.id) &&
                empStationMap.get(a.employee_id)![0] !== adminStation.id // skip Admin-preferred
              );
              if (mltFromAdmin) {
                mltFromAdmin.station_id = station.id;
                continue;
              }
            }
          }

          // Try swapping: find an MLT at another station who can work here,
          // and a non-MLT here who can work at the other station
          for (const otherStation of realStations) {
            if (otherStation.id === station.id) continue;
            const otherAssignees = dailyGroup.filter(a => a.station_id === otherStation.id);
            const otherMLTs = otherAssignees.filter(a => empRoleMap.get(a.employee_id) === 'mlt');
            // Only swap if other station has >1 MLT, or the station doesn't require MLTs
            const otherNeedsMLT = otherStation.require_cls === 1;
            // Skip if other station needs its only MLT AND no backup MLT from Admin
            // (include Admin-preferred MLTs as valid backup — they can fill in)
            if (otherNeedsMLT && otherMLTs.length <= 1) {
              const adminMLTBackup = adminStation && dailyGroup.some(a =>
                a.station_id === adminStation.id &&
                empRoleMap.get(a.employee_id) === 'mlt' &&
                empStationMap.get(a.employee_id)!.includes(otherStation.id)
              );
              if (!adminMLTBackup) continue;
            }

            for (const mlt of otherMLTs) {
              if (!empStationMap.get(mlt.employee_id)!.includes(station.id)) continue;
              // Find a non-MLT at this station that can go to the other station
              const swapCandidate = assignees.find(a =>
                empRoleMap.get(a.employee_id) !== 'mlt' &&
                empStationMap.get(a.employee_id)!.includes(otherStation.id)
              );
              if (swapCandidate) {
                mlt.station_id = station.id;
                swapCandidate.station_id = otherStation.id;
                // If we depleted the other station's MLT, pull backup from Admin
                const otherStillHasMLT = dailyGroup.filter(a => a.station_id === otherStation.id)
                  .some(a => empRoleMap.get(a.employee_id) === 'mlt');
                if (!otherStillHasMLT && otherStation.require_cls === 1 && adminStation) {
                  const backup = dailyGroup.find(a =>
                    a.station_id === adminStation.id &&
                    empRoleMap.get(a.employee_id) === 'mlt' &&
                    empStationMap.get(a.employee_id)!.includes(otherStation.id)
                  );
                  if (backup) backup.station_id = otherStation.id;
                }
                break;
              }
            }
            if (dailyGroup.filter(a => a.station_id === station.id).some(a => empRoleMap.get(a.employee_id) === 'mlt')) break;
          }

          // Last resort: get an Admin-parked MLT (e.g. Shayna) into this station
          if (adminStation) {
            const stillNoMLT = !dailyGroup.filter(a => a.station_id === station.id)
              .some(a => empRoleMap.get(a.employee_id) === 'mlt');
            if (stillNoMLT) {
              const adminMLTs = dailyGroup.filter(a =>
                a.station_id === adminStation.id &&
                empRoleMap.get(a.employee_id) === 'mlt' &&
                empStationMap.get(a.employee_id)!.includes(station.id)
              );
              if (adminMLTs.length > 0) {
                const stationCount = dailyGroup.filter(a => a.station_id === station.id).length;
                const stationMax = (station as any).max_staff ?? 99;

                if (stationCount < stationMax) {
                  // Room available — just pull the MLT in
                  adminMLTs[0].station_id = station.id;
                } else {
                  // Station is at max — relocate a non-MLT to make room
                  const nonMLTsHere = dailyGroup.filter(a =>
                    a.station_id === station.id && empRoleMap.get(a.employee_id) !== 'mlt'
                  );
                  let relocated = false;
                  for (const candidate of nonMLTsHere) {
                    // Find any station with room that this person can work at
                    const destStations = empStationMap.get(candidate.employee_id)!
                      .filter(sid => sid !== station.id)
                      .map(sid => {
                        const stn = [...realStations, adminStation].find(s => s && s.id === sid);
                        if (!stn) return null;
                        const cur = dailyGroup.filter(a => a.station_id === sid).length;
                        const max = (stn as any).max_staff ?? 99;
                        const min = stn.id === adminStation?.id ? 0 :
                          (groupShiftName === 'am' ? (stn as any).min_staff_am ?? stn.min_staff ?? 1
                          : stn.min_staff ?? 1);
                        return { sid, cur, max, min };
                      })
                      .filter((s): s is NonNullable<typeof s> => s !== null && s.cur < s.max)
                      .sort((a, b) => (a.cur - a.min) - (b.cur - b.min)); // prefer understaffed

                    if (destStations.length > 0) {
                      candidate.station_id = destStations[0].sid;
                      adminMLTs[0].station_id = station.id;
                      relocated = true;
                      break;
                    }
                  }
                  // After pulling admin-parked MLT, try swapping to their preferred bench station
                  if (relocated || stationCount < stationMax) {
                    const pulledMLT = adminMLTs[0];
                    const pulledBenchQuals = empStationMap.get(pulledMLT.employee_id)!
                      .filter(sid => !adminStation || sid !== adminStation.id);
                    const pulledPreferred = pulledBenchQuals[0];
                    if (pulledPreferred && pulledMLT.station_id !== pulledPreferred) {
                      // Find someone at their preferred station who can cover where they ended up
                      const swapForPreferred = dailyGroup.find(a => {
                        if (a.station_id !== pulledPreferred) return false;
                        if (a.employee_id === pulledMLT.employee_id) return false;
                        if (!empStationMap.get(a.employee_id)!.includes(pulledMLT.station_id!)) return false;
                        if (empRoleMap.get(a.employee_id) === 'admin') return false;
                        return true;
                      });
                      if (swapForPreferred) {
                        const tempSid = pulledMLT.station_id;
                        pulledMLT.station_id = pulledPreferred;
                        swapForPreferred.station_id = tempSid;
                      }
                    }
                  }
                  // Fallback: try swapping with someone who can go to Admin
                  if (!relocated) {
                    for (const adminMLT of adminMLTs) {
                      const swapOut = dailyGroup.find(a =>
                        a.station_id === station.id &&
                        empRoleMap.get(a.employee_id) !== 'mlt' &&
                        empStationMap.get(a.employee_id)!.includes(adminStation.id)
                      );
                      if (swapOut) {
                        adminMLT.station_id = station.id;
                        swapOut.station_id = adminStation.id;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Step 4: MLT redistribution — if an Admin-parked MLT can replace another MLT
      // at a station, freeing that MLT for a station that needs MLT coverage.
      // Also: on thin days, pull Admin-preferred MLTs to real stations to maximize coverage.
      for (const dailyGroup of dailyGroups) {
        const adminParkedMLTs = adminStation ? dailyGroup.filter(a =>
          a.station_id === adminStation.id && empRoleMap.get(a.employee_id) === 'mlt'
        ) : [];

        // Find stations that need an MLT but don't have one
        const stationsNeedingMLT = realStations.filter(station => {
          if (station.require_cls !== 1) return false;
          const assignees = dailyGroup.filter(a => a.station_id === station.id);
          if (assignees.length === 0) return false;
          return !assignees.some(a => empRoleMap.get(a.employee_id) === 'mlt');
        });

        // Chain swaps: move an MLT from station A to needy station, Admin MLT backfills A
        if (adminParkedMLTs.length > 0) for (const needyStation of stationsNeedingMLT) {
          for (const otherStation of realStations) {
            if (otherStation.id === needyStation.id) continue;
            const otherMLTs = dailyGroup.filter(a =>
              a.station_id === otherStation.id && empRoleMap.get(a.employee_id) === 'mlt'
            );
            for (const mlt of otherMLTs) {
              if (!empStationMap.get(mlt.employee_id)!.includes(needyStation.id)) continue;
              const backfillMLT = adminParkedMLTs.find(a =>
                empStationMap.get(a.employee_id)!.includes(otherStation.id)
              );
              if (!backfillMLT) continue;
              const needyCount = dailyGroup.filter(a => a.station_id === needyStation.id).length;
              const needyMax = (needyStation as any).max_staff ?? 99;
              if (needyCount >= needyMax) continue;
              mlt.station_id = needyStation.id;
              backfillMLT.station_id = otherStation.id;
              const idx = adminParkedMLTs.indexOf(backfillMLT);
              if (idx >= 0) adminParkedMLTs.splice(idx, 1);

              // If the backfill MLT ended up at a non-preferred bench station, try swapping
              const bfBenchQuals = empStationMap.get(backfillMLT.employee_id)!
                .filter(sid => !adminStation || sid !== adminStation.id);
              const bfPreferred = bfBenchQuals[0];
              if (bfPreferred && backfillMLT.station_id !== bfPreferred) {
                const bfSwap = dailyGroup.find(a => {
                  if (a.station_id !== bfPreferred) return false;
                  if (a.employee_id === backfillMLT.employee_id) return false;
                  if (!empStationMap.get(a.employee_id)!.includes(backfillMLT.station_id!)) return false;
                  if (empRoleMap.get(a.employee_id) === 'admin') return false;
                  return true;
                });
                if (bfSwap) {
                  const tmpSid = backfillMLT.station_id;
                  backfillMLT.station_id = bfPreferred;
                  bfSwap.station_id = tmpSid;
                }
              }

              break;
            }
            if (dailyGroup.filter(a => a.station_id === needyStation.id)
              .some(a => empRoleMap.get(a.employee_id) === 'mlt')) break;
          }
        }

        // Weekend MLT float: on weekends, Hema and Chemistry share MLT coverage.
        // If a station like Micro needs an MLT, we can move one from Hema/Chem
        // as long as the partner station still has an MLT to float.
        const thisDate = dailyGroup[0]?.date;
        const thisDow = thisDate ? getDow(thisDate) : -1;
        const isWeekendDay = thisDow === 0 || thisDow === 6;
        if (isWeekendDay) {
          const hemaStation = realStations.find(s => s.name === 'Hematology/UA');
          const chemStation = realStations.find(s => s.name === 'Chemistry');

          for (const needyStation of stationsNeedingMLT) {
            // Skip if this station already got an MLT from chain swaps above
            const nowHasMLT = dailyGroup.filter(a => a.station_id === needyStation.id)
              .some(a => empRoleMap.get(a.employee_id) === 'mlt');
            if (nowHasMLT) continue;

            // Try moving an MLT from Hema if Chemistry has one (or vice versa)
            const floatPairs = [
              { from: hemaStation, partner: chemStation },
              { from: chemStation, partner: hemaStation },
            ];
            for (const { from, partner } of floatPairs) {
              if (!from || !partner) continue;
              // Partner must have an MLT to provide float coverage
              const partnerHasMLT = dailyGroup.filter(a => a.station_id === partner.id)
                .some(a => empRoleMap.get(a.employee_id) === 'mlt');
              if (!partnerHasMLT) continue;

              const fromMLTs = dailyGroup.filter(a =>
                a.station_id === from.id && empRoleMap.get(a.employee_id) === 'mlt'
              );
              for (const mlt of fromMLTs) {
                if (!empStationMap.get(mlt.employee_id)!.includes(needyStation.id)) continue;
                const needyCount = dailyGroup.filter(a => a.station_id === needyStation.id).length;
                const needyMax = (needyStation as any).max_staff ?? 99;
                if (needyCount >= needyMax) continue;
                // Move MLT to needy station — Hema/Chem float covers the gap
                mlt.station_id = needyStation.id;
                break;
              }
              if (dailyGroup.filter(a => a.station_id === needyStation.id)
                .some(a => empRoleMap.get(a.employee_id) === 'mlt')) break;
            }
          }
        }

        // On thin days (<=10 AM staff), pull Admin-preferred MLTs to real stations
        // to maximize coverage rather than leaving them idle on Admin
        const totalStaff = dailyGroup.length;
        const adminCount = adminStation ? dailyGroup.filter(a =>
          a.station_id === adminStation.id && empRoleMap.get(a.employee_id) === 'admin'
        ).length : 0;
        const remainingAdminMLTs = adminStation ? dailyGroup.filter(a =>
          a.station_id === adminStation.id && empRoleMap.get(a.employee_id) === 'mlt'
        ) : [];

        if (totalStaff <= 10 && remainingAdminMLTs.length > 0 && adminCount >= 1) {
          for (const adminMLT of remainingAdminMLTs) {
            // Find the best real station: prefer understaffed, then any with room
            const candidates = empStationMap.get(adminMLT.employee_id)!
              .filter(sid => !adminStation || sid !== adminStation.id)
              .map(sid => {
                const stn = realStations.find(s => s.id === sid);
                if (!stn) return null;
                const cur = dailyGroup.filter(a => a.station_id === sid).length;
                const max = (stn as any).max_staff ?? 99;
                const min = groupShiftName === 'am' ? (stn as any).min_staff_am ?? stn.min_staff ?? 1 : stn.min_staff ?? 1;
                return { sid, cur, max, min, deficit: min - cur };
              })
              .filter((s): s is NonNullable<typeof s> => s !== null && s.cur < s.max)
              .sort((a, b) => b.deficit - a.deficit); // most understaffed first

            if (candidates.length > 0) {
              adminMLT.station_id = candidates[0].sid;
            }
          }
        }
      }

      // Daily over-max fix: move excess employees from overstaffed to understaffed stations
      const getStationMax = (stn: any) => stn.max_staff ?? 99;
      const getStationMin = (stn: any) =>
        groupShiftName === 'am' ? stn.min_staff_am ?? stn.min_staff ?? 1
        : groupShiftName === 'pm' ? stn.min_staff_pm ?? stn.min_staff ?? 1
        : groupShiftName === 'night' ? stn.min_staff_night ?? stn.min_staff ?? 1
        : stn.min_staff ?? 1;

      for (const dailyGroup of dailyGroups) {
        let improved = true;
        while (improved) {
          improved = false;
          for (const station of realStations) {
            const maxAllowed = getStationMax(station);
            const assignees = dailyGroup.filter(a => a.station_id === station.id);
            if (assignees.length <= maxAllowed) continue;

            // Find the most flexible person here to move elsewhere
            const moveCandidates = assignees
              .filter(a => empRoleMap.get(a.employee_id) !== 'admin')
              .map(a => ({
                a,
                flex: empStationMap.get(a.employee_id)!.filter(sid => !adminStation || sid !== adminStation.id).length,
                isMlt: empRoleMap.get(a.employee_id) === 'mlt',
              }))
              .sort((x, y) => {
                // Keep MLTs in place if this station requires them (move non-MLTs first)
                if (station.require_cls === 1) {
                  if (x.isMlt !== y.isMlt) return x.isMlt ? 1 : -1;
                }
                return y.flex - x.flex; // most flexible first
              });

            for (const { a: candidate } of moveCandidates) {
              // Find an understaffed station they can go to
              const altStations = empStationMap.get(candidate.employee_id)!
                .filter(sid => sid !== station.id && (!adminStation || sid !== adminStation.id))
                .map(sid => {
                  const stn = realStations.find(s => s.id === sid);
                  if (!stn) return null;
                  const current = dailyGroup.filter(a => a.station_id === sid).length;
                  const min = getStationMin(stn);
                  const max = getStationMax(stn);
                  return { sid, current, min, max, deficit: min - current };
                })
                .filter((s): s is NonNullable<typeof s> => s !== null && s.current < s.max)
                .sort((a, b) => b.deficit - a.deficit); // most understaffed first

              if (altStations.length > 0) {
                candidate.station_id = altStations[0].sid;
                improved = true;
                break; // recheck this station
              }
            }

            // If still overstaffed, try moving someone to Admin
            if (dailyGroup.filter(a => a.station_id === station.id).length > maxAllowed && adminStation) {
              const toAdmin = assignees.find(a =>
                empStationMap.get(a.employee_id)!.includes(adminStation.id) &&
                empRoleMap.get(a.employee_id) !== 'admin' &&
                empRoleMap.get(a.employee_id) !== 'mlt' // MLTs should never go to Admin
              );
              if (toAdmin) {
                toAdmin.station_id = adminStation.id;
                improved = true;
              }
            }
          }
        }
      }

      // Max 1 MLT per station: if a station has 2+ MLTs, move extras to stations without MLTs
      for (const dailyGroup of dailyGroups) {
        for (const station of realStations) {
          const stationMLTs = dailyGroup.filter(a =>
            a.station_id === station.id && empRoleMap.get(a.employee_id) === 'mlt'
          );
          if (stationMLTs.length <= 1) continue;

          // Keep the one with fewest alternative stations (most locked), move the rest
          const sortedMLTs = stationMLTs.sort((a, b) => {
            const aFlex = empStationMap.get(a.employee_id)!.filter(sid => !adminStation || sid !== adminStation.id).length;
            const bFlex = empStationMap.get(b.employee_id)!.filter(sid => !adminStation || sid !== adminStation.id).length;
            return aFlex - bFlex; // least flexible first (stays)
          });

          for (let i = 1; i < sortedMLTs.length; i++) {
            const excessMLT = sortedMLTs[i];
            // Find a station that needs an MLT but doesn't have one
            const needyStations = realStations.filter(s => {
              if (s.id === station.id) return false;
              if (s.require_cls !== 1) return false;
              if (!empStationMap.get(excessMLT.employee_id)!.includes(s.id)) return false;
              const hasMLT = dailyGroup.filter(a => a.station_id === s.id)
                .some(a => empRoleMap.get(a.employee_id) === 'mlt');
              if (hasMLT) return false;
              const cur = dailyGroup.filter(a => a.station_id === s.id).length;
              const max = getStationMax(s);
              return cur < max; // must have room
            }).sort((a, b) => {
              const aCur = dailyGroup.filter(x => x.station_id === a.id).length;
              const bCur = dailyGroup.filter(x => x.station_id === b.id).length;
              const aMin = getStationMin(a);
              const bMin = getStationMin(b);
              return (aCur - aMin) - (bCur - bMin); // most understaffed first
            });

            if (needyStations.length > 0) {
              excessMLT.station_id = needyStations[0].id;
            }
            // MLTs should never go to Admin — if no needy station, they stay where they are
            // (2 MLTs at same station is less bad than an MLT on Admin)
          }
        }
      }

      // Final sweep: admin-parked employees (like Shayna) should be at their
      // preferred bench station whenever possible. If they ended up at a non-preferred
      // station through any code path (Step 2, 3, 4, etc.), swap them with someone
      // at their preferred station who can cover the non-preferred one.
      if (adminStation) {
        for (const dailyGroup of dailyGroups) {
          const adminParked = dailyGroup.filter(a => {
            const quals = empStationMap.get(a.employee_id);
            return quals && quals[0] === adminStation.id && empRoleMap.get(a.employee_id) !== 'admin';
          });
          for (const ap of adminParked) {
            if (ap.station_id === adminStation.id) continue; // at Admin, fine
            const currentSid = ap.station_id!;
            if (!currentSid) continue;
            const benchQuals = empStationMap.get(ap.employee_id)!.filter(sid => sid !== adminStation.id);
            const preferredSid = benchQuals[0];
            if (!preferredSid || preferredSid === currentSid) continue;

            const swapTarget = dailyGroup.find(a => {
              if (a.station_id !== preferredSid) return false;
              if (a.employee_id === ap.employee_id) return false;
              if (!empStationMap.get(a.employee_id)!.includes(currentSid)) return false;
              if (empRoleMap.get(a.employee_id) === 'admin') return false;
              return true;
            });
            if (swapTarget) {
              ap.station_id = preferredSid;
              swapTarget.station_id = currentSid;
            }
          }
        }
      }

      // Per-day warnings (staffing may vary day-to-day due to PTO/off days)
      for (const dailyGroup of dailyGroups) {
        const date = dailyGroup[0].date;
        for (const station of realStations) {
          const minNeeded = groupShiftName === 'am' ? (station as any).min_staff_am ?? station.min_staff ?? 1
            : groupShiftName === 'pm' ? (station as any).min_staff_pm ?? station.min_staff ?? 1
            : groupShiftName === 'night' ? (station as any).min_staff_night ?? station.min_staff ?? 1
            : station.min_staff ?? 1;
          const maxAllowed = (station as any).max_staff ?? 99;
          const stationAssignees = dailyGroup.filter(a => a.station_id === station.id);
          const assignedCount = stationAssignees.length;
          if (assignedCount < minNeeded) {
            // On weekends, Hema and Chemistry share coverage via MLT float —
            // suppress understaffing if combined Hema+Chem meets combined needs
            const wDow = getDow(date);
            const isWkend = wDow === 0 || wDow === 6;
            const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
            let suppressUnderstaff = false;
            if (isWkend && isHemaOrChem) {
              // On weekends, 1 MLT floats between Hema and Chemistry — this satisfies
              // the min requirement for both stations, so suppress individual understaffing
              suppressUnderstaff = true;
            }
            if (!suppressUnderstaff) {
              const shiftName = shifts.find(s => s.id === shiftIdNum)?.name ?? 'Unknown';
              passWarnings.push(`CRITICAL: ${station.name} needs ${minNeeded} staff but only ${assignedCount} assigned on ${date} (${shiftName})`);
            }
          }
          if (assignedCount > maxAllowed) {
            const shiftName = shifts.find(s => s.id === shiftIdNum)?.name ?? 'Unknown';
            passWarnings.push(`WARNING: ${station.name} has ${assignedCount} staff but max is ${maxAllowed} on ${date} (${shiftName})`);
          }
          if (stationAssignees.length > 0) {
            if (station.require_cls === 1) {
              const hasMLT = stationAssignees.some(a => empRoleMap.get(a.employee_id) === 'mlt');
              if (!hasMLT) {
                // On weekends, MLTs float between Hema and Chemistry — if either has
                // an MLT, suppress the warning for the other
                const dow = getDow(date);
                const isWeekend = dow === 0 || dow === 6;
                const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
                let suppressMLTWarning = false;
                if (isWeekend && isHemaOrChem) {
                  // On weekends, 1 MLT floats between Hema and Chemistry —
                  // suppress "no MLT" for both stations entirely
                  suppressMLTWarning = true;
                }
                if (!suppressMLTWarning) {
                  const shiftName = shifts.find(s => s.id === shiftIdNum)?.name ?? 'Unknown';
                  passWarnings.push(`PIVOTAL: ${station.name} has no MLT assigned on ${date} (${shiftName})`);
                }
              }
            }
          }
        }
      }
    }

    // ── Station warnings (exclude Admin station) ──
    const warnStations = stations.filter(s => s.name !== 'Admin');

    // Stations with no qualified employees
    for (const station of warnStations) {
      const qualifiedEmps = employees.filter(e => empStationMap.get(e.id)?.includes(station.id));
      if (qualifiedEmps.length === 0) {
        passWarnings.push(`Station "${station.name}" has no qualified employees assigned`);
      }
    }

    // Pivotal employee detection
    for (const station of warnStations) {
      const qualifiedIds = employees.filter(e => empStationMap.get(e.id)?.includes(station.id)).map(e => e.id);

      if (qualifiedIds.length <= 1) {
        const name = qualifiedIds.length === 1
          ? employees.find(e => e.id === qualifiedIds[0])?.name
          : 'No one';
        passWarnings.push(`CRITICAL: ${name} is the ONLY person qualified for ${station.name} — no backup`);
        continue;
      }

      for (const [, group] of shiftDateGroups) {
        const stationAssignees = group.filter(a => a.station_id === station.id);
        if (stationAssignees.length === 1) {
          // If min_staff is 1, having 1 person meets the requirement — not pivotal
          const groupShiftName = shifts.find(s => s.id === group[0].shift_id)?.name?.toLowerCase() ?? '';
          const minNeeded = groupShiftName === 'am' ? (station as any).min_staff_am ?? station.min_staff ?? 1
            : groupShiftName === 'pm' ? (station as any).min_staff_pm ?? station.min_staff ?? 1
            : groupShiftName === 'night' ? (station as any).min_staff_night ?? station.min_staff ?? 1
            : station.min_staff ?? 1;
          if (minNeeded <= 1) continue;

          const pivotal = employees.find(e => e.id === stationAssignees[0].employee_id);
          const others = qualifiedIds.filter(id => id !== stationAssignees[0].employee_id);
          const anyBackup = others.some(id => result.some(r => r.employee_id === id && r.date === stationAssignees[0].date));
          if (!anyBackup) {
            const shiftName = shifts.find(s => s.id === stationAssignees[0].shift_id)?.name ?? 'Unknown';
            passWarnings.push(`PIVOTAL: ${pivotal?.name} is sole ${station.name} coverage on ${stationAssignees[0].date} (${shiftName})`);
          }
        }
      }
    }

    // Time-off conflicts with station coverage
    for (const to of timeOff) {
      const empStations = empStationMap.get(to.employee_id) ?? [];
      if (empStations.length === 0) continue;
      const empName = employees.find(e => e.id === to.employee_id)?.name ?? `Employee #${to.employee_id}`;
      for (const stationId of empStations) {
        const station = warnStations.find(s => s.id === stationId);
        if (!station) continue;
        const others = employees.filter(e => e.id !== to.employee_id && empStationMap.get(e.id)?.includes(stationId));
        const othersWorking = others.filter(e => result.some(r => r.employee_id === e.id && r.date === to.date));
        if (othersWorking.length === 0) {
          passWarnings.push(`CRITICAL: ${empName} is off ${to.date} but no other ${station.name}-qualified employee is scheduled — deny time-off or reassign coverage`);
        }
      }
    }

    // Count criticals for this pass
    const passCriticals = countCriticals(result, stations, shifts);
    if (passCriticals < bestCriticalCount) {
      bestCriticalCount = passCriticals;
      bestPassWarnings = [...passWarnings];
      bestStationAssignments = new Map();
      for (const a of result) {
        if (a.station_id !== null) {
          bestStationAssignments.set(`${a.employee_id}-${a.date}-${a.shift_id}`, a.station_id);
        }
      }
    }
    } // end multi-pass loop

    // Merge best pass's warnings into main warnings
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
