import React, { useState } from 'react';
import { format, addMonths } from 'date-fns';
import { useEmployees, useCreateEmployee, useDeleteEmployee } from '../../hooks/useEmployees';
import { useSchedule } from '../../hooks/useSchedule';
import { useTimeOff } from '../../hooks/useTimeOff';
import EmployeeForm from './EmployeeForm';
import EmployeeModal from './EmployeeModal';
import type { Employee, DefaultShift } from '../../types';
import toast from 'react-hot-toast';

const STATION_STYLES: Record<string, { abbr: string; bg: string }> = {
  'Hematology/UA': { abbr: 'HM', bg: 'bg-violet-500' },
  'Chemistry':     { abbr: 'CH', bg: 'bg-amber-500' },
  'Microbiology':  { abbr: 'MC', bg: 'bg-emerald-500' },
  'Blood Bank':    { abbr: 'BB', bg: 'bg-red-500' },
  'Admin':         { abbr: 'AD', bg: 'bg-sky-500' },
};

const typeColors: Record<string, string> = {
  'full-time': 'bg-green-100 text-green-800',
  'part-time': 'bg-yellow-100 text-yellow-800',
  'per-diem': 'bg-purple-100 text-purple-800',
};

const shiftColors: Record<string, string> = {
  am: 'bg-amber-100 text-amber-800',
  pm: 'bg-indigo-100 text-indigo-800',
  night: 'bg-gray-200 text-gray-800',
  floater: 'bg-teal-100 text-teal-800',
};

const roleColors: Record<string, string> = {
  cls: 'bg-blue-100 text-blue-800',
  mlt: 'bg-cyan-100 text-cyan-800',
  admin: 'bg-orange-100 text-orange-800',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function summarizeConstraints(emp: Employee): string[] {
  const tags: string[] = [];
  const c = emp.constraints ?? [];

  const weekend = c.find((r) => r.rule_type === 'weekend_availability');
  if (weekend?.rule_value === 'none') tags.push('No weekends');
  else if (weekend?.rule_value === 'alternating') {
    const group = c.find((r) => r.rule_type === 'weekend_group')?.rule_value;
    tags.push(group === 'A' || group === 'B' ? `Alt weekends (${group})` : 'Alt weekends');
  }
  else if (weekend?.rule_value === 'once_a_month') tags.push('1x/mo weekends');

  const blocked = c.filter((r) => r.rule_type === 'blocked_day');
  if (blocked.length > 0) tags.push(`Off ${blocked.map((b) => DAY_NAMES[Number(b.rule_value)]).join(', ')}`);

  const reqShifts = c.filter((r) => r.rule_type === 'required_shift');
  if (reqShifts.length > 0) tags.push(`${reqShifts.length} required shift(s)`);

  const blocks = c.filter((r) => r.rule_type === 'custom_block');
  if (blocks.length > 0) tags.push(`${blocks.length} date block(s)`);

  return tags;
}

export default function EmployeeList() {
  const { data: employees, isLoading } = useEmployees();
  const createMutation = useCreateEmployee();
  const deleteMutation = useDeleteEmployee();

  const thisMonth = format(new Date(), 'yyyy-MM');
  const nextMonth = format(addMonths(new Date(), 1), 'yyyy-MM');
  const { data: timeOffThisMonth } = useTimeOff({ month: thisMonth });
  const { data: timeOffNextMonth } = useTimeOff({ month: nextMonth });

  const [showAddForm, setShowAddForm] = useState(false);
  const [modalEmployee, setModalEmployee] = useState<Employee | null>(null);
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);

  const scheduleMonth = format(new Date(), 'yyyy-MM');
  const { data: scheduleData = [] } = useSchedule(scheduleMonth);
  const [search, setSearch] = useState('');
  const [filterShift, setFilterShift] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterPTO, setFilterPTO] = useState(false);

  const allTimeOff = [...(timeOffThisMonth ?? []), ...(timeOffNextMonth ?? [])];
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const timeOffByEmployee = new Map<number, string[]>();
  for (const t of allTimeOff) {
    if (t.date < todayStr) continue;
    if (!timeOffByEmployee.has(t.employee_id)) timeOffByEmployee.set(t.employee_id, []);
    timeOffByEmployee.get(t.employee_id)!.push(t.date);
  }

  const handleCreate = (data: { name: string; employment_type: Employee['employment_type']; target_hours_week: number; default_shift: DefaultShift; role: Employee['role'] }) => {
    createMutation.mutate(data, {
      onSuccess: () => { setShowAddForm(false); toast.success('Employee added'); },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDelete = (e: React.MouseEvent, emp: Employee) => {
    e.stopPropagation();
    if (!confirm(`Remove ${emp.name}?`)) return;
    deleteMutation.mutate(emp.id, {
      onSuccess: () => toast.success('Employee removed'),
      onError: (err) => toast.error(err.message),
    });
  };

  // Filter employees
  const filteredEmployees = (employees ?? []).filter(emp => {
    if (search && !emp.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterShift && emp.default_shift !== filterShift) return false;
    if (filterRole && emp.role !== filterRole) return false;
    if (filterType && emp.employment_type !== filterType) return false;
    if (filterPTO && !timeOffByEmployee.has(emp.id)) return false;
    return true;
  });

  const hasActiveFilters = search || filterShift || filterRole || filterType || filterPTO;

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Employees</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          + Add Employee
        </button>
      </div>

      {showAddForm && (
        <EmployeeForm
          onSubmit={handleCreate}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Search & Filters */}
      <div className="mb-3 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 font-medium">Filter:</span>

          {/* Shift filter */}
          {(['am', 'pm', 'night', 'floater'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterShift(filterShift === s ? '' : s)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                filterShift === s ? shiftColors[s] + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'am' ? 'AM' : s === 'pm' ? 'PM' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}

          <span className="text-gray-300">|</span>

          {/* Role filter */}
          {(['cls', 'mlt', 'admin'] as const).map(r => (
            <button
              key={r}
              onClick={() => setFilterRole(filterRole === r ? '' : r)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase transition-colors ${
                filterRole === r ? roleColors[r] + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {r}
            </button>
          ))}

          <span className="text-gray-300">|</span>

          {/* Type filter */}
          {(['full-time', 'part-time', 'per-diem'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? '' : t)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                filterType === t ? typeColors[t] + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}

          <span className="text-gray-300">|</span>

          {/* PTO filter */}
          <button
            onClick={() => setFilterPTO(!filterPTO)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              filterPTO ? 'bg-red-100 text-red-700 ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            On PTO
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(''); setFilterShift(''); setFilterRole(''); setFilterType(''); setFilterPTO(false); }}
              className="px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600"
            >
              Clear all
            </button>
          )}

          <span className="ml-auto text-[11px] text-gray-400">
            {filteredEmployees.length}{hasActiveFilters ? ` of ${employees?.length ?? 0}` : ''} employee{filteredEmployees.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type / Shift</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Hrs</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Info</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((emp) => (
            <React.Fragment key={emp.id}>
              <tr
                onClick={() => setModalEmployee(emp)}
                className="border-b last:border-0 hover:bg-blue-50/50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedEmp(expandedEmp === emp.id ? null : emp.id); }}
                    className="hover:text-blue-600 hover:underline transition-colors text-left"
                  >
                    {emp.name}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${typeColors[emp.employment_type]}`}>
                      {emp.employment_type}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${shiftColors[emp.default_shift]}`}>
                      {emp.default_shift === 'am' ? 'AM' : emp.default_shift === 'pm' ? 'PM' : emp.default_shift.charAt(0).toUpperCase() + emp.default_shift.slice(1)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${roleColors[emp.role] ?? 'bg-gray-100 text-gray-800'}`}>
                      {emp.role}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{emp.target_hours_week}h</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {timeOffByEmployee.get(emp.id) && (
                      <div className="flex flex-wrap gap-1">
                        {timeOffByEmployee.get(emp.id)!.slice(0, 3).map((date) => (
                          <span key={date} className="bg-red-100 text-red-700 text-[9px] px-1.5 py-0.5 rounded">
                            {format(new Date(date + 'T00:00:00'), 'MMM d')}
                          </span>
                        ))}
                        {(timeOffByEmployee.get(emp.id)!.length ?? 0) > 3 && (
                          <span className="text-[9px] text-gray-400">+{timeOffByEmployee.get(emp.id)!.length - 3} more</span>
                        )}
                      </div>
                    )}
                    {summarizeConstraints(emp).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {summarizeConstraints(emp).map((tag, i) => (
                          <span key={i} className="bg-blue-50 text-blue-700 text-[9px] px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {emp.stations && emp.stations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {emp.stations.map((s, i) => (
                          <span key={s.id} className={`text-[9px] px-1.5 py-0.5 rounded ${i === 0 ? 'bg-green-200 text-green-800 font-medium' : 'bg-green-50 text-green-700'}`}>
                            <span className="font-bold mr-0.5">{i + 1}.</span>{s.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {!timeOffByEmployee.get(emp.id) && summarizeConstraints(emp).length === 0 && (!emp.stations || emp.stations.length === 0) && (
                      <span className="text-[9px] text-gray-300">Click to configure</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => handleDelete(e, emp)}
                    className="text-red-600 hover:text-red-800 text-xs"
                  >
                    Remove
                  </button>
                </td>
              </tr>
              {expandedEmp === emp.id && (() => {
                const empSchedule = scheduleData.filter(a => a.employee_id === emp.id);
                const stationCounts: Record<string, number> = {};
                const stationDates: Record<string, string[]> = {};
                for (const a of empSchedule) {
                  const s = a.station_name || 'Unassigned';
                  stationCounts[s] = (stationCounts[s] || 0) + 1;
                  if (!stationDates[s]) stationDates[s] = [];
                  stationDates[s].push(a.date);
                }
                const sorted = Object.entries(stationCounts).sort(([,a],[,b]) => b - a);
                return (
                  <tr className="bg-blue-50 border-b">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="text-xs space-y-2">
                        <div className="font-semibold text-gray-700">
                          {format(new Date(scheduleMonth + '-01T00:00:00'), 'MMMM yyyy')} — {empSchedule.length} day{empSchedule.length !== 1 ? 's' : ''} scheduled
                        </div>
                        {sorted.length > 0 ? (
                          <div className="space-y-1.5">
                            {sorted.map(([station, count]) => {
                              const style = STATION_STYLES[station] ?? { abbr: station.substring(0, 2).toUpperCase(), bg: 'bg-gray-400' };
                              const dates = stationDates[station].sort();
                              return (
                                <div key={station} className="flex items-start gap-2">
                                  <span className={`${style.bg} text-white text-[10px] font-bold px-2 py-0.5 rounded shrink-0`}>
                                    {style.abbr}
                                  </span>
                                  <div>
                                    <span className="font-medium text-gray-700">{station}</span>
                                    <span className="text-gray-400 ml-1">({count} day{count !== 1 ? 's' : ''})</span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {dates.map(d => (
                                        <span key={d} className="text-[9px] text-gray-500 bg-white px-1.5 py-0.5 rounded">
                                          {format(new Date(d + 'T00:00:00'), 'M/d')}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-gray-400 italic">No schedule data for this month</div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </React.Fragment>
            ))}
            {filteredEmployees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {hasActiveFilters ? 'No employees match your filters.' : 'No employees yet. Add one to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalEmployee && (
        <EmployeeModal
          employee={modalEmployee}
          onClose={() => setModalEmployee(null)}
        />
      )}
    </div>
  );
}
