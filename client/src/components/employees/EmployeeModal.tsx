import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { useUpdateEmployee, useSaveConstraints } from '../../hooks/useEmployees';
import { useStations, useSaveEmployeeStations } from '../../hooks/useStations';
import { useTimeOff, useCreateTimeOff, useDeleteTimeOff, useClearTimeOff } from '../../hooks/useTimeOff';
import type { Employee, DefaultShift } from '../../types';
import toast from 'react-hot-toast';

interface Props {
  employee: Employee;
  onClose: () => void;
}

type Tab = 'details' | 'timeoff' | 'rules' | 'stations';

const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'timeoff', label: 'Time Off' },
  { key: 'rules', label: 'Rules' },
  { key: 'stations', label: 'Stations' },
];

export default function EmployeeModal({ employee, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('details');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold text-gray-900">{employee.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'details' && <DetailsTab employee={employee} onClose={onClose} />}
          {tab === 'timeoff' && <TimeOffTab employee={employee} />}
          {tab === 'rules' && <RulesTab employee={employee} onClose={onClose} />}
          {tab === 'stations' && <StationsTab employee={employee} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

// ─── Details Tab ───

function DetailsTab({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const updateMutation = useUpdateEmployee();
  const [name, setName] = useState(employee.name);
  const [type, setType] = useState(employee.employment_type);
  const [hours, setHours] = useState(employee.target_hours_week);
  const [shift, setShift] = useState<DefaultShift>(employee.default_shift);
  const [role, setRole] = useState<Employee['role']>(employee.role);

  const handleSave = () => {
    if (!name.trim()) return;
    updateMutation.mutate(
      { id: employee.id, name: name.trim(), employment_type: type, target_hours_week: hours, default_shift: shift, role },
      {
        onSuccess: () => { toast.success('Updated'); onClose(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as Employee['employment_type'])}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="full-time">Full-Time</option>
            <option value="part-time">Part-Time</option>
            <option value="per-diem">Per Diem</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Hours/Week</label>
          <input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value))}
            min={0} max={80} step={0.5}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Shift</label>
          <select value={shift} onChange={(e) => setShift(e.target.value as DefaultShift)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="am">AM</option>
            <option value="pm">PM</option>
            <option value="night">Night</option>
            <option value="floater">Floater</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Employee['role'])}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="cls">CLS</option>
            <option value="mlt">MLT</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div className="pt-2">
        <button onClick={handleSave} disabled={updateMutation.isPending}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Time Off Tab ───

const OFF_TYPE_COLORS: Record<string, string> = {
  full: 'bg-red-500 text-white',
  custom: 'bg-orange-500 text-white',
};

function TimeOffTab({ employee }: { employee: Employee }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [offType, setOffType] = useState<'full' | 'custom'>('full');
  const [customStart, setCustomStart] = useState('09:00');
  const [customEnd, setCustomEnd] = useState('13:00');
  const month = format(currentDate, 'yyyy-MM');

  const { data: timeOff } = useTimeOff({ employee_id: employee.id, month });
  const createMutation = useCreateTimeOff();
  const deleteMutation = useDeleteTimeOff();
  const clearMutation = useClearTimeOff();

  // Drag-to-select range state
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const timeOffMap = new Map(timeOff?.map((t) => [t.date, t]) ?? []);
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);

  // Get sorted range between two date strings
  const getRange = (a: string, b: string): string[] => {
    const d1 = new Date(a + 'T00:00:00');
    const d2 = new Date(b + 'T00:00:00');
    const from = d1 <= d2 ? d1 : d2;
    const to = d1 <= d2 ? d2 : d1;
    return eachDayOfInterval({ start: from, end: to }).map(d => format(d, 'yyyy-MM-dd'));
  };

  const isInDragRange = (dateStr: string): boolean => {
    if (!dragStart || !dragEnd) return false;
    const range = getRange(dragStart, dragEnd);
    return range.includes(dateStr);
  };

  const handleMouseDown = (dateStr: string) => {
    // If clicking an existing entry, just remove it (single click delete)
    const existing = timeOffMap.get(dateStr);
    if (existing) {
      deleteMutation.mutate(existing.id, { onError: (err) => toast.error(err.message) });
      return;
    }
    setDragStart(dateStr);
    setDragEnd(dateStr);
    setIsDragging(true);
  };

  const handleMouseEnter = (dateStr: string) => {
    if (isDragging) setDragEnd(dateStr);
  };

  const handleMouseUp = () => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false);
      return;
    }
    setIsDragging(false);

    const range = getRange(dragStart, dragEnd);
    // Only add dates that don't already have time off
    const newDates = range.filter(d => !timeOffMap.has(d));
    if (newDates.length > 0) {
      createMutation.mutate(
        {
          employee_id: employee.id, dates: newDates, off_type: offType,
          ...(offType === 'custom' ? { start_time: customStart, end_time: customEnd } : {}),
        },
        { onError: (err) => toast.error(err.message) }
      );
    }
    setDragStart(null);
    setDragEnd(null);
  };

  return (
    <div className="flex gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-3 min-w-[160px]">
        <div className="flex gap-1.5">
          <button onClick={() => setOffType('full')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${offType === 'full' ? 'bg-gray-800 text-white' : 'bg-white border text-gray-600 hover:bg-gray-100'}`}>
            Full Day
          </button>
          <button onClick={() => setOffType('custom')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${offType === 'custom' ? 'bg-gray-800 text-white' : 'bg-white border text-gray-600 hover:bg-gray-100'}`}>
            Custom
          </button>
        </div>
        {offType === 'custom' && (
          <div className="flex items-center gap-2 bg-gray-50 border rounded-lg p-2">
            <input type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              className="border rounded px-2 py-1 text-sm flex-1" />
            <span className="text-xs text-gray-400">to</span>
            <input type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
              className="border rounded px-2 py-1 text-sm flex-1" />
          </div>
        )}
        <p className="text-[10px] text-gray-400">Click a date or drag across dates to select a range. Click a marked date to remove it.</p>

        {/* Summary */}
        {timeOff && timeOff.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500">Marked off:</span>
              <button
                onClick={() => {
                  if (!confirm(`Clear all ${timeOff.length} entries for ${format(currentDate, 'MMM yyyy')}?`)) return;
                  clearMutation.mutate(
                    { employeeId: employee.id, month },
                    { onSuccess: (r) => toast.success(`Cleared ${r.deleted} entries`), onError: (err) => toast.error(err.message) }
                  );
                }}
                className="text-[10px] text-red-500 hover:text-red-700 font-medium"
              >
                Clear All
              </button>
            </div>
            <div className="max-h-[180px] overflow-y-auto space-y-0.5">
              {timeOff.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${OFF_TYPE_COLORS[t.off_type]?.split(' ')[0] ?? 'bg-red-500'}`} />
                  <span>{format(new Date(t.date + 'T00:00:00'), 'MMM d')}</span>
                  <span className="text-gray-400 text-[10px]">
                    {t.off_type === 'custom' && t.start_time ? `${t.start_time}-${t.end_time}` : 'All day'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="flex-1 max-w-[340px] select-none" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="px-2 py-1 text-sm hover:bg-gray-100 rounded">&larr;</button>
          <span className="text-sm font-semibold text-gray-700">{format(currentDate, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="px-2 py-1 text-sm hover:bg-gray-100 rounded">&rarr;</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
            <div key={i} className="text-[10px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const entry = timeOffMap.get(dateStr);
            const isWknd = getDay(day) === 0 || getDay(day) === 6;
            const inRange = isInDragRange(dateStr);
            return (
              <div
                key={dateStr}
                onMouseDown={(e) => { e.preventDefault(); handleMouseDown(dateStr); }}
                onMouseEnter={() => handleMouseEnter(dateStr)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  entry
                    ? `${OFF_TYPE_COLORS[entry.off_type] ?? OFF_TYPE_COLORS.full} hover:opacity-80`
                    : inRange
                      ? 'bg-red-200 text-red-800 ring-1 ring-red-300'
                      : isWknd
                        ? 'bg-amber-50 text-gray-700 hover:bg-amber-100'
                        : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                {format(day, 'd')}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Rules Tab ───

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface RequiredShift {
  date: string;
  shift: string;
}

function RulesTab({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const saveMutation = useSaveConstraints();
  const existing = employee.constraints ?? [];

  const [weekendAvail, setWeekendAvail] = useState<string>(
    existing.find((c) => c.rule_type === 'weekend_availability')?.rule_value ?? 'alternating'
  );
  const [weekendGroup, setWeekendGroup] = useState<string>(
    existing.find((c) => c.rule_type === 'weekend_group')?.rule_value ?? 'auto'
  );
  // Weekend off-day pattern
  const existingOffPattern = existing.find((c) => c.rule_type === 'weekend_off_pattern')?.rule_value;
  const parsedOffPattern = (() => {
    if (!existingOffPattern || existingOffPattern === 'auto') return { before: 'auto', after: 'auto' };
    try { return JSON.parse(existingOffPattern); } catch { return { before: 'auto', after: 'auto' }; }
  })();
  const [offBefore, setOffBefore] = useState<string>(parsedOffPattern.before ?? 'auto');
  const [offAfter, setOffAfter] = useState<string>(parsedOffPattern.after ?? 'auto');

  const [blockedDays, setBlockedDays] = useState<Set<string>>(
    new Set(existing.filter((c) => c.rule_type === 'blocked_day').map((c) => c.rule_value))
  );
  const [requiredShifts, setRequiredShifts] = useState<RequiredShift[]>(
    existing
      .filter((c) => c.rule_type === 'required_shift')
      .map((c) => { try { return JSON.parse(c.rule_value) as RequiredShift; } catch { return null; } })
      .filter((v): v is RequiredShift => v !== null)
  );
  const [newReqDate, setNewReqDate] = useState('');
  const [newReqShift, setNewReqShift] = useState('am');

  const toggleDay = (day: string) => {
    const next = new Set(blockedDays);
    if (next.has(day)) next.delete(day); else next.add(day);
    setBlockedDays(next);
  };

  const addRequiredShift = () => {
    if (!newReqDate) return;
    if (requiredShifts.some((r) => r.date === newReqDate)) { toast.error('Date already has a required shift'); return; }
    setRequiredShifts([...requiredShifts, { date: newReqDate, shift: newReqShift }]);
    setNewReqDate('');
  };

  const handleSave = () => {
    const constraints: { rule_type: string; rule_value: string }[] = [];
    constraints.push({ rule_type: 'weekend_availability', rule_value: weekendAvail });
    if (weekendAvail === 'alternating') {
      constraints.push({ rule_type: 'weekend_group', rule_value: weekendGroup });
    }
    if (weekendAvail !== 'none' && (offBefore !== 'auto' || offAfter !== 'auto')) {
      constraints.push({ rule_type: 'weekend_off_pattern', rule_value: JSON.stringify({ before: offBefore, after: offAfter }) });
    }
    for (const day of blockedDays) constraints.push({ rule_type: 'blocked_day', rule_value: day });
    for (const req of requiredShifts) constraints.push({ rule_type: 'required_shift', rule_value: JSON.stringify(req) });

    saveMutation.mutate(
      { employeeId: employee.id, constraints },
      {
        onSuccess: () => { toast.success('Rules saved'); onClose(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-5">
      {/* Weekends */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Weekend Availability</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'all', label: 'All weekends' },
            { value: 'alternating', label: 'Alternating (every other)' },
            { value: 'once_a_month', label: 'Once a month' },
            { value: 'none', label: 'No weekends' },
          ].map((opt) => (
            <label key={opt.value}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                weekendAvail === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}>
              <input type="radio" name="weekend" value={opt.value}
                checked={weekendAvail === opt.value}
                onChange={() => setWeekendAvail(opt.value)}
                className="text-blue-600" />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
        {weekendAvail === 'alternating' && (
          <div className="mt-3 pl-1">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Weekend Group</label>
            <div className="flex gap-2">
              {[
                { value: 'auto', label: 'Auto' },
                { value: 'A', label: 'Group A (1st, 3rd)' },
                { value: 'B', label: 'Group B (2nd, 4th)' },
              ].map((opt) => (
                <label key={opt.value}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors ${
                    weekendGroup === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                  <input type="radio" name="weekendGroup" value={opt.value}
                    checked={weekendGroup === opt.value}
                    onChange={() => setWeekendGroup(opt.value)}
                    className="text-blue-600" />
                  <span className="text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {weekendAvail !== 'none' && (
          <div className="mt-3 pl-1">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Days Off When Working Weekends</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <span className="block text-[11px] text-gray-500 mb-1">Off-day before weekend</span>
                <select value={offBefore} onChange={(e) => setOffBefore(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="auto">Auto (alternates Thu/Fri)</option>
                  <option value="thu">Always Thursday</option>
                  <option value="fri">Always Friday</option>
                </select>
              </div>
              <div className="flex-1">
                <span className="block text-[11px] text-gray-500 mb-1">Off-day after weekend</span>
                <select value={offAfter} onChange={(e) => setOffAfter(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="auto">Auto (alternates Mon/Tue)</option>
                  <option value="mon">Always Monday</option>
                  <option value="tue">Always Tuesday</option>
                </select>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Choose fixed off-days or let the system alternate each on-weekend</p>
          </div>
        )}
      </div>

      {/* Blocked days */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Never Works On</label>
        <div className="flex gap-2">
          {DAY_NAMES.map((name, idx) => (
            <button key={idx} onClick={() => toggleDay(String(idx))}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                blockedDays.has(String(idx))
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Required shifts */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Must Work Specific Shift</label>
        <div className="flex gap-2 mb-2">
          <input type="date" value={newReqDate} onChange={(e) => setNewReqDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={newReqShift} onChange={(e) => setNewReqShift(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="am">AM</option>
            <option value="pm">PM</option>
            <option value="night">Night</option>
          </select>
          <button onClick={addRequiredShift}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            Add
          </button>
        </div>
        {requiredShifts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {requiredShifts.map((req) => (
              <span key={req.date} className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-lg flex items-center gap-1.5">
                {req.date} &rarr; {req.shift.toUpperCase()}
                <button onClick={() => setRequiredShifts(requiredShifts.filter((r) => r.date !== req.date))}
                  className="text-orange-500 hover:text-orange-700">&times;</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="pt-1">
        <button onClick={handleSave} disabled={saveMutation.isPending}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saveMutation.isPending ? 'Saving...' : 'Save Rules'}
        </button>
      </div>
    </div>
  );
}

// ─── Stations Tab ───

function StationsTab({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { data: allStations = [] } = useStations();
  const saveMutation = useSaveEmployeeStations();

  const [orderedIds, setOrderedIds] = useState<number[]>(
    employee.stations?.map((s) => s.id) ?? []
  );
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const toggle = (id: number) => {
    if (orderedIds.includes(id)) setOrderedIds(orderedIds.filter((sid) => sid !== id));
    else setOrderedIds([...orderedIds, id]);
  };

  const handleDragStart = (index: number) => {
    setDragIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setOverIdx(index);
  };

  const handleDrop = (index: number) => {
    if (dragIdx === null || dragIdx === index) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...orderedIds];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(index, 0, moved);
    setOrderedIds(next);
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleSave = () => {
    saveMutation.mutate(
      { employeeId: employee.id, stationIds: orderedIds },
      {
        onSuccess: () => { toast.success('Stations saved'); onClose(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const stationMap = new Map(allStations.map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Click stations to add/remove. Drag to reorder priority — #1 is preferred.
      </p>

      {/* Available stations */}
      <div className="flex flex-wrap gap-2">
        {allStations.map((station) => {
          const index = orderedIds.indexOf(station.id);
          const isSelected = index >= 0;
          return (
            <button key={station.id} onClick={() => toggle(station.id)}
              className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isSelected ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {isSelected && (
                <span className="absolute -top-2 -left-2 bg-green-800 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {index + 1}
                </span>
              )}
              {station.name}
            </button>
          );
        })}
        {allStations.length === 0 && (
          <span className="text-sm text-gray-400">No stations configured yet.</span>
        )}
      </div>

      {/* Priority ordering — drag to reorder */}
      {orderedIds.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Priority Order</span>
          <div className="space-y-1">
            {orderedIds.map((id, index) => {
              const station = stationMap.get(id);
              if (!station) return null;
              const isBeingDragged = dragIdx === index;
              const isDropTarget = overIdx === index && dragIdx !== index;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all cursor-grab active:cursor-grabbing ${
                    isBeingDragged
                      ? 'opacity-40 border-gray-300 bg-gray-100'
                      : isDropTarget
                        ? 'border-green-400 bg-green-50 shadow-sm'
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-gray-300 text-sm cursor-grab select-none">&#x2630;</span>
                  <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    index === 0 ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {index + 1}
                  </span>
                  <span className="text-sm text-gray-800 flex-1">
                    {station.name}
                    {index === 0 && <span className="text-xs text-green-600 ml-2 font-medium">Preferred</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pt-1">
        <button onClick={handleSave} disabled={saveMutation.isPending}
          className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {saveMutation.isPending ? 'Saving...' : 'Save Stations'}
        </button>
      </div>
    </div>
  );
}
