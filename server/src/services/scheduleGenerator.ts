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
    SELECT es.employee_id, es.station_id, es.weight FROM employee_stations es
    JOIN stations s ON es.station_id = s.id WHERE s.is_active = 1
    ORDER BY es.employee_id, es.priority
  `).all() as { employee_id: number; station_id: number; weight: number }[];
  const empStationMap = new Map<number, number[]>();
  for (const row of empStationRows) {
    if (!empStationMap.has(row.employee_id)) empStationMap.set(row.employee_id, []);
    empStationMap.get(row.employee_id)!.push(row.station_id);
  }
  const benchStationIdsAnalyze = stations.filter(s => s.name !== 'Admin').map(s => s.id);
  const allStationIdsAnalyze = stations.map(s => s.id);
  for (const emp of employees) {
    if (!empStationMap.has(emp.id) || empStationMap.get(emp.id)!.length === 0) {
      empStationMap.set(emp.id, emp.role === 'admin' ? [...allStationIdsAnalyze] : [...benchStationIdsAnalyze]);
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
    // Helper: CLS needed for a station on a given shift
    const getCLSNeededAnalyze = (station: typeof warnStations[0], shiftName: string): number => {
      if (shiftName === 'am') return (station as any).min_staff_am ?? station.min_staff ?? 1;
      if (shiftName === 'pm') return (station as any).min_staff_pm ?? station.min_staff ?? 1;
      if (shiftName === 'night') return (station as any).min_staff_night ?? station.min_staff ?? 1;
      return station.min_staff ?? 1;
    };
    const getMLTSlotsAnalyze = (station: typeof warnStations[0], shiftName?: string): number => {
      return (station as any).min_mlt || (station.require_cls === 1 ? 1 : 0);
    };
    const getMinStaffAnalyze = (station: typeof warnStations[0], shiftName: string): number => {
      return getCLSNeededAnalyze(station, shiftName) + getMLTSlotsAnalyze(station, shiftName);
    };

    for (const [, group] of shiftDateGroups) {
      const groupShiftName = shifts.find(s => s.id === group[0].shift_id)?.name?.toLowerCase() ?? '';
      const isAMShift = groupShiftName === 'am';
      for (const station of warnStations) {
        const minNeeded = getMinStaffAnalyze(station, groupShiftName);
        const stationAssignees = group.filter(a => a.station_id === station.id);
        const assigned = stationAssignees.length;
        if (assigned < minNeeded) {
          const dow = getDow(group[0].date);
          const isWkend = dow === 0 || dow === 6;
          const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
          // On weekends, 1 MLT floats between Hema and Chemistry — suppress individual understaffing
          if (!(isWkend && isHemaOrChem)) {
            const shiftName = shifts.find(s => s.id === group[0].shift_id)?.name ?? 'Unknown';
            // PM/Night per-station shortages are INFO (only 1-3 people cover all stations)
            const severity = isAMShift ? 'CRITICAL' : 'INFO';
            warnings.push(`${severity}: ${station.name} needs ${minNeeded} staff but only ${assigned} assigned on ${group[0].date} (${shiftName})`);
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
              const severity = isAMShift ? 'CRITICAL' : 'INFO';
              warnings.push(`${severity}: ${station.name} has no CLS assigned on ${group[0].date} (${shiftName})`);
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
          const minNeeded = getMinStaffAnalyze(station, groupShiftName);
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

    // Time-off conflicts (skip Admin, only full-day PTO is a coverage gap)
    for (const to of timeOff) {
      if (to.off_type !== 'full') continue;
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

  // Partial PTO checks
  const partialTimeOff = timeOff.filter(t => t.off_type === 'custom');
  const partialPTOSetAnalyze = new Set(partialTimeOff.map(t => `${t.employee_id}-${t.date}`));

  // 1) Partial PTO without any assignment
  for (const to of partialTimeOff) {
    const hasAssignment = result.some(a => a.employee_id === to.employee_id && a.date === to.date);
    if (!hasAssignment) {
      const empName = employees.find(e => e.id === to.employee_id)?.name ?? `Employee #${to.employee_id}`;
      warnings.push(`${to.date} ${empName} has partial PTO but no station assigned — assign a station for the hours they're working`);
    }
  }

  // 2) Partial PTO coverage gap — station's only employee(s) have partial PTO,
  //    no full-day backup is assigned to cover the rest of the shift
  const warnStationsPartial = stations.filter(s => s.name !== 'Admin');
  for (const shift of shifts) {
    const shiftLabel = shift.name;
    for (const date of dates) {
      const dayAssignments = result.filter(a => a.date === date && a.shift_id === shift.id);
      for (const station of warnStationsPartial) {
        const stationAssignees = dayAssignments.filter(a => a.station_id === station.id);
        if (stationAssignees.length === 0) continue;
        const partialEmps = stationAssignees.filter(a => partialPTOSetAnalyze.has(`${a.employee_id}-${date}`));
        if (partialEmps.length === 0) continue;
        const fullDayEmps = stationAssignees.filter(a => !partialPTOSetAnalyze.has(`${a.employee_id}-${date}`));
        if (fullDayEmps.length > 0) continue; // has full-day coverage
        const names = partialEmps.map(a => employees.find(e => e.id === a.employee_id)?.name ?? `#${a.employee_id}`).join(', ');
        warnings.push(`CRITICAL: ${station.name} on ${date} — ${names} has partial PTO with no coverage for the remainder of the shift (${shiftLabel})`);
      }
    }
  }

  // Hours warnings (exclude admins)
  for (const emp of employees) {
    if (emp.role === 'admin') continue;
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
    employee_id: number; date: string; off_type: string; start_time: string | null; end_time: string | null;
  }[];
  const timeOffSet = new Set(timeOff.filter(t => t.off_type === 'full').map(t => `${t.employee_id}-${t.date}`));
  // Partial PTO lookup: "empId-date" → true for employees working a partial day
  const partialPTOSet = new Set(timeOff.filter(t => t.off_type === 'custom').map(t => `${t.employee_id}-${t.date}`));

  const stations = db.prepare('SELECT * FROM stations WHERE is_active = 1 ORDER BY id').all() as Station[];
  const empStationRows = db.prepare(`
    SELECT es.employee_id, es.station_id, es.weight FROM employee_stations es
    JOIN stations s ON es.station_id = s.id WHERE s.is_active = 1
    ORDER BY es.employee_id, es.priority
  `).all() as { employee_id: number; station_id: number; weight: number }[];

  const empStationMap = new Map<number, number[]>();
  // Preference weight per (employee, station) — 0-100. Default 50 = neutral.
  const empStationWeight = new Map<string, number>();
  for (const row of empStationRows) {
    if (!empStationMap.has(row.employee_id)) empStationMap.set(row.employee_id, []);
    empStationMap.get(row.employee_id)!.push(row.station_id);
    empStationWeight.set(`${row.employee_id}-${row.station_id}`, row.weight ?? 50);
  }

  // Helper: get weight for a (employee, station) pair. Returns 50 if unset.
  const getWeight = (empId: number, stationId: number): number => {
    return empStationWeight.get(`${empId}-${stationId}`) ?? 50;
  };
  // If an employee has no station qualifications, treat them as qualified for bench stations
  // Admin station is only for admin-role employees or those explicitly assigned to it
  const adminStationObj = stations.find(s => s.name === 'Admin');
  const benchStationIds = stations.filter(s => s.name !== 'Admin').map(s => s.id);
  const allStationIds = stations.map(s => s.id);
  for (const emp of employees) {
    if (!empStationMap.has(emp.id) || empStationMap.get(emp.id)!.length === 0) {
      if (emp.role === 'admin') {
        empStationMap.set(emp.id, [...allStationIds]);
      } else {
        empStationMap.set(emp.id, [...benchStationIds]);
      }
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
  const getMLTSlots = (station: Station, shiftName?: string): number => {
    return (station as any).min_mlt || (station.require_cls === 1 ? 1 : 0);
  };
  // Chemistry and Hematology/UA can absorb 1 extra CLS as overflow
  const isOverflowStation = (station: Station): boolean => {
    return station.name === 'Chemistry';
  };

  // Total max staff = CLS needed + MLT slots + 1 extra for overflow stations
  const getMaxStaff = (station: Station, shiftName: string): number => {
    const base = getCLSNeeded(station, shiftName) + getMLTSlots(station, shiftName);
    return isOverflowStation(station) ? base + 1 : base;
  };
  // Min staff for warnings (the actual requirement, not the overflow cap)
  const getMinStaff = (station: Station, shiftName: string): number => {
    return getCLSNeeded(station, shiftName) + getMLTSlots(station, shiftName);
  };
  // Max CLS = base CLS count + 1 for overflow stations (Chem/Hema can take 2 CLS)
  const getMaxCLS = (station: Station, shiftName: string): number => {
    const base = getCLSNeeded(station, shiftName);
    return isOverflowStation(station) ? base + 1 : base;
  };
  // Max MLT per station = 1 if station allows, 0 otherwise (hard global rule)
  const getMaxMLT = (station: Station, shiftName?: string): number => {
    // MLTs are always allowed (up to 1) at stations that require CLS, even on non-AM shifts
    // The difference is: AM *requires* MLT, PM/Night *allows* MLT but doesn't require
    return (station as any).min_mlt || (station.require_cls === 1 ? 1 : 0);
  };

  // ── Global station placement guard ──
  // Every layer MUST call this before placing anyone at a station.
  // Returns true if the employee can be placed without violating caps.
  const canPlaceAtStation = (
    empId: number,
    stationId: number,
    stationMap: Map<number, number>,
    empRoleMap: Map<number, string>,
    shiftName: string,
  ): boolean => {
    const station = stations.find(s => s.id === stationId);
    if (!station) return false;

    // Total cap
    const currentTotal = [...stationMap.values()].filter(v => v === stationId).length;
    if (currentTotal >= getMaxStaff(station, shiftName)) return false;

    const role = empRoleMap.get(empId);

    // MLT cap: hard limit of 1 MLT per station
    if (role === 'mlt') {
      const mltsHere = [...stationMap.entries()].filter(([eid, s]) =>
        s === stationId && empRoleMap.get(eid) === 'mlt'
      ).length;
      if (mltsHere >= getMaxMLT(station, shiftName)) return false;
    }

    // CLS cap: max CLS per station
    if (role === 'cls' || role === 'admin') {
      const clsHere = [...stationMap.entries()].filter(([eid, s]) =>
        s === stationId && isCLSRole(eid, empRoleMap)
      ).length;
      if (clsHere >= getMaxCLS(station, shiftName)) return false;
    }

    return true;
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
      const isAM = shiftName === 'am';
      for (const station of realStns) {
        const stationAssignees = group.filter(a => a.station_id === station.id);

        // Only score AM per-station issues — PM/Night have too few staff to fill every station
        if (isAM) {
          const minNeeded = getMinStaff(station, shiftName);
          // Understaffed
          if (stationAssignees.length < minNeeded) {
            const dow = getDow(group[0].date);
            const isWkend = dow === 0 || dow === 6;
            const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
            if (!(isWkend && isHemaOrChem)) criticals++;
          }
          // 2+ MLTs at same station
          const mltCount = stationAssignees.filter(a => empRoleMap.get(a.employee_id) === 'mlt').length;
          if (mltCount > 1) criticals += 3 * (mltCount - 1);
          // Missing CLS at require_cls station
          if (station.require_cls === 1 && stationAssignees.length > 0) {
            if (!stationAssignees.some(a => isCLSRole(a.employee_id, empRoleMap))) pivotals++;
          }
        }

        // Overstaffed check applies to all shifts — skip for partial PTO coverage
        // where the extra person is intentionally covering the departing employee
        const dateStr = group[0].date;
        const hasPartialPTOHere = stationAssignees.some(a => partialPTOSet.has(`${a.employee_id}-${dateStr}`));
        if (stationAssignees.length > getMaxStaff(station, shiftName) && !hasPartialPTOHere) criticals += 10;
      }
    }

    return {
      criticals,
      pivotals,
      rotationPenalty: 0,
      total: criticals * 10000 + pivotals * 100,
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

    // ── Layer 1: Blood Bank — assign exactly 1 CLS, prefer highest BB weight ──
    function layer1_bloodBank(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
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

      // Sort by BB weight fraction descending — employees with a high BB preference
      // share get picked first. This directly reflects slider weights without
      // historical rotation counters.
      const bbWeightFrac = (empId: number) => {
        const quals = getBenchQuals(empId);
        const totalW = quals.reduce((sum, q) => sum + getWeight(empId, q), 0) || 1;
        return getWeight(empId, bloodBankStation.id) / totalW;
      };
      const sorted = [...bbQualified].sort((a, b) => {
        const diff = bbWeightFrac(b.employee_id) - bbWeightFrac(a.employee_id);
        if (Math.abs(diff) > 0.0001) return diff;
        // On pass 0 use stable order; on later passes, randomize ties
        return passIdx === 0 ? a.employee_id - b.employee_id : Math.random() - 0.5;
      });

      const chosen = sorted[0];
      stationMap.set(chosen.employee_id, bloodBankStation.id);
      locked.add(chosen.employee_id);
    }

    // ── Layer 2: MLT Placement — exactly 1 MLT per require_cls station ──
    function layer2_mltPlacement(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      passIdx: number,
      shiftName: string,
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

      // Pre-lock MLTs with only 1 bench station — they MUST go there (max 1 MLT per station)
      const lockedMLTStations = new Set<number>();
      for (const empId of mltPool) {
        const benchQuals = getBenchQuals(empId).filter(sid =>
          mltStations.some(s => s.id === sid)
        );
        if (benchQuals.length === 1 && !lockedMLTStations.has(benchQuals[0])) {
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
          // Score based on direct weight: reward placing MLTs at their preferred stations
          for (const [empId, stationId] of assignment) {
            const quals = getBenchQuals(empId).filter(sid =>
              mltStations.some(s => s.id === sid)
            );
            const w = getWeight(empId, stationId);
            const totalW = quals.reduce((sum, q) => sum + getWeight(empId, q), 0) || 1;
            const weightFrac = w / totalW;
            score -= weightFrac * 900;
          }
          // Penalize unfilled stations
          score += (remainingStations.length - assignment.size) * 1000;
          // Hard reject 2+ MLTs at same station
          const counts = new Map<number, number>();
          for (const [, sid] of assignment) counts.set(sid, (counts.get(sid) ?? 0) + 1);
          for (const [, c] of counts) if (c > 1) return; // skip invalid assignment

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

    // ── Layer 4: CLS Station Assignment — fill bench with CLS, weight-driven ──
    function layer4_clsRotation(
      pool: Assignment[],
      locked: Set<number>,
      stationMap: Map<number, number>,
      shiftName: string,
      passIdx: number,
      overflowBalance: Map<number, number>,
    ) {
      const clsEmps = pool.filter(a =>
        !locked.has(a.employee_id)
        && empRoleMap.get(a.employee_id) === 'cls'
        && employees.find(e => e.id === a.employee_id)?.employment_type !== 'per-diem'
        && !isAdminParked(a.employee_id)
      );
      const uniqueCLSIds = [...new Set(clsEmps.map(a => a.employee_id))];

      // Sort: single-station employees always first, then most-constrained or shuffled.
      // Within multi-station: order by *preference strength* descending, so employees
      // with a strong weighted preference claim their preferred station BEFORE
      // flat-preference employees fill it up.
      const prefStrength = (id: number): number => {
        const qs = getBenchQuals(id);
        if (qs.length <= 1) return 1;
        const weights = qs.map(q => getWeight(id, q));
        const total = weights.reduce((s, w) => s + w, 0) || 1;
        return Math.max(...weights) / total; // 1/n = flat, → 1 = maximally skewed
      };
      const singleStation = uniqueCLSIds.filter(id => getBenchQuals(id).length === 1);
      const multiStation = uniqueCLSIds.filter(id => getBenchQuals(id).length > 1);
      let orderedCLS: number[];
      if (passIdx === 0) {
        // Primary: preference strength desc. Secondary: fewer quals first (more constrained).
        const sortedMulti = [...multiStation].sort((a, b) => {
          const sa = prefStrength(a), sb = prefStrength(b);
          if (Math.abs(sa - sb) > 0.01) return sb - sa;
          return getBenchQuals(a).length - getBenchQuals(b).length;
        });
        orderedCLS = [...singleStation, ...sortedMulti];
      } else {
        // Later passes: preserve strong-preference priority but shuffle ties
        const strong = multiStation.filter(id => prefStrength(id) > 0.5);
        const flat = multiStation.filter(id => prefStrength(id) <= 0.5);
        strong.sort((a, b) => prefStrength(b) - prefStrength(a));
        orderedCLS = [...singleStation, ...strong, ...shuffle(flat)];
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

        const totalW = quals.reduce((sum, q) => sum + getWeight(empId, q), 0) || 1;

        for (const sid of quals) {
          const station = realStations.find(s => s.id === sid);
          if (!station) continue;

          const current = stationCount.get(sid) ?? 0;
          const minNeeded = getMinStaff(station, shiftName);

          // Hard block: station meets its base requirement — Layer 4 only fills minimums
          // Overflow (2nd CLS at Chem/Hema) is handled by Layer 7
          if (current >= minNeeded) continue;

          const clsCount = [...stationMap.entries()].filter(([eid, s]) =>
            s === sid && isCLSRole(eid, empRoleMap)
          ).length;
          const baseCLSCap = getCLSNeeded(station, shiftName);

          // Hard block: base CLS slots full (no overflow in Layer 4)
          if (clsCount >= baseCLSCap) continue;

          let score = 0;

          // Direct weight scoring: higher weight fraction = lower score = preferred.
          // This directly maps slider preferences to placement without historical
          // tracking. Employee with Micro=70, Hema=30 will always prefer Micro.
          const weightFrac = getWeight(empId, sid) / totalW;
          score -= weightFrac * 5000;

          // Light tiebreaker for stations that still need bodies
          score -= 50 * (minNeeded - current);

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
          // Track overflow CLS at Chem/Hema for monthly balance
          const bStation = realStations.find(s => s.id === bestStation);
          if (bStation && isOverflowStation(bStation)) {
            const prevCount = stationCount.get(bestStation) ?? 0;
            if (prevCount > getMinStaff(bStation, shiftName)) {
              overflowBalance.set(bestStation, (overflowBalance.get(bestStation) ?? 0) + 1);
            }
          }
        }
      }

      // Swap improvement pass: try swapping pairs to improve weight alignment.
      // Swap if it places both employees closer to their highest-weighted station.
      const weightScore = (empId: number, sid: number): number => {
        const quals = getBenchQuals(empId);
        const totalW = quals.reduce((sum, q) => sum + getWeight(empId, q), 0) || 1;
        return getWeight(empId, sid) / totalW;
      };
      for (const empA of orderedCLS) {
        if (!stationMap.has(empA)) continue;
        const stA = stationMap.get(empA)!;

        for (const empB of orderedCLS) {
          if (empA >= empB || !stationMap.has(empB)) continue;
          const stB = stationMap.get(empB)!;
          if (stA === stB) continue;

          // Check both can work at each other's station
          if (!getBenchQuals(empA).includes(stB)) continue;
          if (!getBenchQuals(empB).includes(stA)) continue;

          const scoreBefore = weightScore(empA, stA) + weightScore(empB, stB);
          const scoreAfter = weightScore(empA, stB) + weightScore(empB, stA);

          if (scoreAfter > scoreBefore) {
            // Swap improves total weight alignment
            stationMap.set(empA, stB);
            stationMap.set(empB, stA);
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
            // Hard reject 2+ MLTs at same station
            const counts = new Map<number, number>();
            for (const [, sid] of assignment) counts.set(sid, (counts.get(sid) ?? 0) + 1);
            for (const [, c] of counts) if (c > 1) return; // skip invalid assignment

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
      overflowBalance: Map<number, number>,
    ) {
      for (const a of pool) {
        if (stationMap.has(a.employee_id)) continue;

        // Only send actual admin-role or admin-parked employees (like Shayna) to Admin station
        if (adminStation && (empRoleMap.get(a.employee_id) === 'admin' || isAdminParked(a.employee_id))) {
          stationMap.set(a.employee_id, adminStation.id);
          continue;
        }

        // Non-admin employees go to their best bench station (never Admin).
        // Scoring: understaffing first (hard priority), then employee's weighted
        // station preference so overflow placements honor the slider.
        const benchQuals = getBenchQuals(a.employee_id);
        const empRole = empRoleMap.get(a.employee_id);
        const empId = a.employee_id;
        const totalW = benchQuals.reduce((sum, q) => sum + getWeight(empId, q), 0) || 1;
        let bestSid = -1;
        let bestScore = Infinity;
        for (const sid of benchQuals) {
          const station = realStations.find(s => s.id === sid);
          if (!station) continue;
          // canPlaceAtStation handles all caps (total, CLS, MLT)
          if (!canPlaceAtStation(empId, sid, stationMap as any, empRoleMap, shiftName)) continue;
          const current = [...stationMap.values()].filter(v => v === sid).length;
          const minNeeded = getMinStaff(station, shiftName);
          // Understaffing is the primary driver (negative = needs staff = priority)
          let score = (current - minNeeded) * 1000;
          // Weighted preference: higher weight share = lower score (more preferred)
          const weightFrac = getWeight(empId, sid) / totalW;
          score -= weightFrac * 600;
          if (score < bestScore) { bestScore = score; bestSid = sid; }
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
          // Final fallback: use canPlaceAtStation to find any valid station
          if (!stationMap.has(a.employee_id)) {
            // The guarded stationMap.set will reject anything that violates caps,
            // so just try each qualified station in need-order
            let fallbackSid = -1;
            let fallbackScore = Infinity;
            for (const sid of benchQuals) {
              if (!canPlaceAtStation(a.employee_id, sid, stationMap as any, empRoleMap, shiftName)) continue;
              const station = realStations.find(s => s.id === sid);
              if (!station) continue;
              const current = [...stationMap.values()].filter(v => v === sid).length;
              let score = current - getMinStaff(station, shiftName);
              if (score >= 0 && isOverflowStation(station)) score += (overflowBalance.get(sid) ?? 0);
              if (score < fallbackScore) { fallbackScore = score; fallbackSid = sid; }
            }
            if (fallbackSid >= 0) {
              stationMap.set(a.employee_id, fallbackSid);
            } else if (adminStation) {
              // Absolutely no bench station can take them — send to Admin
              stationMap.set(a.employee_id, adminStation.id);
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

      // Track overflow CLS at Chem/Hema for monthly balance
      const overflowBalance = new Map<number, number>();

      for (const groupKey of sortedGroupKeys) {
        const group = shiftDateGroups.get(groupKey)!;
        const shiftIdNum = group[0].shift_id;
        const shiftName = shifts.find(s => s.id === shiftIdNum)?.name?.toLowerCase() ?? '';

        // Build the pool: all employees working this day+shift
        const pool = group;
        const locked = new Set<number>();
        // Guarded station map — wraps a real Map but enforces caps on set()
        const stationMap = new Map<number, number>();
        const _origSet = stationMap.set.bind(stationMap);
        stationMap.set = function(empId: number, stationId: number): Map<number, number> {
          // Admin station: only admin-role employees or those with Admin explicitly in their stations
          if (adminStation && stationId === adminStation.id) {
            const role = empRoleMap.get(empId);
            const empStations = empStationMap.get(empId) ?? [];
            if (role === 'admin' || empStations.includes(adminStation.id)) {
              return _origSet(empId, stationId);
            }
            return this; // reject — non-admin without Admin in their station list
          }
          // If employee is already at a station, temporarily remove for cap check
          const prev = this.get(empId);
          if (prev !== undefined) this.delete(empId);
          // Check caps
          if (!canPlaceAtStation(empId, stationId, this, empRoleMap, shiftName)) {
            // Restore previous assignment if we removed it
            if (prev !== undefined) _origSet(empId, prev);
            return this;
          }
          return _origSet(empId, stationId);
        };

        // Run the 7 layers in order
        layer1_bloodBank(pool, locked, stationMap, passIdx);
        layer2_mltPlacement(pool, locked, stationMap, passIdx, shiftName);
        layer3_adminPlacement(pool, locked, stationMap, shiftName);
        layer4_clsRotation(pool, locked, stationMap, shiftName, passIdx, overflowBalance);
        layer5_shaynaFill(pool, locked, stationMap, shiftName);
        layer6_perDiemFill(pool, locked, stationMap, shiftName);
        layer7_overflow(pool, locked, stationMap, shiftName, overflowBalance);
        // Run gap-fill last — after everyone is placed, reshuffle to fix remaining understaffing
        gapFill(pool, locked, stationMap, shiftName);

        // ── Repair pass: validate and fix by swapping ──
        // Runs iteratively until no more improvements can be made
        for (let repairIter = 0; repairIter < 10; repairIter++) {
          let changed = false;

          // Step 1: Place unassigned employees at understaffed bench stations
          for (const a of pool) {
            if (stationMap.has(a.employee_id)) continue;
            const role = empRoleMap.get(a.employee_id);
            const quals = (empStationMap.get(a.employee_id) ?? []).filter(sid =>
              !adminStation || sid !== adminStation.id
            );
            // Find the most understaffed station this employee is qualified for
            let bestSid = -1;
            let bestDeficit = 0;
            for (const sid of quals) {
              const station = realStations.find(s => s.id === sid);
              if (!station) continue;
              if (!canPlaceAtStation(a.employee_id, sid, stationMap as any, empRoleMap, shiftName)) continue;
              const current = [...stationMap.values()].filter(v => v === sid).length;
              const deficit = getMinStaff(station, shiftName) - current;
              if (deficit > bestDeficit) { bestDeficit = deficit; bestSid = sid; }
            }
            if (bestSid >= 0) {
              stationMap.set(a.employee_id, bestSid);
              changed = true;
            }
          }

          // Step 1b: Move overflow employees from overstaffed stations to understaffed stations
          for (const station of realStations) {
            const stationAssignees = [...stationMap.entries()].filter(([, sid]) => sid === station.id);
            const current = stationAssignees.length;
            const minNeeded = getMinStaff(station, shiftName);
            if (current <= minNeeded) continue; // not overstaffed

            // Find employees we can move to understaffed stations
            for (const [eid] of stationAssignees) {
              // Re-check current count (may have changed from prior moves)
              const nowCount = [...stationMap.values()].filter(v => v === station.id).length;
              if (nowCount <= minNeeded) break; // no longer overstaffed

              const quals = (empStationMap.get(eid) ?? []).filter(sid =>
                !adminStation || sid !== adminStation.id
              );
              // Find the most understaffed station this employee can go to
              let bestSid = -1;
              let bestDeficit = 0;
              for (const sid of quals) {
                if (sid === station.id) continue;
                const target = realStations.find(s => s.id === sid);
                if (!target) continue;
                const targetCurrent = [...stationMap.values()].filter(v => v === sid).length;
                const targetMin = getMinStaff(target, shiftName);
                const deficit = targetMin - targetCurrent;
                if (deficit <= 0) continue;
                // Check we can place there (respects MLT cap, CLS cap, etc)
                if (!canPlaceAtStation(eid, sid, stationMap as any, empRoleMap, shiftName)) continue;
                if (deficit > bestDeficit) { bestDeficit = deficit; bestSid = sid; }
              }
              if (bestSid >= 0) {
                stationMap.delete(eid);
                _origSet(eid, bestSid);
                changed = true;
              }
            }
          }

          // Step 1c: Chain swap — move someone from a mid station to an understaffed station,
          // then backfill the mid station with an overflow employee from an overstaffed station
          for (const underStation of realStations) {
            const underCount = [...stationMap.values()].filter(v => v === underStation.id).length;
            const underMin = getMinStaff(underStation, shiftName);
            if (underCount >= underMin) continue; // not understaffed

            let fixed = false;
            for (const midStation of realStations) {
              if (midStation.id === underStation.id) continue;
              const midAssignees = [...stationMap.entries()].filter(([, sid]) => sid === midStation.id);
              const midMin = getMinStaff(midStation, shiftName);

              // Find someone at midStation qualified for underStation
              for (const [midEid] of midAssignees) {
                if (!(empStationMap.get(midEid) ?? []).includes(underStation.id)) continue;
                if (!canPlaceAtStation(midEid, underStation.id, stationMap as any, empRoleMap, shiftName)) continue;

                // Moving them would leave midStation short — find an overflow employee to backfill
                if (midAssignees.length - 1 < midMin) {
                  // Need a backfill from an overstaffed station
                  let backfillFound = false;
                  for (const overStation of realStations) {
                    if (overStation.id === underStation.id || overStation.id === midStation.id) continue;
                    const overCount = [...stationMap.values()].filter(v => v === overStation.id).length;
                    const overMin = getMinStaff(overStation, shiftName);
                    if (overCount <= overMin) continue; // not overstaffed

                    const overAssignees = [...stationMap.entries()].filter(([, sid]) => sid === overStation.id);
                    for (const [overEid] of overAssignees) {
                      if (!(empStationMap.get(overEid) ?? []).includes(midStation.id)) continue;
                      // Execute chain: midEid → underStation, overEid → midStation
                      stationMap.delete(midEid);
                      stationMap.delete(overEid);
                      _origSet(midEid, underStation.id);
                      _origSet(overEid, midStation.id);
                      changed = true;
                      backfillFound = true;
                      break;
                    }
                    if (backfillFound) break;
                  }
                  if (backfillFound) { fixed = true; break; }

                  // Also check unassigned employees as backfill
                  for (const a of pool) {
                    if (stationMap.has(a.employee_id)) continue;
                    if (!(empStationMap.get(a.employee_id) ?? []).includes(midStation.id)) continue;
                    if (!canPlaceAtStation(a.employee_id, midStation.id, stationMap as any, empRoleMap, shiftName)) continue;
                    // Execute chain: midEid → underStation, unassigned → midStation
                    stationMap.delete(midEid);
                    _origSet(midEid, underStation.id);
                    stationMap.set(a.employee_id, midStation.id);
                    changed = true;
                    fixed = true;
                    break;
                  }
                  if (fixed) break;
                } else {
                  // midStation can afford to lose one — just move directly
                  stationMap.delete(midEid);
                  _origSet(midEid, underStation.id);
                  changed = true;
                  fixed = true;
                  break;
                }
              }
              if (fixed) break;
            }
          }

          // Step 2: Fix stations missing a CLS by swapping with overstaffed stations
          for (const station of realStations) {
            if (station.require_cls !== 1) continue;
            const stationAssignees = [...stationMap.entries()].filter(([, sid]) => sid === station.id);
            const hasCLS = stationAssignees.some(([eid]) => isCLSRole(eid, empRoleMap));
            if (hasCLS) continue;
            if (stationAssignees.length === 0) continue;

            // This station has people but no CLS — find a CLS to swap in
            for (const otherStation of realStations) {
              if (otherStation.id === station.id) continue;
              const otherAssignees = [...stationMap.entries()].filter(([, sid]) => sid === otherStation.id);
              const otherCLSList = otherAssignees.filter(([eid]) => isCLSRole(eid, empRoleMap));
              // Only take from stations with surplus CLS (2+ CLS, or 1+ CLS if station is above min)
              const otherMin = getMinStaff(otherStation, shiftName);
              if (otherCLSList.length < 2 && otherAssignees.length <= otherMin) continue;

              // Find a CLS from the other station qualified for this station
              for (const [clsId] of otherCLSList) {
                if (!(empStationMap.get(clsId) ?? []).includes(station.id)) continue;
                // Find someone at this station who can backfill at the other station
                const swapCandidate = stationAssignees.find(([eid]) =>
                  eid !== clsId && (empStationMap.get(eid) ?? []).includes(otherStation.id)
                );
                if (swapCandidate) {
                  // Swap: CLS → this station, other person → other station
                  stationMap.delete(clsId);
                  stationMap.delete(swapCandidate[0]);
                  _origSet(clsId, station.id);
                  _origSet(swapCandidate[0], otherStation.id);
                  changed = true;
                  break;
                }
                // Or just move the CLS directly if the other station still meets min
                const otherCurrent = otherAssignees.length;
                if (otherCurrent - 1 >= getMinStaff(otherStation, shiftName) - getMLTSlots(otherStation, shiftName)) {
                  stationMap.delete(clsId);
                  _origSet(clsId, station.id);
                  changed = true;
                  break;
                }
              }
              if ([...stationMap.entries()].filter(([, sid]) => sid === station.id).some(([eid]) => isCLSRole(eid, empRoleMap))) break;
            }
          }

          // Step 3: Fix duplicate MLTs — if a station has 2 MLTs, move one to a station that needs an MLT
          for (const station of realStations) {
            const stationAssignees = [...stationMap.entries()].filter(([, sid]) => sid === station.id);
            const mltsHere = stationAssignees.filter(([eid]) => empRoleMap.get(eid) === 'mlt');
            if (mltsHere.length <= 1) continue;

            // Move extra MLTs to stations that need one
            for (let i = 1; i < mltsHere.length; i++) {
              const [extraMLT] = mltsHere[i];
              const quals = (empStationMap.get(extraMLT) ?? []).filter(sid =>
                !adminStation || sid !== adminStation.id
              );
              let placed = false;
              for (const sid of quals) {
                if (sid === station.id) continue;
                const targetStation = realStations.find(s => s.id === sid);
                if (!targetStation || targetStation.require_cls !== 1) continue;
                const targetMLTs = [...stationMap.entries()].filter(([eid, s]) =>
                  s === sid && empRoleMap.get(eid) === 'mlt'
                ).length;
                if (targetMLTs >= 1) continue; // already has an MLT
                if (canPlaceAtStation(extraMLT, sid, stationMap as any, empRoleMap, shiftName)) {
                  stationMap.set(extraMLT, sid);
                  placed = true;
                  changed = true;
                  break;
                }
              }
              // If can't place on bench, send to Admin (if admin-parked)
              if (!placed && adminStation && isAdminParked(extraMLT)) {
                stationMap.set(extraMLT, adminStation.id);
                changed = true;
              }
            }
          }

          // Step 4: Fix MLTs on stations that already have one — try swapping with a station that needs MLT
          for (const station of realStations) {
            if (station.require_cls !== 1) continue;
            const stationAssignees = [...stationMap.entries()].filter(([, sid]) => sid === station.id);
            const hasMLT = stationAssignees.some(([eid]) => empRoleMap.get(eid) === 'mlt');
            if (hasMLT) continue;
            // Station needs an MLT — find one at a station that has excess or doesn't need one
            for (const otherStation of realStations) {
              if (otherStation.id === station.id) continue;
              const otherAssignees = [...stationMap.entries()].filter(([, sid]) => sid === otherStation.id);
              const otherMLTs = otherAssignees.filter(([eid]) => empRoleMap.get(eid) === 'mlt');
              // Only take from stations with 2+ MLTs or stations that don't require MLTs
              if (otherMLTs.length === 0) continue;
              if (otherStation.require_cls === 1 && otherMLTs.length <= 1) continue;

              for (const [mltId] of otherMLTs) {
                if (!(empStationMap.get(mltId) ?? []).includes(station.id)) continue;
                if (canPlaceAtStation(mltId, station.id, stationMap as any, empRoleMap, shiftName)) {
                  stationMap.set(mltId, station.id);
                  changed = true;
                  break;
                }
              }
              if ([...stationMap.entries()].filter(([, sid]) => sid === station.id).some(([eid]) => empRoleMap.get(eid) === 'mlt')) break;
            }
          }

          // Step 5: Move non-admin employees from Admin station to bench overflow slots
          if (adminStation) {
            const adminAssignees = [...stationMap.entries()].filter(([, sid]) => sid === adminStation.id);
            for (const [eid] of adminAssignees) {
              const role = empRoleMap.get(eid);
              if (role === 'admin') continue; // actual admins stay at Admin
              const quals = (empStationMap.get(eid) ?? []).filter(sid => sid !== adminStation.id);
              // Try to place at understaffed stations first, then overflow stations
              let bestSid = -1;
              let bestPriority = -1;
              for (const sid of quals) {
                const station = realStations.find(s => s.id === sid);
                if (!station) continue;
                if (!canPlaceAtStation(eid, sid, stationMap as any, empRoleMap, shiftName)) continue;
                const current = [...stationMap.values()].filter(v => v === sid).length;
                const minNeeded = getMinStaff(station, shiftName);
                const deficit = minNeeded - current;
                // Priority: understaffed (deficit>0) > overflow slot > nothing
                const priority = deficit > 0 ? 100 + deficit : (current < getMaxStaff(station, shiftName) ? 1 : 0);
                if (priority > bestPriority) { bestPriority = priority; bestSid = sid; }
              }
              if (bestSid >= 0) {
                stationMap.delete(eid);
                _origSet(eid, bestSid);
                changed = true;
              }
            }
          }

          // Step 6: Move admin/supervisor to understaffed bench stations they're qualified for.
          // Admin can either fill the understaffed station directly, or backfill a mid
          // station so its CLS can move to the understaffed station (chain swap).
          // Step 7 will free the admin back to Admin if a non-admin can replace them later.
          if (adminStation) {
            for (const underStation of realStations) {
              if (underStation.id === adminStation.id) continue;
              const underCount = [...stationMap.values()].filter(v => v === underStation.id).length;
              const underMin = getMinStaff(underStation, shiftName);
              if (underCount >= underMin) continue;

              // Strategy A: Admin directly fills the understaffed station
              const adminAssignees = [...stationMap.entries()].filter(([, sid]) => sid === adminStation.id);
              for (const [eid] of adminAssignees) {
                const role = empRoleMap.get(eid);
                if (role !== 'admin') continue;
                if (!(empStationMap.get(eid) ?? []).includes(underStation.id)) continue;
                if (!canPlaceAtStation(eid, underStation.id, stationMap as any, empRoleMap, shiftName)) continue;
                stationMap.delete(eid);
                _origSet(eid, underStation.id);
                changed = true;
                break;
              }

              // Re-check after Strategy A
              const underCountNow = [...stationMap.values()].filter(v => v === underStation.id).length;
              if (underCountNow >= underMin) continue;

              // Strategy B: Admin backfills station X, freeing CLS at X to move to understaffed station
              for (const midStation of realStations) {
                if (midStation.id === underStation.id || midStation.id === adminStation.id) continue;
                const midAssignees = [...stationMap.entries()].filter(([, sid]) => sid === midStation.id);

                for (const [midEid] of midAssignees) {
                  if (!(empStationMap.get(midEid) ?? []).includes(underStation.id)) continue;
                  if (!canPlaceAtStation(midEid, underStation.id, stationMap as any, empRoleMap, shiftName)) continue;
                  if (midAssignees.length - 1 >= getMinStaff(midStation, shiftName)) {
                    // midStation can afford to lose one — move directly
                    stationMap.delete(midEid);
                    _origSet(midEid, underStation.id);
                    changed = true;
                    break;
                  }
                  // midStation would be short — can an admin backfill?
                  const adminAssignees2 = [...stationMap.entries()].filter(([, sid]) => sid === adminStation.id);
                  for (const [adminEid] of adminAssignees2) {
                    if (empRoleMap.get(adminEid) !== 'admin') continue;
                    if (!(empStationMap.get(adminEid) ?? []).includes(midStation.id)) continue;
                    // Temporarily remove midEid to check if admin can fit at midStation
                    stationMap.delete(midEid);
                    if (!canPlaceAtStation(adminEid, midStation.id, stationMap as any, empRoleMap, shiftName)) {
                      _origSet(midEid, midStation.id); // restore
                      continue;
                    }
                    // Chain: midEid → underStation, adminEid → midStation
                    stationMap.delete(adminEid);
                    _origSet(midEid, underStation.id);
                    _origSet(adminEid, midStation.id);
                    changed = true;
                    break;
                  }
                  if (changed) break;
                }
                if ([...stationMap.values()].filter(v => v === underStation.id).length >= underMin) break;
              }
            }
          }

          // Step 7: Free admins from bench stations — if a non-admin can cover their spot,
          // send the admin back to Admin so they can do admin duties
          if (adminStation) {
            for (const benchStation of realStations) {
              const benchAssignees = [...stationMap.entries()].filter(([, sid]) => sid === benchStation.id);
              // Find admins at this bench station
              const adminsHere = benchAssignees.filter(([eid]) => empRoleMap.get(eid) === 'admin');
              if (adminsHere.length === 0) continue;

              for (const [adminEid] of adminsHere) {
                // Would removing this admin understaff the bench station?
                const countWithout = benchAssignees.length - 1;
                const minNeeded = getMinStaff(benchStation, shiftName);
                const wouldBeShort = countWithout < minNeeded;

                // Look for a non-admin who can replace this admin at the bench station
                // Check overflow employees (at overflow stations or unassigned)
                let replaced = false;

                // Check unassigned employees first
                // Must remove admin first so canPlaceAtStation sees the freed slot
                for (const a of pool) {
                  if (stationMap.has(a.employee_id)) continue;
                  const r = empRoleMap.get(a.employee_id);
                  if (r === 'admin') continue;
                  if (!(empStationMap.get(a.employee_id) ?? []).includes(benchStation.id)) continue;
                  // Temporarily remove admin to check if replacement can fit
                  stationMap.delete(adminEid);
                  if (!canPlaceAtStation(a.employee_id, benchStation.id, stationMap as any, empRoleMap, shiftName)) {
                    _origSet(adminEid, benchStation.id); // restore
                    continue;
                  }
                  // Swap: unassigned → bench, admin → Admin
                  _origSet(a.employee_id, benchStation.id);
                  _origSet(adminEid, adminStation.id);
                  replaced = true;
                  changed = true;
                  break;
                }
                if (replaced) continue;

                // Check employees at overstaffed stations (including overflow at Chem)
                for (const otherStation of [...realStations, adminStation]) {
                  if (otherStation.id === benchStation.id) continue;
                  if (otherStation.id === adminStation.id) continue; // don't pull from Admin
                  const otherAssignees = [...stationMap.entries()].filter(([, sid]) => sid === otherStation.id);
                  const otherMin = otherStation.name === 'Admin' ? 1 : getMinStaff(otherStation, shiftName);
                  if (otherAssignees.length <= otherMin) continue; // not overstaffed

                  for (const [otherEid] of otherAssignees) {
                    const r = empRoleMap.get(otherEid);
                    if (r === 'admin') continue; // don't swap admin for admin
                    if (!(empStationMap.get(otherEid) ?? []).includes(benchStation.id)) continue;
                    // Temporarily remove both to check caps
                    stationMap.delete(adminEid);
                    stationMap.delete(otherEid);
                    if (!canPlaceAtStation(otherEid, benchStation.id, stationMap as any, empRoleMap, shiftName)) {
                      _origSet(adminEid, benchStation.id); // restore admin
                      _origSet(otherEid, otherStation.id); // restore other
                      continue;
                    }
                    // Swap: overflow → bench, admin → Admin
                    _origSet(otherEid, benchStation.id);
                    _origSet(adminEid, adminStation.id);
                    replaced = true;
                    changed = true;
                    break;
                  }
                  if (replaced) break;
                }
                if (replaced) continue;

                // If bench won't be short without the admin and it's not critical, just move admin back
                if (!wouldBeShort) {
                  stationMap.delete(adminEid);
                  _origSet(adminEid, adminStation.id);
                  changed = true;
                }
              }
            }
          }

          if (!changed) break;
        }

        // ── Partial PTO coverage (runs LAST — after repair pass so nothing undoes it) ──
        // If a station's only employee has partial PTO, place a second person there
        // via _origSet (bypasses max-staff caps since one person leaves mid-shift).
        {
          const date = group[0].date;
          for (const station of realStations) {
            const stationAssignees = [...stationMap.entries()].filter(([, sid]) => sid === station.id);
            const partialEmps = stationAssignees.filter(([eid]) => partialPTOSet.has(`${eid}-${date}`));
            if (partialEmps.length === 0) continue;
            const fullDayCovers = stationAssignees.filter(([eid]) => !partialPTOSet.has(`${eid}-${date}`));
            if (fullDayCovers.length > 0) continue;

            const isQualified = (eid: number) =>
              (empStationMap.get(eid) ?? []).includes(station.id);

            // Role matching: MLT positions need MLT cover, CLS positions need CLS/Admin cover
            const partialRole = empRoleMap.get(partialEmps[0][0]);
            const canCoverRole = (eid: number): boolean => {
              const role = empRoleMap.get(eid);
              if (partialRole === 'mlt') return role === 'mlt';
              // CLS or admin positions can be covered by CLS or admin
              return role === 'cls' || role === 'admin';
            };
            const canCover = (eid: number) => isQualified(eid) && canCoverRole(eid);

            let filled = false;

            // S1: unassigned employee
            for (const a of pool) {
              if (stationMap.has(a.employee_id)) continue;
              if (!canCover(a.employee_id)) continue;
              _origSet(a.employee_id, station.id);
              filled = true;
              break;
            }
            if (filled) continue;

            // S2: pull from overstaffed station
            for (const os of realStations) {
              if (os.id === station.id) continue;
              const osAssignees = [...stationMap.entries()].filter(([, sid]) => sid === os.id);
              if (osAssignees.length <= getMinStaff(os, shiftName)) continue;
              for (const [eid] of osAssignees) {
                if (!canCover(eid)) continue;
                stationMap.delete(eid);
                _origSet(eid, station.id);
                filled = true;
                break;
              }
              if (filled) break;
            }
            if (filled) continue;

            // S3: pull admin from ANY station (prefer Admin desk first)
            // Only for CLS positions — admins can cover CLS but not MLT
            if (partialRole !== 'mlt') {
              const admins = [...stationMap.entries()]
                .filter(([eid]) => empRoleMap.get(eid) === 'admin' && isQualified(eid))
                .sort(([, a], [, b]) => {
                  const aAdmin = adminStation && a === adminStation.id ? 0 : 1;
                  const bAdmin = adminStation && b === adminStation.id ? 0 : 1;
                  return aAdmin - bAdmin;
                });
              for (const [eid] of admins) {
                stationMap.delete(eid);
                _origSet(eid, station.id);
                filled = true;
                break;
              }
              if (filled) continue;
            }

            // S4: chain swap — same-role employee covers here, admin backfills their station
            for (const os of realStations) {
              if (os.id === station.id) continue;
              const osAssignees = [...stationMap.entries()].filter(([, sid]) => sid === os.id);
              for (const [swapEid] of osAssignees) {
                if (!canCover(swapEid)) continue;
                if (osAssignees.length - 1 < getMinStaff(os, shiftName)) {
                  const bf = [...stationMap.entries()].find(([eid]) =>
                    eid !== swapEid && empRoleMap.get(eid) === 'admin'
                    && (empStationMap.get(eid) ?? []).includes(os.id)
                  );
                  if (bf) {
                    stationMap.delete(bf[0]);
                    stationMap.delete(swapEid);
                    _origSet(bf[0], os.id);
                    _origSet(swapEid, station.id);
                    filled = true;
                    break;
                  }
                } else {
                  stationMap.delete(swapEid);
                  _origSet(swapEid, station.id);
                  filled = true;
                  break;
                }
              }
              if (filled) break;
            }
          }
        }

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
        const isAMShift = shiftName === 'am';

        for (const station of realStations) {
          const stationAssignees = group.filter(a => a.station_id === station.id);
          const minNeeded = getMinStaff(station, shiftName);

          // CRITICAL: understaffed (AM only — PM/Night have too few staff to fill every station)
          if (isAMShift && stationAssignees.length < minNeeded) {
            const dow = getDow(date);
            const isWkend = dow === 0 || dow === 6;
            const isHemaOrChem = station.name === 'Hematology/UA' || station.name === 'Chemistry';
            if (!(isWkend && isHemaOrChem)) {
              passWarnings.push(`CRITICAL: ${station.name} needs ${minNeeded} staff but only ${stationAssignees.length} assigned on ${date} (${shiftLabel})`);
            }
          }

          // WARNING: overstaffed (beyond overflow cap) — skip for partial PTO stations
          // where the extra person is intentional coverage for the departing employee
          const hasPartialHere = stationAssignees.some(a => partialPTOSet.has(`${a.employee_id}-${date}`));
          if (stationAssignees.length > getMaxStaff(station, shiftName) && !hasPartialHere) {
            passWarnings.push(`WARNING: ${station.name} has ${stationAssignees.length} staff (max ${getMaxStaff(station, shiftName)}) on ${date} (${shiftLabel})`);
          }

          // SUGGESTION: overflow CLS at Chem/Hema (2 CLS = extra help, not required)
          if (isOverflowStation(station)) {
            const clsHere = stationAssignees.filter(a => isCLSRole(a.employee_id, empRoleMap)).length;
            if (clsHere > getCLSNeeded(station, shiftName)) {
              const extraCLS = stationAssignees.filter(a => isCLSRole(a.employee_id, empRoleMap));
              const extraName = extraCLS.length > 0 ? extraCLS[extraCLS.length - 1] : null;
              if (extraName) {
                const name = employees.find(e => e.id === extraName.employee_id)?.name ?? 'CLS';
                passWarnings.push(`SUGGESTION: ${name} is extra CLS at ${station.name} on ${date} (${shiftLabel}) — can be moved to another station if needed`);
              }
            }
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
            if (isAMShift && station.require_cls === 1) {
              const hasCLS = stationAssignees.some(a => isCLSRole(a.employee_id, empRoleMap));
              if (!hasCLS) {
                passWarnings.push(`CRITICAL: ${station.name} has no CLS assigned on ${date} (${shiftLabel})`);
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

      // Partial PTO coverage warnings — flag stations where the only person has partial PTO
      // and nobody else was assigned to cover the rest of the shift
      for (const [, group] of shiftDateGroups) {
        const date = group[0].date;
        const shiftLabel = shifts.find(s => s.id === group[0].shift_id)?.name ?? 'Unknown';
        for (const station of realStations) {
          const stationAssignees = group.filter(a => a.station_id === station.id);
          if (stationAssignees.length === 0) continue;
          const partialEmps = stationAssignees.filter(a => partialPTOSet.has(`${a.employee_id}-${date}`));
          if (partialEmps.length === 0) continue;
          const fullCoverageEmps = stationAssignees.filter(a => !partialPTOSet.has(`${a.employee_id}-${date}`));
          if (fullCoverageEmps.length === 0) {
            const names = partialEmps.map(a => employees.find(e => e.id === a.employee_id)?.name ?? `#${a.employee_id}`).join(', ');
            passWarnings.push(`CRITICAL: ${station.name} on ${date} — ${names} has partial PTO with no coverage for the remainder of the shift (${shiftLabel})`);
          }
        }
      }

      // AM MLT overflow — detect MLTs on AM that couldn't get a bench station
      // Aggregate per-employee instead of per-day to reduce noise
      const amShift = shifts.find(s => s.name.toLowerCase() === 'am');
      if (amShift) {
        const mltStations = realStations.filter(s => s.require_cls === 1);
        // Find AM dates missing an MLT at a bench station
        const datesNeedingMLT: string[] = [];
        for (const [, group] of shiftDateGroups) {
          if (group[0].shift_id !== amShift.id) continue;
          for (const station of mltStations) {
            const stationAssignees = group.filter(a => a.station_id === station.id);
            const hasMLT = stationAssignees.some(a => empRoleMap.get(a.employee_id) === 'mlt');
            if (!hasMLT && stationAssignees.length > 0) {
              datesNeedingMLT.push(group[0].date);
              break;
            }
          }
        }
        // Aggregate: per-MLT, collect all dates they have no bench station
        const mltNoBenchDates = new Map<number, string[]>();
        for (const [, group] of shiftDateGroups) {
          if (group[0].shift_id !== amShift.id) continue;
          const date = group[0].date;
          for (const a of group) {
            if (empRoleMap.get(a.employee_id) !== 'mlt') continue;
            const stationId = a.station_id;
            const isOnBench = stationId !== null && realStations.some(s => s.id === stationId);
            if (!isOnBench) {
              const dates = mltNoBenchDates.get(a.employee_id) ?? [];
              dates.push(date);
              mltNoBenchDates.set(a.employee_id, dates);
            }
          }
        }
        for (const [empId, dates] of mltNoBenchDates) {
          const empName = employees.find(e => e.id === empId)?.name ?? `Employee #${empId}`;
          const suggestions = datesNeedingMLT.filter(d => !dates.includes(d)).slice(0, 3).join(', ');
          if (suggestions) {
            passWarnings.push(`SUGGESTION: ${empName} (MLT) has no bench station on ${dates.length} AM days — consider moving to ${suggestions} which need MLT coverage`);
          } else {
            passWarnings.push(`SUGGESTION: ${empName} (MLT) has no bench station on ${dates.length} AM days — all bench stations already have MLT coverage`);
          }
        }
      }

      // Time-off conflicts (only full-day PTO)
      for (const to of timeOff) {
        if (to.off_type !== 'full') continue;
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

    // ── PHASE 3b: Per-diem rebalancing & unassigned cleanup ──
    // Remove per-diem from days where they have no station (unassigned) or where day is overstaffed.
    // Try to re-place them on understaffed days.
    const empRoleMapFinal = new Map<number, string>();
    for (const emp of employees) empRoleMapFinal.set(emp.id, emp.role);
    const adminStationFinal = stations.find(s => s.name === 'Admin');
    const realStationsFinal = stations.filter(s => s.name !== 'Admin');

    const getCLSNeededFinal = (station: typeof stations[0], shiftName: string): number => {
      if (shiftName === 'am') return (station as any).min_staff_am ?? station.min_staff ?? 1;
      if (shiftName === 'pm') return (station as any).min_staff_pm ?? station.min_staff ?? 1;
      if (shiftName === 'night') return (station as any).min_staff_night ?? station.min_staff ?? 1;
      return station.min_staff ?? 1;
    };
    const getMLTSlotsFinal = (station: typeof stations[0], shiftName?: string): number => {
      return (station as any).min_mlt || (station.require_cls === 1 ? 1 : 0);
    };
    const getMinStaffFinal = (station: typeof stations[0], shiftName: string): number => {
      return getCLSNeededFinal(station, shiftName) + getMLTSlotsFinal(station, shiftName);
    };

    // Build a map of shift_id → shift_name for lookups
    const shiftNameMap = new Map<number, string>();
    for (const s of shifts) shiftNameMap.set(s.id, s.name?.toLowerCase() ?? '');

    // Step 1: Remove per-diem employees who have no station (unassigned)
    const removedPerDiem: Assignment[] = [];
    for (let i = result.length - 1; i >= 0; i--) {
      const a = result[i];
      const emp = employees.find(e => e.id === a.employee_id);
      if (!emp) continue;
      if (a.station_id !== null) continue; // has a station, keep

      if (emp.employment_type === 'per-diem') {
        removedPerDiem.push(a);
        result.splice(i, 1);
      }
    }

    // Step 2: Remove per-diem from overstaffed days (all stations at or above min)
    // Group by shift+date
    const shiftDateGroupsFinal = new Map<string, Assignment[]>();
    for (const a of result) {
      const key = `${a.shift_id}-${a.date}`;
      if (!shiftDateGroupsFinal.has(key)) shiftDateGroupsFinal.set(key, []);
      shiftDateGroupsFinal.get(key)!.push(a);
    }

    for (const [, group] of shiftDateGroupsFinal) {
      const shiftName = shiftNameMap.get(group[0].shift_id) ?? '';
      // Check if ALL real stations meet their minimum
      const allStationsMet = realStationsFinal.every(station => {
        const count = group.filter(a => a.station_id === station.id).length;
        return count >= getMinStaffFinal(station, shiftName);
      });
      if (!allStationsMet) continue; // day is understaffed somewhere, keep everyone

      // Day is fully staffed. Check for per-diem who are overflow (at Admin or overflow station)
      for (const a of [...group]) {
        const emp = employees.find(e => e.id === a.employee_id);
        if (!emp || emp.employment_type !== 'per-diem') continue;

        // Is this per-diem essential? Check if removing them would understaff their station
        if (a.station_id === null) {
          // No station — safe to remove
          removedPerDiem.push(a);
          const idx = result.indexOf(a);
          if (idx >= 0) result.splice(idx, 1);
          continue;
        }
        const station = stations.find(s => s.id === a.station_id);
        if (!station) continue;
        const stationCount = group.filter(g => g.station_id === station.id).length;
        const minNeeded = station.name === 'Admin' ? 1 : getMinStaffFinal(station, shiftName);
        if (stationCount > minNeeded) {
          // Station is overstaffed even without this per-diem — remove them
          removedPerDiem.push(a);
          const idx = result.indexOf(a);
          if (idx >= 0) result.splice(idx, 1);
          // Remove from group too
          const gi = group.indexOf(a);
          if (gi >= 0) group.splice(gi, 1);
        }
      }
    }

    // Step 3: Try to place removed per-diem on understaffed days
    // Rebuild shift+date groups after removals
    const shiftDateGroupsRebuilt = new Map<string, Assignment[]>();
    for (const a of result) {
      const key = `${a.shift_id}-${a.date}`;
      if (!shiftDateGroupsRebuilt.has(key)) shiftDateGroupsRebuilt.set(key, []);
      shiftDateGroupsRebuilt.get(key)!.push(a);
    }

    for (const removed of removedPerDiem) {
      const emp = employees.find(e => e.id === removed.employee_id);
      if (!emp) continue;
      const role = empRoleMapFinal.get(emp.id);
      const quals = (empStationMap.get(emp.id) ?? []).filter(sid =>
        !adminStationFinal || sid !== adminStationFinal.id
      );

      // Find the most understaffed day/shift where this employee could help
      let bestKey = '';
      let bestDeficit = 0;
      let bestStationId = -1;

      for (const [key, group] of shiftDateGroupsRebuilt) {
        const shiftId = group[0].shift_id;
        const date = group[0].date;
        const shiftName = shiftNameMap.get(shiftId) ?? '';

        // Employee must match shift (compare default_shift)
        const empShift = emp.default_shift;
        if (empShift !== 'floater' && empShift !== shiftName) continue;

        // Don't put on a day they're already working
        if (result.some(a => a.employee_id === emp.id && a.date === date)) continue;

        // Check time off (only full-day blocks assignment)
        if (timeOff.some(to => to.employee_id === emp.id && to.date === date && to.off_type === 'full')) continue;

        // Find understaffed station they're qualified for
        for (const sid of quals) {
          const station = realStationsFinal.find(s => s.id === sid);
          if (!station) continue;
          const count = group.filter(a => a.station_id === sid).length;
          const min = getMinStaffFinal(station, shiftName);
          const deficit = min - count;
          if (deficit <= 0) continue;

          // Check role constraints
          if (role === 'mlt') {
            const mltsHere = group.filter(a => a.station_id === sid && empRoleMapFinal.get(a.employee_id) === 'mlt').length;
            if (mltsHere >= getMLTSlotsFinal(station)) continue;
          }

          if (deficit > bestDeficit) {
            bestDeficit = deficit;
            bestKey = key;
            bestStationId = sid;
          }
        }
      }

      if (bestKey && bestStationId >= 0) {
        const group = shiftDateGroupsRebuilt.get(bestKey)!;
        const newAssignment: Assignment = {
          employee_id: emp.id,
          shift_id: group[0].shift_id,
          date: group[0].date,
          station_id: bestStationId,
        };
        result.push(newAssignment);
        group.push(newAssignment);
      }
      // If no placement found, per-diem just doesn't work that day — no warning needed
    }

    // Step 4: Remove non-per-diem employees who still have no station
    // They must have a station — if we truly can't place them, flag it
    const unplacedNonPerDiem: Assignment[] = [];
    for (let i = result.length - 1; i >= 0; i--) {
      const a = result[i];
      if (a.station_id !== null) continue;
      const emp = employees.find(e => e.id === a.employee_id);
      if (!emp) continue;
      if (emp.role === 'admin') continue; // admins at Admin station should have station_id set
      unplacedNonPerDiem.push(a);
      result.splice(i, 1);
    }

    for (const a of unplacedNonPerDiem) {
      const emp = employees.find(e => e.id === a.employee_id);
      const shiftLabel = shifts.find(s => s.id === a.shift_id)?.name ?? 'Unknown';
      warnings.push(`CRITICAL: ${emp?.name ?? 'Unknown'} has no station on ${a.date} (${shiftLabel}) and was removed — needs manual assignment`);
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Warnings
  // ═══════════════════════════════════════════════════════════════

  for (const emp of employees) {
    // Admins are excluded from staffing warnings
    if (emp.role === 'admin') continue;

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

  // ── Final validation summary ──
  const criticalCount = warnings.filter(w => w.startsWith('CRITICAL:')).length;
  if (criticalCount > 0) {
    warnings.unshift(`⚠ ${criticalCount} critical issue(s) remain after ${25} optimization passes — these require manual fixes or additional staff`);
  }

  return { assignments: result, warnings: groupWarningsByShift(warnings) };
}
