import React, { useState, useMemo } from 'react';
import { useStations, useSaveEmployeeStations } from '../../hooks/useStations';
import type { Employee } from '../../types';
import { buildStationStyleMap } from '../../utils/stationStyles';
import toast from 'react-hot-toast';

interface Props {
  employee: Employee;
  onClose: () => void;
}

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

  const setWeight = (id: number, value: number) => {
    const next = new Map(weights);
    next.set(id, value);
    setWeights(next);
  };

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

  // Sort selected stations by weight descending for display
  const selectedOrdered = useMemo(() => {
    return [...weights.entries()]
      .map(([id, weight]) => {
        const station = allStations.find(s => s.id === id);
        return station ? { station, weight } : null;
      })
      .filter((x): x is { station: typeof allStations[0]; weight: number } => x !== null)
      .sort((a, b) => a.station.name.localeCompare(b.station.name));
  }, [weights, allStations]);

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
        {selectedOrdered.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {selectedOrdered.map(({ station, weight }) => {
              const style = stationStyleMap[station.name];
              const share = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
              const color = style?.color ?? '#16a34a';
              return (
                <div key={station.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {style && (
                        <span
                          className="w-6 h-4 rounded text-[9px] font-bold flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {style.abbr}
                        </span>
                      )}
                      <span className="text-xs font-medium text-gray-800">{station.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] tabular-nums">
                      <span className="text-gray-500">
                        wt <span className="font-semibold text-gray-800">{weight}</span>
                      </span>
                      <span
                        className="font-semibold px-1.5 py-0.5 rounded text-white min-w-[36px] text-center"
                        style={{ backgroundColor: color }}
                      >
                        {share}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={weight}
                    onChange={(e) => setWeight(station.id, Number(e.target.value))}
                    className="station-slider"
                    style={{
                      '--track-color': color,
                      '--fill-pct': `${weight}%`,
                    } as React.CSSProperties}
                  />
                </div>
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
