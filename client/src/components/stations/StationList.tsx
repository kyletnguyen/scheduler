import { useState } from 'react';
import { useStations, useCreateStation, useDeleteStation, useUpdateStation } from '../../hooks/useStations';
import toast from 'react-hot-toast';

export default function StationList() {
  const { data: stations = [], isLoading } = useStations();
  const createMutation = useCreateStation();
  const deleteMutation = useDeleteStation();
  const updateMutation = useUpdateStation();
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    createMutation.mutate(newName.trim(), {
      onSuccess: () => { setNewName(''); toast.success('Station added'); },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Remove station "${name}"?`)) return;
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('Station removed'),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleUpdate = (id: number, name: string, field: string, value: number) => {
    updateMutation.mutate({ id, name, [field]: value }, {
      onError: (err) => toast.error(err.message),
    });
  };

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Stations</h2>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Set staffing range per station. Every station requires at least 1 CLS or Admin. Toggle "Allows MLT" if MLTs can fill remaining slots.
      </p>

      <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="New station name (e.g. Hematology)"
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Add Station
            </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Station Name</th>
              <th className="text-center px-2 py-3 font-medium text-amber-600">
                <div className="leading-tight">
                  <div className="text-[10px]">CLS Needed</div>
                  <div>AM</div>
                </div>
              </th>
              <th className="text-center px-2 py-3 font-medium text-indigo-600">
                <div className="leading-tight">
                  <div className="text-[10px]">CLS Needed</div>
                  <div>PM</div>
                </div>
              </th>
              <th className="text-center px-2 py-3 font-medium text-gray-600">
                <div className="leading-tight">
                  <div className="text-[10px]">CLS Needed</div>
                  <div>Night</div>
                </div>
              </th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Allows MLT</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stations.filter(s => s.name !== 'Admin').map((station) => (
              <tr key={station.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <span className="font-medium text-gray-900">{station.name}</span>
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center justify-center">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={station.min_staff_am}
                      onChange={(e) => handleUpdate(station.id, station.name, 'min_staff_am', Number(e.target.value))}
                      className="w-14 border border-amber-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center justify-center">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={station.min_staff_pm}
                      onChange={(e) => handleUpdate(station.id, station.name, 'min_staff_pm', Number(e.target.value))}
                      className="w-14 border border-indigo-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center justify-center">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={station.min_staff_night}
                      onChange={(e) => handleUpdate(station.id, station.name, 'min_staff_night', Number(e.target.value))}
                      className="w-14 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleUpdate(station.id, station.name, 'require_cls', station.require_cls ? 0 : 1)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      station.require_cls
                        ? 'bg-cyan-100 text-cyan-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {station.require_cls ? 'Yes — MLTs allowed' : 'No — CLS only'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(station.id, station.name)}
                    className="text-red-600 hover:text-red-800 text-xs"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {stations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No stations yet. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
