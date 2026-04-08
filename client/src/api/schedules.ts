import type { ScheduleAssignment } from '../types';

const BASE = '/api/schedule';

export async function fetchSchedule(month: string): Promise<ScheduleAssignment[]> {
  const res = await fetch(`${BASE}?month=${month}`);
  if (!res.ok) throw new Error('Failed to fetch schedule');
  return res.json();
}

export async function createAssignment(data: {
  employee_id: number;
  shift_id: number;
  date: string;
  station_id?: number | null;
  force?: boolean;
}): Promise<ScheduleAssignment> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create assignment');
  }
  return res.json();
}

export async function fetchWarnings(month: string): Promise<{ warnings: string[] }> {
  const res = await fetch(`${BASE}/warnings?month=${month}`);
  if (!res.ok) throw new Error('Failed to fetch warnings');
  return res.json();
}

export async function deleteAssignment(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete assignment');
}

export async function generateSchedule(month: string, clear: boolean): Promise<{ generated: number; inserted: number; skipped: number; warnings: string[] }> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, clear }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to generate schedule');
  }
  return res.json();
}
