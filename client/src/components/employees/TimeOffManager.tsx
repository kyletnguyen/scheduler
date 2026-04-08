import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { useTimeOff, useCreateTimeOff, useDeleteTimeOff, useClearTimeOff } from '../../hooks/useTimeOff';
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

  return (
    <td colSpan={5} className="px-0 py-0">
      <div className="bg-gray-50 border-t border-b border-gray-200 px-4 py-3">
        <div className="flex items-start gap-4">
          {/* Left: type picker */}
          <div className="flex flex-col gap-2 min-w-[180px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Time Off</span>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm leading-none">&times;</button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setOffType('full')}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  offType === 'full'
                    ? 'bg-gray-800 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                Full Day
              </button>
              <button
                onClick={() => setOffType('custom')}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  offType === 'custom'
                    ? 'bg-gray-800 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                Custom Hours
              </button>
            </div>
            {offType === 'custom' && (
              <div className="flex items-center gap-2 mt-1 bg-white border border-gray-200 rounded p-2">
                <input
                  type="time"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm flex-1"
                />
                <span className="text-sm text-gray-400">to</span>
                <input
                  type="time"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm flex-1"
                />
              </div>
            )}
            <p className="text-[10px] text-gray-400">Select type, then click dates</p>
          </div>

          {/* Right: compact calendar */}
          <div className="flex-1 max-w-[320px]">
            <div className="flex items-center justify-between mb-1.5">
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded">&larr;</button>
              <span className="text-xs font-medium text-gray-700">{format(currentDate, 'MMM yyyy')}</span>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded">&rarr;</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-[9px] font-medium text-gray-400 py-0.5">{d}</div>
              ))}
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const entry = timeOffMap.get(dateStr);
                const colorClass = entry ? (OFF_TYPE_COLORS[entry.off_type] ?? OFF_TYPE_COLORS.full) : '';

                return (
                  <button
                    key={dateStr}
                    onClick={() => toggleDate(dateStr)}
                    title={entry
                      ? `${entry.off_type === 'custom' && entry.start_time ? `Off ${entry.start_time}-${entry.end_time}` : 'Full day off'} — click to remove`
                      : `Click to mark ${offType === 'custom' ? `off ${customStart}-${customEnd}` : 'full day off'}`
                    }
                    className={`py-1 rounded text-[10px] transition-colors ${
                      entry
                        ? `${colorClass} hover:opacity-80`
                        : 'hover:bg-gray-200 text-gray-600'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary of marked days */}
          {timeOff && timeOff.length > 0 && (
            <div className="min-w-[130px] max-h-[170px] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-gray-500">Marked off:</span>
                <button
                  onClick={() => {
                    if (!confirm(`Clear all ${timeOff.length} time-off entries for ${format(currentDate, 'MMM yyyy')}?`)) return;
                    clearMutation.mutate(
                      { employeeId: employee.id, month },
                      { onSuccess: (r) => toast.success(`Cleared ${r.deleted} entries`), onError: (err) => toast.error(err.message) }
                    );
                  }}
                  className="text-[9px] text-red-500 hover:text-red-700"
                >
                  Clear All
                </button>
              </div>
              {timeOff.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 text-[10px] text-gray-600 py-0.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${OFF_TYPE_COLORS[t.off_type]?.split(' ')[0] ?? 'bg-red-500'}`} />
                  <span>{format(new Date(t.date + 'T00:00:00'), 'MMM d')}</span>
                  <span className="text-gray-400">
                    {t.off_type === 'custom' && t.start_time ? `${t.start_time}-${t.end_time}` : 'All day'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}
