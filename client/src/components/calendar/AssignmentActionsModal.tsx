import { useState, useEffect, useRef } from 'react';
import type { ScheduleAssignment, Station, Employee } from '../../types';
import type { StationDisplay } from '../../utils/stationStyles';

interface Props {
  assignment: ScheduleAssignment;
  employee: Employee;
  sameShiftAssignments: { assignment: ScheduleAssignment; employee: Employee }[];
  stations: Station[];
  getStationDisplay: (name: string) => StationDisplay;
  onChangeStation: (stationId: number | null) => void;
  onSwap: (otherAssignmentId: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

type Mode = 'menu' | 'station' | 'swap';

const ROLE_PILL: Record<string, { label: string; className: string }> = {
  cls:   { label: 'CLS',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  mlt:   { label: 'MLT',   className: 'bg-purple-100 text-purple-700 border-purple-200' },
  admin: { label: 'Admin', className: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function RolePill({ role }: { role: string }) {
  const info = ROLE_PILL[role] ?? { label: role.toUpperCase(), className: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${info.className}`}>
      {info.label}
    </span>
  );
}

export default function AssignmentActionsModal({
  assignment,
  employee,
  sameShiftAssignments,
  stations,
  getStationDisplay,
  onChangeStation,
  onSwap,
  onRemove,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>('menu');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (mode === 'menu') onClose();
        else setMode('menu');
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mode, onClose]);

  // Qualified stations for this employee — fall back to all stations
  const qualifiedStations = employee.stations && employee.stations.length > 0 ? employee.stations : stations;

  const currentStationDisplay = assignment.station_name ? getStationDisplay(assignment.station_name) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-96 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            {currentStationDisplay && (
              <span
                className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: currentStationDisplay.color }}
              >
                {currentStationDisplay.abbr}
              </span>
            )}
            <h3 className="text-sm font-semibold text-gray-800">{employee.name}</h3>
            <RolePill role={employee.role} />
          </div>
          <p className="text-xs text-gray-500">
            {assignment.shift_name} · {assignment.date}
            {assignment.station_name ? ` · ${assignment.station_name}` : ' · No station'}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'menu' && (
            <div className="space-y-2">
              <button
                onClick={() => setMode('station')}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <div className="text-sm font-medium text-gray-800">Change station</div>
                <div className="text-xs text-gray-500">Move to a different station</div>
              </button>
              {(() => {
                const swappable = sameShiftAssignments.filter(({ employee: o }) => {
                  // No one swaps with admin
                  if (employee.role === 'admin' || o.role === 'admin') return false;
                  // MLT only swaps with MLT, CLS only with CLS
                  return employee.role === o.role;
                });
                return (
                  <button
                    onClick={() => setMode('swap')}
                    disabled={swappable.length === 0}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-transparent"
                  >
                    <div className="text-sm font-medium text-gray-800">Swap with another employee</div>
                    <div className="text-xs text-gray-500">
                      {swappable.length === 0
                        ? 'No same-role employees to swap with'
                        : `Swap stations with another ${assignment.shift_name} employee`}
                    </div>
                  </button>
                );
              })()}
              <button
                onClick={onRemove}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-red-400 hover:bg-red-50 transition-colors"
              >
                <div className="text-sm font-medium text-red-600">Remove assignment</div>
                <div className="text-xs text-gray-500">Delete this assignment</div>
              </button>
            </div>
          )}

          {mode === 'station' && (
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">Select new station</div>
              <div className="space-y-1">
                <button
                  onClick={() => onChangeStation(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2 ${assignment.station_id == null ? 'bg-gray-50' : ''}`}
                >
                  <span className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-gray-300 text-gray-600">—</span>
                  <span className="text-sm text-gray-700">No station</span>
                </button>
                {qualifiedStations.map((s) => {
                  const display = getStationDisplay(s.name);
                  const isCurrent = s.id === assignment.station_id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => onChangeStation(s.id)}
                      disabled={isCurrent}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                        isCurrent ? 'bg-blue-50 cursor-not-allowed' : 'hover:bg-gray-100'
                      }`}
                    >
                      <span
                        className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white"
                        style={{ backgroundColor: display.color }}
                      >
                        {display.abbr}
                      </span>
                      <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                      {isCurrent && <span className="text-[10px] text-blue-600 font-medium">Current</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mode === 'swap' && (
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">Swap stations with</div>
              <div className="space-y-1">
                {sameShiftAssignments
                .filter(({ employee: otherEmp }) => {
                  // No one swaps with admin; MLT↔MLT, CLS↔CLS only
                  if (employee.role === 'admin' || otherEmp.role === 'admin') return false;
                  return employee.role === otherEmp.role;
                })
                .map(({ assignment: other, employee: otherEmp }) => {
                  const otherStation = other.station_name ? getStationDisplay(other.station_name) : null;
                  return (
                    <button
                      key={other.id}
                      onClick={() => onSwap(other.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2"
                    >
                      {otherStation ? (
                        <span
                          className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white"
                          style={{ backgroundColor: otherStation.color }}
                        >
                          {otherStation.abbr}
                        </span>
                      ) : (
                        <span className="w-7 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-gray-300 text-gray-600">—</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm text-gray-800 truncate">{otherEmp.name}</div>
                          <RolePill role={otherEmp.role} />
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">{other.station_name ?? 'No station'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-between">
          {mode !== 'menu' ? (
            <button
              onClick={() => setMode('menu')}
              className="text-xs text-gray-600 hover:text-gray-800 transition-colors"
            >
              ← Back
            </button>
          ) : <span />}
          <button
            onClick={onClose}
            className="text-xs text-gray-600 hover:text-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
