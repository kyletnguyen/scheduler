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

export default function EmployeeForm({ employee, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(employee?.name ?? '');
  const [type, setType] = useState<Employee['employment_type']>(employee?.employment_type ?? 'full-time');
  const [hours, setHours] = useState(employee?.target_hours_week ?? 40);
  const [shift, setShift] = useState<DefaultShift>(employee?.default_shift ?? 'floater');
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

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-4">
      <h3 className="text-lg font-semibold mb-4">{employee ? 'Edit Employee' : 'Add Employee'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Employee name"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Employee['employment_type'])}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="full-time">Full-Time</option>
            <option value="part-time">Part-Time</option>
            <option value="per-diem">Per Diem</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Employee['role'])}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="cls">CLS</option>
            <option value="mlt">MLT</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Shift</label>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value as DefaultShift)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="am">AM</option>
            <option value="pm">PM</option>
            <option value="night">Night</option>
            <option value="floater">Floater</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Hrs/Week</label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={0}
            max={80}
            step={0.5}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          {employee ? 'Update' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded text-sm hover:bg-gray-300">
          Cancel
        </button>
      </div>
    </form>
  );
}
