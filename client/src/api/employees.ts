import type { Employee, DefaultShift, EmployeeConstraint } from '../types';

const BASE = '/api/employees';

export async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch employees');
  return res.json();
}

export async function createEmployee(data: {
  name: string;
  employment_type: Employee['employment_type'];
  target_hours_week: number;
  default_shift: DefaultShift;
}): Promise<Employee> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create employee');
  return res.json();
}

export async function updateEmployee(id: number, data: {
  name: string;
  employment_type: Employee['employment_type'];
  target_hours_week: number;
  default_shift: DefaultShift;
  role: Employee['role'];
}): Promise<Employee> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update employee');
  return res.json();
}

export async function deleteEmployee(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete employee');
}

export async function saveConstraints(employeeId: number, constraints: { rule_type: string; rule_value: string }[]): Promise<EmployeeConstraint[]> {
  const res = await fetch(`${BASE}/${employeeId}/constraints`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(constraints),
  });
  if (!res.ok) throw new Error('Failed to save constraints');
  return res.json();
}
