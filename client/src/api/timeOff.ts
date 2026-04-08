import type { TimeOffEntry, OffType } from '../types';

const BASE = '/api/time-off';

export async function fetchTimeOff(params?: {
  employee_id?: number;
  month?: string;
}): Promise<TimeOffEntry[]> {
  const searchParams = new URLSearchParams();
  if (params?.employee_id) searchParams.set('employee_id', String(params.employee_id));
  if (params?.month) searchParams.set('month', params.month);
  const res = await fetch(`${BASE}?${searchParams}`);
  if (!res.ok) throw new Error('Failed to fetch time-off');
  return res.json();
}

export async function createTimeOff(data: {
  employee_id: number;
  dates: string[];
  off_type?: OffType;
  start_time?: string;
  end_time?: string;
  reason?: string;
}): Promise<TimeOffEntry[]> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create time-off');
  return res.json();
}

export async function deleteTimeOff(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete time-off');
}

export async function clearTimeOff(employeeId: number, month: string): Promise<{ deleted: number }> {
  const res = await fetch(`${BASE}/clear/${employeeId}/${month}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to clear time-off');
  return res.json();
}
