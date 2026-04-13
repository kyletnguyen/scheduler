import React, { useState, useMemo, useCallback, useRef } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { useUpdateEmployee, useSaveConstraints, useEmployees } from '../../hooks/useEmployees';
import { useStations, useSaveEmployeeStations } from '../../hooks/useStations';
import { useTimeOff, useCreateTimeOff, useDeleteTimeOff, useClearTimeOff } from '../../hooks/useTimeOff';
import { usePTOImpact } from '../../hooks/useSchedule';
import type { Employee, DefaultShift } from '../../types';
import { buildStationStyleMap } from '../../utils/stationStyles';
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
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
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

const SHIFT_OPTIONS: { value: DefaultShift; label: string; desc: string; color: string; activeColor: string }[] = [
  { value: 'am', label: 'AM', desc: 'Day shift', color: 'border-gray-200 bg-white hover:bg-gray-50', activeColor: 'border-2 border-amber-300 bg-amber-50 text-amber-800 shadow-sm' },
  { value: 'pm', label: 'PM', desc: 'Evening shift', color: 'border-gray-200 bg-white hover:bg-gray-50', activeColor: 'border-2 border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm' },
  { value: 'night', label: 'Night', desc: 'Overnight', color: 'border-gray-200 bg-white hover:bg-gray-50', activeColor: 'border-2 border-gray-400 bg-gray-100 text-gray-800 shadow-sm' },
  { value: 'floater', label: 'Floater', desc: 'Flexible', color: 'border-gray-200 bg-white hover:bg-gray-50', activeColor: 'border-2 border-teal-300 bg-teal-50 text-teal-800 shadow-sm' },
];

const ROLE_OPTIONS: { value: Employee['role']; label: string; desc: string }[] = [
  { value: 'cls', label: 'CLS', desc: 'Clinical Lab Scientist' },
  { value: 'mlt', label: 'MLT', desc: 'Medical Lab Technician' },
  { value: 'admin', label: 'Admin', desc: 'Administrative' },
];

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
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Role */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role</label>
        <div className="grid grid-cols-3 gap-2">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={`px-3 py-2.5 rounded-lg border text-center transition-all ${
                role === r.value
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className={`text-sm font-bold ${role === r.value ? 'text-blue-700' : 'text-gray-700'}`}>{r.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Employment Type + Hours */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Employment</label>
          <select value={type} onChange={(e) => setType(e.target.value as Employee['employment_type'])}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
            <option value="full-time">Full-Time</option>
            <option value="part-time">Part-Time</option>
            <option value="per-diem">Per Diem</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Hrs/Week</label>
          <input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value))}
            min={0} max={80} step={0.5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
      </div>

      {/* Default Shift */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Default Shift</label>
        <div className="grid grid-cols-4 gap-2">
          {SHIFT_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setShift(s.value)}
              className={`px-2 py-2.5 rounded-lg border text-center transition-all ${
                shift === s.value ? s.activeColor : s.color
              }`}
            >
              <div className={`text-sm font-bold ${shift === s.value ? '' : 'text-gray-600'}`}>{s.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="pt-2">
        <button onClick={handleSave} disabled={updateMutation.isPending || !name.trim()}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
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
  const { data: allMonthTimeOff } = useTimeOff({ month }); // everyone's time off this month
  const { data: allEmployees } = useEmployees();
  const createMutation = useCreateTimeOff();
  const deleteMutation = useDeleteTimeOff();
  const clearMutation = useClearTimeOff();

  // Build "who else is off" index: date -> list of other employee names
  const othersOffByDate = new Map<string, string[]>();
  if (allMonthTimeOff && allEmployees) {
    const empNameMap = new Map(allEmployees.map(e => [e.id, e.name]));
    for (const entry of allMonthTimeOff) {
      if (entry.employee_id === employee.id) continue;
      if (entry.off_type !== 'full') continue;
      const names = othersOffByDate.get(entry.date) ?? [];
      const name = empNameMap.get(entry.employee_id);
      if (name) names.push(name);
      othersOffByDate.set(entry.date, names);
    }
  }

  // Drag-to-select range state
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const timeOffMap = new Map(timeOff?.map((t) => [t.date, t]) ?? []);
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);

  const fullDayCount = timeOff?.filter(t => t.off_type === 'full').length ?? 0;
  const customCount = timeOff?.filter(t => t.off_type === 'custom').length ?? 0;

  // PTO impact check — only for full-day PTO entries
  const fullDayDates = (timeOff ?? []).filter(t => t.off_type === 'full').map(t => t.date);
  const { data: ptoImpact, isLoading: impactLoading } = usePTOImpact(employee.id, fullDayDates);

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
    <div className="space-y-4">
      {/* PTO Impact Warning */}
      {ptoImpact && ptoImpact.issues.length > 0 && (
        <div className={`rounded-lg border p-3 ${
          ptoImpact.has_critical
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start gap-2">
            <span className={`text-lg leading-none mt-0.5 ${ptoImpact.has_critical ? 'text-red-500' : 'text-amber-500'}`}>
              {ptoImpact.has_critical ? '!!' : '!'}
            </span>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-bold ${ptoImpact.has_critical ? 'text-red-800' : 'text-amber-800'}`}>
                {ptoImpact.has_critical ? 'Critical Coverage Gaps' : 'Scheduling Warnings'}
              </div>
              <p className={`text-[11px] mt-0.5 ${ptoImpact.has_critical ? 'text-red-700' : 'text-amber-700'}`}>
                Approving this PTO will cause {ptoImpact.issues.length} issue{ptoImpact.issues.length !== 1 ? 's' : ''} with the current schedule:
              </p>
              <div className="mt-2 space-y-1 max-h-[120px] overflow-y-auto">
                {ptoImpact.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                      issue.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                    <span className={issue.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}>
                      <span className="font-semibold">{format(new Date(issue.date + 'T00:00:00'), 'EEE M/d')}</span>
                      {' — '}
                      {issue.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {impactLoading && fullDayDates.length > 0 && (
        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          Checking schedule impact...
        </div>
      )}

    <div className="flex gap-6">
      {/* Left: mode picker + summary */}
      <div className="flex flex-col gap-3 w-[320px] shrink-0">
        {/* Mode toggle card */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Type</span>
          <div className="flex gap-1.5">
            <button onClick={() => setOffType('full')}
              className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-all ${
                offType === 'full'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              Full Day
            </button>
            <button onClick={() => setOffType('custom')}
              className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-all ${
                offType === 'custom'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              Partial Day
            </button>
          </div>

          {/* Custom hours */}
          {offType === 'custom' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 mt-2.5">
              <span className="text-[10px] font-semibold text-orange-600 block mb-1.5">Hours off</span>
              <div className="flex items-center gap-1.5">
                <input type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-orange-200 rounded px-2 py-1.5 text-xs flex-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
                <span className="text-[10px] text-orange-400 font-medium">to</span>
                <input type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-orange-200 rounded px-2 py-1.5 text-xs flex-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-gray-400 leading-snug">
          {offType === 'full'
            ? 'Click or drag across dates to mark full-day PTO. Click a marked date to remove it.'
            : `Click or drag dates to mark off ${customStart}–${customEnd}. Click a marked date to remove.`
          }
        </p>

        {/* Summary */}
        {timeOff && timeOff.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">
                Scheduled Off
                <span className="text-gray-400 font-normal ml-1">({timeOff.length})</span>
              </span>
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

            {/* Counts */}
            <div className="flex gap-3 mb-2 text-[10px]">
              {fullDayCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-gray-600">{fullDayCount} full</span>
                </span>
              )}
              {customCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-gray-600">{customCount} partial</span>
                </span>
              )}
            </div>

            <div className="max-h-[160px] overflow-y-auto space-y-0.5">
              {timeOff.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 text-xs text-gray-600 group py-0.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${OFF_TYPE_COLORS[t.off_type]?.split(' ')[0] ?? 'bg-red-500'}`} />
                  <span className="font-medium">{format(new Date(t.date + 'T00:00:00'), 'EEE, MMM d')}</span>
                  <span className="text-gray-400 text-[10px]">
                    {t.off_type === 'custom' && t.start_time ? `${t.start_time}–${t.end_time}` : 'All day'}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(t.id, { onError: (err) => toast.error(err.message) })}
                    className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="flex-1 max-w-[360px] select-none" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="px-2.5 py-1 text-sm hover:bg-gray-100 rounded-lg text-gray-500">&larr;</button>
          <span className="text-sm font-bold text-gray-800">{format(currentDate, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="px-2.5 py-1 text-sm hover:bg-gray-100 rounded-lg text-gray-500">&rarr;</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
            <div key={i} className="text-[10px] font-bold text-gray-400 py-1">{d}</div>
          ))}
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const entry = timeOffMap.get(dateStr);
            const isWknd = getDay(day) === 0 || getDay(day) === 6;
            const inRange = isInDragRange(dateStr);
            const othersOff = othersOffByDate.get(dateStr) ?? [];
            const othersTooltip = othersOff.length > 0 ? `\nAlso off: ${othersOff.join(', ')}` : '';
            return (
              <div
                key={dateStr}
                onMouseDown={(e) => { e.preventDefault(); handleMouseDown(dateStr); }}
                onMouseEnter={() => handleMouseEnter(dateStr)}
                title={entry
                  ? `${entry.off_type === 'custom' && entry.start_time ? `Off ${entry.start_time}–${entry.end_time}` : 'Full day off'} — click to remove${othersTooltip}`
                  : othersOff.length > 0 ? `Also off: ${othersOff.join(', ')}` : undefined
                }
                className={`py-2 rounded-lg text-xs font-medium transition-all cursor-pointer relative ${
                  entry
                    ? `${OFF_TYPE_COLORS[entry.off_type] ?? OFF_TYPE_COLORS.full} hover:opacity-70 shadow-sm`
                    : inRange
                      ? offType === 'custom'
                        ? 'bg-orange-200 text-orange-800 ring-1 ring-orange-300'
                        : 'bg-red-200 text-red-800 ring-1 ring-red-300'
                      : isWknd
                        ? 'bg-amber-50 text-gray-600 hover:bg-amber-100'
                        : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                {format(day, 'd')}
                {othersOff.length > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full text-[7px] font-bold flex items-center justify-center ${
                    entry ? 'bg-white text-red-600' : 'bg-amber-400 text-white'
                  }`}>
                    {othersOff.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* Others off overlap — show when this employee has PTO dates that overlap with others */}
    {(() => {
      if (!timeOff || timeOff.length === 0) return null;
      const myDates = timeOff.filter(t => t.off_type === 'full').map(t => t.date);
      const overlaps = new Map<string, string[]>(); // person -> dates they overlap
      for (const date of myDates) {
        const others = othersOffByDate.get(date) ?? [];
        for (const name of others) {
          if (!overlaps.has(name)) overlaps.set(name, []);
          overlaps.get(name)!.push(date);
        }
      }
      if (overlaps.size === 0) return null;
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-1">
          <div className="text-xs font-bold text-amber-800 mb-1.5">Others off on overlapping dates</div>
          <div className="space-y-1">
            {[...overlaps.entries()].sort(([,a],[,b]) => b.length - a.length).map(([name, dates]) => (
              <div key={name} className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold text-amber-700 min-w-[80px]">{name}</span>
                <div className="flex flex-wrap gap-1">
                  {dates.map(d => (
                    <span key={d} className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px]">
                      {format(new Date(d + 'T00:00:00'), 'M/d')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    })()}
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

// Normalize raw weights so they sum to exactly 100 (rounded ints).
function normalizeToPercents(raw: Map<number, number>): Map<number, number> {
  if (raw.size === 0) return new Map();
  const total = [...raw.values()].reduce((a, b) => a + b, 0);
  if (total === 0) {
    // All zero — split evenly
    const each = Math.floor(100 / raw.size);
    const remainder = 100 - each * raw.size;
    const out = new Map<number, number>();
    let i = 0;
    for (const k of raw.keys()) {
      out.set(k, each + (i < remainder ? 1 : 0));
      i++;
    }
    return out;
  }
  // Scale proportionally, then distribute rounding error
  const scaled: { id: number; exact: number; floor: number }[] = [];
  for (const [id, w] of raw) {
    const exact = (w / total) * 100;
    scaled.push({ id, exact, floor: Math.floor(exact) });
  }
  const floorSum = scaled.reduce((a, b) => a + b.floor, 0);
  let remainder = 100 - floorSum;
  // Give leftover to the largest fractional parts
  scaled.sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor));
  const out = new Map<number, number>();
  for (const item of scaled) {
    out.set(item.id, item.floor + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

// Redistribute: user dragged `changedId` to `newValue`.
// Keep the changed station at newValue and adjust the others proportionally so sum = 100.
function redistribute(current: Map<number, number>, changedId: number, newValue: number): Map<number, number> {
  const clamped = Math.max(0, Math.min(100, Math.round(newValue)));
  if (current.size === 1) {
    const out = new Map<number, number>();
    out.set(changedId, 100);
    return out;
  }
  const others = [...current.entries()].filter(([id]) => id !== changedId);
  const remaining = 100 - clamped;
  const othersTotal = others.reduce((a, [, v]) => a + v, 0);

  const out = new Map<number, number>();
  out.set(changedId, clamped);

  if (othersTotal === 0) {
    // Split remaining evenly among the others
    const each = Math.floor(remaining / others.length);
    let leftover = remaining - each * others.length;
    for (const [id] of others) {
      out.set(id, each + (leftover > 0 ? 1 : 0));
      if (leftover > 0) leftover--;
    }
  } else {
    // Scale others proportionally to their current values
    const scaled: { id: number; exact: number; floor: number }[] = others.map(([id, v]) => {
      const exact = (v / othersTotal) * remaining;
      return { id, exact, floor: Math.floor(exact) };
    });
    const floorSum = scaled.reduce((a, b) => a + b.floor, 0);
    let leftover = remaining - floorSum;
    scaled.sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor));
    for (const item of scaled) {
      out.set(item.id, item.floor + (leftover > 0 ? 1 : 0));
      if (leftover > 0) leftover--;
    }
  }
  return out;
}

/** Individual percentage slider — owns its value during drag to prevent parent re-renders. */
const PercentSlider = React.memo(function PercentSlider({
  stationId,
  stationName,
  color,
  abbr,
  pct,
  disabled,
  onCommit,
}: {
  stationId: number;
  stationName: string;
  color: string;
  abbr: string | undefined;
  pct: number;
  disabled: boolean;
  onCommit: (id: number, value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(pct);
  const dragging = useRef(false);

  // Sync from parent when not actively dragging
  const prevPct = useRef(pct);
  if (pct !== prevPct.current && !dragging.current) {
    prevPct.current = pct;
    setLocalValue(pct);
  }

  const display = dragging.current ? localValue : pct;

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {abbr && (
            <span
              className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white"
              style={{ backgroundColor: color }}
            >
              {abbr}
            </span>
          )}
          <span className="text-sm font-medium text-gray-800">{stationName}</span>
        </div>
        <span className="text-base font-bold text-gray-800 tabular-nums w-[48px] text-right">{display}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={display}
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => {
          dragging.current = false;
          onCommit(stationId, localValue);
        }}
        onLostPointerCapture={() => {
          if (dragging.current) {
            dragging.current = false;
            onCommit(stationId, localValue);
          }
        }}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocalValue(v);
          if (!dragging.current) {
            onCommit(stationId, v);
          }
        }}
        className="station-slider"
        style={{
          '--track-color': color,
          '--fill-pct': `${display}%`,
        } as React.CSSProperties}
        disabled={disabled}
      />
    </div>
  );
});

function StationsTab({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { data: allStations = [] } = useStations();
  const saveMutation = useSaveEmployeeStations();

  const stationStyleMap = useMemo(() => buildStationStyleMap(allStations), [allStations]);

  // Percentages per station_id (integers summing to 100 when any are selected).
  const [percents, setPercents] = useState<Map<number, number>>(() => {
    const raw = new Map<number, number>();
    for (const s of employee.stations ?? []) {
      raw.set(s.id, s.weight ?? 50);
    }
    return normalizeToPercents(raw);
  });

  const toggleStation = (id: number) => {
    const next = new Map(percents);
    if (next.has(id)) {
      next.delete(id);
      setPercents(normalizeToPercents(next));
    } else {
      const newCount = next.size + 1;
      const newShare = Math.round(100 / newCount);
      next.set(id, 0);
      setPercents(redistribute(next, id, newShare));
    }
  };

  const commitPercent = useCallback((id: number, value: number) => {
    setPercents(prev => redistribute(prev, id, value));
  }, []);

  const handleSave = () => {
    const payload = [...percents.entries()].map(([station_id, weight]) => ({ station_id, weight }));
    saveMutation.mutate(
      { employeeId: employee.id, stations: payload },
      {
        onSuccess: () => { toast.success('Stations saved'); onClose(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const selectedCount = allStations.filter(s => percents.has(s.id)).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Click a station to add it, then adjust the percentage to set how often this employee should work there.
        Percentages always add up to 100% — moving one slider auto-adjusts the others.
      </p>

      {/* Station toggle pills */}
      <div className="flex flex-wrap gap-2">
        {allStations.map((station) => {
          const isSelected = percents.has(station.id);
          const style = stationStyleMap[station.name];
          return (
            <button
              key={station.id}
              onClick={() => toggleStation(station.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                isSelected
                  ? 'text-white border-transparent shadow-sm'
                  : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
              }`}
              style={isSelected && style ? { backgroundColor: style.color } : undefined}
            >
              {isSelected && style ? `${style.abbr} · ` : ''}{station.name}
            </button>
          );
        })}
        {allStations.length === 0 && (
          <span className="text-sm text-gray-400">No stations configured yet.</span>
        )}
      </div>

      {/* Percentage sliders — order follows allStations (DB order), never reorders */}
      {selectedCount > 0 && (
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Station Mix (must total 100%)</span>
          <div className="space-y-2">
            {allStations
              .filter(s => percents.has(s.id))
              .map((station) => {
                const style = stationStyleMap[station.name];
                const color = style?.color ?? '#16a34a';
                return (
                  <PercentSlider
                    key={station.id}
                    stationId={station.id}
                    stationName={station.name}
                    color={color}
                    abbr={style?.abbr}
                    pct={percents.get(station.id) ?? 0}
                    disabled={selectedCount < 2}
                    onCommit={commitPercent}
                  />
                );
              })}
          </div>
        </div>
      )}

      <div className="pt-1">
        <button onClick={handleSave} disabled={saveMutation.isPending}
          className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {saveMutation.isPending ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
