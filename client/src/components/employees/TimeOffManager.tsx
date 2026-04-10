import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { useTimeOff, useCreateTimeOff, useDeleteTimeOff, useClearTimeOff } from '../../hooks/useTimeOff';
import { usePTOImpact } from '../../hooks/useSchedule';
import type { Employee } from '../../types';
import toast from 'react-hot-toast';

interface Props {
  employee: Employee;
  onClose: () => void;
}

const OFF_TYPE_COLORS: Record<string, string> = {
  'full': 'bg-red-500 text-white',
  'custom': 'bg-orange-500 text-white',
};

export default function TimeOffManager({ employee, onClose }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [offType, setOffType] = useState<'full' | 'custom'>('full');
  const [customStart, setCustomStart] = useState('09:00');
  const [customEnd, setCustomEnd] = useState('13:00');
  const month = format(currentDate, 'yyyy-MM');

  const { data: timeOff } = useTimeOff({ employee_id: employee.id, month });
  const createMutation = useCreateTimeOff();
  const deleteMutation = useDeleteTimeOff();
  const clearMutation = useClearTimeOff();

  const timeOffMap = new Map(timeOff?.map((t) => [t.date, t]) ?? []);

  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);

  const toggleDate = (dateStr: string) => {
    const existing = timeOffMap.get(dateStr);
    if (existing) {
      deleteMutation.mutate(existing.id, {
        onError: (err) => toast.error(err.message),
      });
    } else {
      createMutation.mutate(
        {
          employee_id: employee.id,
          dates: [dateStr],
          off_type: offType,
          ...(offType === 'custom' ? { start_time: customStart, end_time: customEnd } : {}),
        },
        { onError: (err) => toast.error(err.message) }
      );
    }
  };

  const fullDayCount = timeOff?.filter(t => t.off_type === 'full').length ?? 0;
  const customCount = timeOff?.filter(t => t.off_type === 'custom').length ?? 0;

  // PTO impact check
  const fullDayDates = (timeOff ?? []).filter(t => t.off_type === 'full').map(t => t.date);
  const { data: ptoImpact } = usePTOImpact(employee.id, fullDayDates);

  return (
    <td colSpan={5} className="px-0 py-0">
      <div className="bg-gray-50 border-t border-b border-gray-200 px-4 py-3">
        {/* PTO Impact Warning — compact inline version */}
        {ptoImpact && ptoImpact.issues.length > 0 && (
          <div className={`rounded-md border px-3 py-2 mb-3 ${
            ptoImpact.has_critical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-bold ${ptoImpact.has_critical ? 'text-red-700' : 'text-amber-700'}`}>
                {ptoImpact.has_critical ? '!! ' : '! '}
                {ptoImpact.issues.length} coverage issue{ptoImpact.issues.length !== 1 ? 's' : ''}
              </span>
              <span className={`text-[10px] ${ptoImpact.has_critical ? 'text-red-600' : 'text-amber-600'}`}>
                — {ptoImpact.issues.map(i => `${format(new Date(i.date + 'T00:00:00'), 'M/d')}: ${i.message}`).slice(0, 2).join('; ')}
                {ptoImpact.issues.length > 2 ? ` +${ptoImpact.issues.length - 2} more` : ''}
              </span>
            </div>
          </div>
        )}
        <div className="flex items-start gap-5">
          {/* Left: controls */}
          <div className="flex flex-col gap-2.5 min-w-[200px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800">Time Off — {format(currentDate, 'MMM yyyy')}</span>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>

            {/* Mode toggle */}
            <div className="bg-white border border-gray-200 rounded-lg p-2.5">
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setOffType('full')}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    offType === 'full'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Full Day
                </button>
                <button
                  onClick={() => setOffType('custom')}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    offType === 'custom'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Partial Day
                </button>
              </div>

              {/* Custom hours - smooth expand */}
              <div className={`overflow-hidden transition-all duration-200 ${offType === 'custom' ? 'max-h-20 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-md p-2">
                  <input
                    type="time"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="border border-orange-200 rounded px-1.5 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  <span className="text-[10px] text-orange-400 font-medium">to</span>
                  <input
                    type="time"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="border border-orange-200 rounded px-1.5 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                </div>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 leading-snug">
              {offType === 'full' ? 'Click dates to toggle full-day PTO' : `Click dates to mark off ${customStart}–${customEnd}`}
            </p>

            {/* Summary counts */}
            {timeOff && timeOff.length > 0 && (
              <div className="flex items-center gap-3 text-[10px]">
                {fullDayCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-gray-600">{fullDayCount} full day{fullDayCount !== 1 ? 's' : ''}</span>
                  </span>
                )}
                {customCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-gray-600">{customCount} partial</span>
                  </span>
                )}
                <button
                  onClick={() => {
                    if (!confirm(`Clear all ${timeOff.length} time-off entries for ${format(currentDate, 'MMM yyyy')}?`)) return;
                    clearMutation.mutate(
                      { employeeId: employee.id, month },
                      { onSuccess: (r) => toast.success(`Cleared ${r.deleted} entries`), onError: (err) => toast.error(err.message) }
                    );
                  }}
                  className="text-[9px] text-red-500 hover:text-red-700 ml-auto"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Center: calendar */}
          <div className="flex-1 max-w-[300px]">
            <div className="flex items-center justify-between mb-1.5">
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="px-2 py-0.5 text-xs hover:bg-gray-200 rounded text-gray-500">&larr;</button>
              <span className="text-xs font-semibold text-gray-700">{format(currentDate, 'MMMM yyyy')}</span>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="px-2 py-0.5 text-xs hover:bg-gray-200 rounded text-gray-500">&rarr;</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-[9px] font-semibold text-gray-400 py-0.5">{d}</div>
              ))}
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const entry = timeOffMap.get(dateStr);
                const isWknd = getDay(day) === 0 || getDay(day) === 6;
                const colorClass = entry ? (OFF_TYPE_COLORS[entry.off_type] ?? OFF_TYPE_COLORS.full) : '';

                return (
                  <button
                    key={dateStr}
                    onClick={() => toggleDate(dateStr)}
                    title={entry
                      ? `${entry.off_type === 'custom' && entry.start_time ? `Off ${entry.start_time}–${entry.end_time}` : 'Full day off'} — click to remove`
                      : `Click to mark ${offType === 'custom' ? `off ${customStart}–${customEnd}` : 'full day off'}`
                    }
                    className={`py-1 rounded text-[10px] font-medium transition-colors ${
                      entry
                        ? `${colorClass} hover:opacity-70 shadow-sm`
                        : isWknd
                          ? 'bg-amber-50/80 text-gray-500 hover:bg-amber-100'
                          : 'hover:bg-gray-200 text-gray-600'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: marked days list */}
          {timeOff && timeOff.length > 0 && (
            <div className="min-w-[140px] max-h-[180px] overflow-y-auto">
              <span className="text-[10px] font-semibold text-gray-500 block mb-1">Scheduled off:</span>
              {timeOff.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 text-[10px] text-gray-600 py-0.5 group"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${OFF_TYPE_COLORS[t.off_type]?.split(' ')[0] ?? 'bg-red-500'}`} />
                  <span className="font-medium">{format(new Date(t.date + 'T00:00:00'), 'MMM d')}</span>
                  <span className="text-gray-400">
                    {t.off_type === 'custom' && t.start_time ? `${t.start_time}–${t.end_time}` : 'All day'}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(t.id, { onError: (err) => toast.error(err.message) })}
                    className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-[9px]"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}
