import { useState } from 'react';
import { useSaveConstraints } from '../../hooks/useEmployees';
import type { Employee } from '../../types';
import toast from 'react-hot-toast';

interface Props {
  employee: Employee;
  onClose: () => void;
}

interface RequiredShift {
  date: string;
  shift: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ConstraintsEditor({ employee, onClose }: Props) {
  const saveMutation = useSaveConstraints();
  const existing = employee.constraints ?? [];

  const [weekendAvail, setWeekendAvail] = useState<string>(
    existing.find((c) => c.rule_type === 'weekend_availability')?.rule_value ?? 'alternating'
  );
  const [weekendGroup, setWeekendGroup] = useState<string>(
    existing.find((c) => c.rule_type === 'weekend_group')?.rule_value ?? 'auto'
  );
  // Weekend off-day pattern: which days off when working weekends
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
      .map((c) => {
        try { return JSON.parse(c.rule_value) as RequiredShift; } catch { return null; }
      })
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
    if (requiredShifts.some((r) => r.date === newReqDate)) {
      toast.error('That date already has a required shift');
      return;
    }
    setRequiredShifts([...requiredShifts, { date: newReqDate, shift: newReqShift }]);
    setNewReqDate('');
  };

  const removeRequiredShift = (date: string) => {
    setRequiredShifts(requiredShifts.filter((r) => r.date !== date));
  };

  const handleSave = () => {
    const constraints: { rule_type: string; rule_value: string }[] = [];

    constraints.push({ rule_type: 'weekend_availability', rule_value: weekendAvail });
    if (weekendAvail === 'alternating') {
      constraints.push({ rule_type: 'weekend_group', rule_value: weekendGroup });
      // Weekend off-day pattern
      if (offBefore !== 'auto' || offAfter !== 'auto') {
        constraints.push({ rule_type: 'weekend_off_pattern', rule_value: JSON.stringify({ before: offBefore, after: offAfter }) });
      }
    }

    for (const day of blockedDays) {
      constraints.push({ rule_type: 'blocked_day', rule_value: day });
    }

    for (const req of requiredShifts) {
      constraints.push({ rule_type: 'required_shift', rule_value: JSON.stringify(req) });
    }

    saveMutation.mutate(
      { employeeId: employee.id, constraints },
      {
        onSuccess: () => { toast.success('Rules saved'); onClose(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <td colSpan={5} className="px-0 py-0">
      <div className="bg-blue-50 border-t border-b border-blue-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-700">Scheduling Rules — {employee.name}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* Weekend availability */}
          <div>
            <label className="block font-medium text-gray-600 mb-1.5">Weekends</label>
            <div className="flex flex-col gap-1">
              {[
                { value: 'all', label: 'All weekends' },
                { value: 'alternating', label: 'Alternating (every other weekend)' },
                { value: 'once_a_month', label: 'Once a month' },
                { value: 'none', label: 'No weekends' },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="weekend"
                    value={opt.value}
                    checked={weekendAvail === opt.value}
                    onChange={() => setWeekendAvail(opt.value)}
                    className="text-blue-600"
                  />
                  <span className="text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {weekendAvail === 'alternating' && (
              <div className="mt-2">
                <label className="block font-medium text-gray-600 mb-1">Weekend Group</label>
                <div className="flex gap-1.5">
                  {[
                    { value: 'auto', label: 'Auto' },
                    { value: 'A', label: 'Group A (1st, 3rd)' },
                    { value: 'B', label: 'Group B (2nd, 4th)' },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="weekendGroup"
                        value={opt.value}
                        checked={weekendGroup === opt.value}
                        onChange={() => setWeekendGroup(opt.value)}
                        className="text-blue-600"
                      />
                      <span className="text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">A works 1st & 3rd weekends, B works 2nd & 4th</p>
              </div>
            )}
          </div>

          {/* Weekend off-day pattern — only shows for alternating */}
          {weekendAvail === 'alternating' && (
            <div>
              <label className="block font-medium text-gray-600 mb-1.5">Weekend Off-Days</label>
              <div className="flex flex-col gap-2">
                <div>
                  <span className="text-[10px] text-gray-500">Day off before weekend</span>
                  <select
                    value={offBefore}
                    onChange={(e) => setOffBefore(e.target.value)}
                    className="block w-full border rounded px-1.5 py-1 text-xs mt-0.5"
                  >
                    <option value="auto">Auto (alternates)</option>
                    <option value="thu">Thursday</option>
                    <option value="fri">Friday</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500">Day off after weekend</span>
                  <select
                    value={offAfter}
                    onChange={(e) => setOffAfter(e.target.value)}
                    className="block w-full border rounded px-1.5 py-1 text-xs mt-0.5"
                  >
                    <option value="auto">Auto (alternates)</option>
                    <option value="mon">Monday</option>
                    <option value="tue">Tuesday</option>
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Fixed days off or alternate Thu/Fri & Mon/Tue</p>
            </div>
          )}

          {/* Blocked days of week */}
          <div>
            <label className="block font-medium text-gray-600 mb-1.5">Never works on</label>
            <div className="flex flex-wrap gap-1">
              {DAY_NAMES.map((name, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(String(idx))}
                  className={`px-2 py-1 rounded text-[11px] transition-colors ${
                    blockedDays.has(String(idx))
                      ? 'bg-red-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Required shift on specific dates */}
          <div>
            <label className="block font-medium text-gray-600 mb-1.5">Must work specific shift</label>
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1">
                <input
                  type="date"
                  value={newReqDate}
                  onChange={(e) => setNewReqDate(e.target.value)}
                  className="border rounded px-1.5 py-1 text-xs flex-1"
                />
                <select
                  value={newReqShift}
                  onChange={(e) => setNewReqShift(e.target.value)}
                  className="border rounded px-1.5 py-1 text-xs"
                >
                  <option value="am">AM</option>
                  <option value="pm">PM</option>
                  <option value="night">Night</option>
                </select>
                <button
                  onClick={addRequiredShift}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] hover:bg-blue-700"
                >
                  +
                </button>
              </div>
              {requiredShifts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {requiredShifts.map((req) => (
                    <span key={req.date} className="bg-orange-100 text-orange-800 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                      {req.date} → {req.shift}
                      <button onClick={() => removeRequiredShift(req.date)} className="text-orange-500 hover:text-orange-700">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Rules'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 bg-gray-200 rounded text-xs hover:bg-gray-300">
            Cancel
          </button>
        </div>
      </div>
    </td>
  );
}
