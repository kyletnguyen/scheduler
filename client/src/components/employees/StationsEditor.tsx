import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useStations, useSaveEmployeeStations } from '../../hooks/useStations';
import type { Employee } from '../../types';
import { buildStationStyleMap } from '../../utils/stationStyles';
import toast from 'react-hot-toast';

interface Props {
  employee: Employee;
  onClose: () => void;
}

/** Individual slider row — manages its own local value while dragging so the
 *  parent list doesn't re-render on every pixel of movement. */
const StationSlider = React.memo(function StationSlider({
  stationId,
  stationName,
  color,
  abbr,
  weight,
  share,
  onCommit,
}: {
  stationId: number;
  stationName: string;
  color: string;
  abbr: string | undefined;
  weight: number;
  share: number;
  onCommit: (id: number, value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(weight);
  const dragging = useRef(false);

  // Sync from parent when not actively dragging
  const prevWeight = useRef(weight);
  if (weight !== prevWeight.current && !dragging.current) {
    prevWeight.current = weight;
    setLocalValue(weight);
  }

  const localShare = share; // parent-computed share based on committed weights
  const displayWeight = dragging.current ? localValue : weight;
  const displayFill = dragging.current ? localValue : weight;

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {abbr && (
            <span
              className="w-6 h-4 rounded text-[9px] font-bold flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: color }}
            >
              {abbr}
            </span>
          )}
          <span className="text-xs font-medium text-gray-800">{stationName}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] tabular-nums">
          <span className="text-gray-500">
            wt <span className="font-semibold text-gray-800">{displayWeight}</span>
          </span>
          <span
            className="font-semibold px-1.5 py-0.5 rounded text-white min-w-[36px] text-center"
            style={{ backgroundColor: color }}
          >
            {localShare}%
          </span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={displayWeight}
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
            // Keyboard / accessibility change — commit immediately
            onCommit(stationId, v);
          }
        }}
        className="station-slider"
        style={{
          '--track-color': color,
          '--fill-pct': `${displayFill}%`,
        } as React.CSSProperties}
      />
    </div>
  );
});

export default function StationsEditor({ employee, onClose }: Props) {
  const { data: allStations = [] } = useStations();
  const saveMutation = useSaveEmployeeStations();

  const stationStyleMap = useMemo(() => buildStationStyleMap(allStations), [allStations]);

  // Weight per station_id (0-100). Excluded stations are absent from the map.
  const [weights, setWeights] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    for (const s of employee.stations ?? []) {
      m.set(s.id, s.weight ?? 50);
    }
    return m;
  });

  const toggleStation = (id: number) => {
    const next = new Map(weights);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.set(id, 50);
    }
    setWeights(next);
  };

  const commitWeight = useCallback((id: number, value: number) => {
    setWeights(prev => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }, []);

  const totalWeight = useMemo(() => {
    let sum = 0;
    for (const w of weights.values()) sum += w;
    return sum;
  }, [weights]);

  const handleSave = () => {
    const payload = [...weights.entries()].map(([station_id, weight]) => ({ station_id, weight }));
    saveMutation.mutate(
      { employeeId: employee.id, stations: payload },
      {
        onSuccess: () => { toast.success('Stations saved'); onClose(); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  // Stable list of selected stations — sorted alphabetically, only changes
  // when stations are added/removed (not when weights change).
  const selectedStations = useMemo(() => {
    return [...weights.keys()]
      .map(id => allStations.find(s => s.id === id))
      .filter((s): s is typeof allStations[0] => s != null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [weights.size, ...([...weights.keys()].sort()), allStations]);
  // ^ Deps: re-compute when station set changes, not on every weight tweak.
  //   Spreading sorted keys ensures add/remove triggers recalc but value changes don't.

  return (
    <td colSpan={5} className="px-0 py-0">
      <div className="bg-green-50 border-t border-b border-green-200 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700">Station Preferences — {employee.name}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Click a station to add it, then drag the slider to set preference strength (0 = last resort, 100 = strongly preferred).
          The scheduler assigns stations based on these weights — higher weight means more days at that station.
        </p>

        {/* Station toggle pills */}
        <div className="flex flex-wrap gap-2 mb-3">
          {allStations.map((station) => {
            const isSelected = weights.has(station.id);
            const style = stationStyleMap[station.name];
            return (
              <button
                key={station.id}
                onClick={() => toggleStation(station.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all border ${
                  isSelected
                    ? 'text-white border-transparent shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
                style={isSelected && style ? { backgroundColor: style.color } : undefined}
              >
                {isSelected && style ? `${style.abbr} · ` : ''}{station.name}
              </button>
            );
          })}
          {allStations.length === 0 && (
            <span className="text-xs text-gray-400">No stations configured. Add them on the Stations page.</span>
          )}
        </div>

        {/* Sliders for selected stations */}
        {selectedStations.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {selectedStations.map((station) => {
              const style = stationStyleMap[station.name];
              const color = style?.color ?? '#16a34a';
              const weight = weights.get(station.id) ?? 50;
              const share = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
              return (
                <StationSlider
                  key={station.id}
                  stationId={station.id}
                  stationName={station.name}
                  color={color}
                  abbr={style?.abbr}
                  weight={weight}
                  share={share}
                  onCommit={commitWeight}
                />
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Preferences'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 bg-gray-200 rounded text-xs hover:bg-gray-300">
            Cancel
          </button>
        </div>
      </div>
    </td>
  );
}
