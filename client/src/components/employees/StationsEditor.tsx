import { useState } from 'react';
import { useStations } from '../../hooks/useStations';
import { useSaveEmployeeStations } from '../../hooks/useStations';
import type { Employee } from '../../types';
import toast from 'react-hot-toast';

interface Props {
  employee: Employee;
  onClose: () => void;
}

export default function StationsEditor({ employee, onClose }: Props) {
  const { data: allStations = [] } = useStations();
  const saveMutation = useSaveEmployeeStations();

  // Ordered list of selected station IDs (index = priority, first = preferred)
  const [orderedIds, setOrderedIds] = useState<number[]>(
    employee.stations?.map((s) => s.id) ?? []
  );

  const toggle = (id: number) => {
    if (orderedIds.includes(id)) {
      setOrderedIds(orderedIds.filter((sid) => sid !== id));
    } else {
      setOrderedIds([...orderedIds, id]);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...orderedIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrderedIds(next);
  };

  const moveDown = (index: number) => {
    if (index >= orderedIds.length - 1) return;
    const next = [...orderedIds];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOrderedIds(next);
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
    <td colSpan={5} className="px-0 py-0">
      <div className="bg-green-50 border-t border-b border-green-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-700">Station Qualifications — {employee.name}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
        </div>

        <p className="text-xs text-gray-500 mb-2">
          Click stations to add them. #1 is the preferred station — use arrows to reorder priority.
        </p>

        {/* Available stations to toggle */}
        <div className="flex flex-wrap gap-2 mb-3">
          {allStations.map((station) => {
            const index = orderedIds.indexOf(station.id);
            const isSelected = index >= 0;
            return (
              <button
                key={station.id}
                onClick={() => toggle(station.id)}
                className={`relative px-3 py-1.5 rounded text-xs transition-colors ${
                  isSelected
                    ? 'bg-green-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {isSelected && (
                  <span className="absolute -top-1.5 -left-1.5 bg-green-800 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {index + 1}
                  </span>
                )}
                {station.name}
              </button>
            );
          })}
          {allStations.length === 0 && (
            <span className="text-xs text-gray-400">No stations configured. Add them on the Stations page.</span>
          )}
        </div>

        {/* Priority ordering */}
        {orderedIds.length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Priority Order</span>
            <div className="flex flex-col gap-1">
              {orderedIds.map((id, index) => {
                const station = stationMap.get(id);
                if (!station) return null;
                return (
                  <div key={id} className="flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-200">
                    <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                      index === 0 ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="text-xs text-gray-800 flex-1">
                      {station.name}
                      {index === 0 && <span className="text-[9px] text-green-600 ml-1.5 font-medium">Preferred</span>}
                    </span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs px-1"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveDown(index)}
                        disabled={index === orderedIds.length - 1}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs px-1"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Stations'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 bg-gray-200 rounded text-xs hover:bg-gray-300">
            Cancel
          </button>
        </div>
      </div>
    </td>
  );
}
