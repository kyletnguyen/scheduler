import { useState, useEffect } from 'react';
import type { Employee, DefaultShift } from '../../types';

interface Props {
  employee?: Employee | null;
  onSubmit: (data: { name: string; employment_type: Employee['employment_type']; target_hours_week: number; default_shift: DefaultShift; role: Employee['role'] }) => void;
  onCancel: () => void;
}

const HOUR_DEFAULTS: Record<Employee['employment_type'], number> = {
  'full-time': 40,
  'part-time': 20,
  'per-diem': 0,
};

const SHIFT_OPTIONS: { value: DefaultShift; label: string; desc: string; color: string }[] = [
  { value: 'am', label: 'AM', desc: 'Day shift', color: 'border-amber-300 bg-amber-50 text-amber-800 peer-checked:ring-2 peer-checked:ring-amber-400' },
  { value: 'pm', label: 'PM', desc: 'Evening shift', color: 'border-indigo-300 bg-indigo-50 text-indigo-800 peer-checked:ring-2 peer-checked:ring-indigo-400' },
  { value: 'night', label: 'Night', desc: 'Overnight', color: 'border-gray-400 bg-gray-100 text-gray-800 peer-checked:ring-2 peer-checked:ring-gray-500' },
  { value: 'floater', label: 'Floater', desc: 'Flexible', color: 'border-teal-300 bg-teal-50 text-teal-800 peer-checked:ring-2 peer-checked:ring-teal-400' },
];

const ROLE_OPTIONS: { value: Employee['role']; label: string; desc: string }[] = [
  { value: 'cls', label: 'CLS', desc: 'Clinical Lab Scientist' },
  { value: 'mlt', label: 'MLT', desc: 'Medical Lab Technician' },
  { value: 'admin', label: 'Admin', desc: 'Administrative' },
];

export default function EmployeeForm({ employee, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(employee?.name ?? '');
  const [type, setType] = useState<Employee['employment_type']>(employee?.employment_type ?? 'full-time');
  const [hours, setHours] = useState(employee?.target_hours_week ?? 40);
  const [shift, setShift] = useState<DefaultShift>(employee?.default_shift ?? 'am');
  const [role, setRole] = useState<Employee['role']>(employee?.role ?? 'cls');

  useEffect(() => {
    if (!employee) {
      setHours(HOUR_DEFAULTS[type]);
    }
  }, [type, employee]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), employment_type: type, target_hours_week: hours, default_shift: shift, role });
  };

  const isEdit = !!employee;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Employee' : 'New Employee'}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Full name"
              autoFocus
              required
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
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Employee['employment_type'])}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="full-time">Full-Time</option>
                <option value="part-time">Part-Time</option>
                <option value="per-diem">Per Diem</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Hrs/Week</label>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={0}
                max={80}
                step={0.5}
              />
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
                    shift === s.value
                      ? `${s.color} border-2 shadow-sm`
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-sm font-bold ${shift === s.value ? '' : 'text-gray-600'}`}>{s.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEdit ? 'Save Changes' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
