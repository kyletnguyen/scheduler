import { useState } from 'react';
import { useEmployees } from '../../hooks/useEmployees';
import { useShifts, useCreateAssignment } from '../../hooks/useSchedule';
import { useStations } from '../../hooks/useStations';
import type { Shift, Employee } from '../../types';
import toast from 'react-hot-toast';

interface Props {
  date: string;
  shift: Shift;
  month: string;
  preselectedEmployee?: Employee;
  onClose: () => void;
}

export default function AssignmentModal({ date, shift: initialShift, month, preselectedEmployee, onClose }: Props) {
  const { data: employees = [] } = useEmployees();
  const { data: shifts = [] } = useShifts();
  const { data: stations = [] } = useStations();
  const createAssignment = useCreateAssignment(month);
  const [selectedEmployee, setSelectedEmployee] = useState<number | ''>(preselectedEmployee?.id ?? '');
  const [selectedShift, setSelectedShift] = useState<number>(initialShift.id);
  const [selectedStation, setSelectedStation] = useState<number | ''>('');

  // Get stations the selected employee is qualified for
  const selectedEmp = employees.find(e => e.id === selectedEmployee);
  const qualifiedStations = selectedEmp?.stations ?? [];

  const [weekendWarning, setWeekendWarning] = useState(false);

  const submitAssignment = (force = false) => {
    if (!selectedEmployee) return;

    createAssignment.mutate(
      {
        employee_id: Number(selectedEmployee),
        shift_id: selectedShift,
        date,
        station_id: selectedStation ? Number(selectedStation) : null,
        force,
      },
      {
        onSuccess: () => {
          toast.success('Assignment added');
          onClose();
        },
        onError: (err) => {
          if (err.message.includes('consecutive weekend') && !force) {
            setWeekendWarning(true);
          } else {
            toast.error(err.message);
          }
        },
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWeekendWarning(false);
    submitAssignment(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Assign Shift</h3>
        <p className="text-sm text-gray-500 mb-4">{date}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
            <select
              value={selectedEmployee}
              onChange={(e) => {
                const empId = e.target.value ? Number(e.target.value) : '';
                setSelectedEmployee(empId);
                setSelectedStation('');
              }}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employment_type} / {emp.default_shift})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shift</label>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(Number(e.target.value))}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time}–{s.end_time})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Station</label>
            <select
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value ? Number(e.target.value) : '')}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No station</option>
              {(qualifiedStations.length > 0 ? qualifiedStations : stations).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {weekendWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-sm text-amber-800 font-medium">This would assign back-to-back weekends.</p>
              <p className="text-xs text-amber-600 mt-1">The employee already works an adjacent weekend. Force assign anyway?</p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => submitAssignment(true)}
                  disabled={createAssignment.isPending}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {createAssignment.isPending ? 'Assigning...' : 'Force Assign'}
                </button>
                <button type="button" onClick={() => setWeekendWarning(false)} className="px-3 py-1.5 bg-gray-200 rounded text-xs hover:bg-gray-300">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm hover:bg-gray-300">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedEmployee || createAssignment.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {createAssignment.isPending ? 'Adding...' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
