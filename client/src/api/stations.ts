import type { Station } from '../types';

const BASE = '/api/stations';

export async function fetchStations(): Promise<Station[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch stations');
  return res.json();
}

export async function createStation(name: string): Promise<Station> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create station');
  return res.json();
}

export async function updateStation(id: number, data: { name: string; min_staff?: number; max_staff?: number; min_staff_am?: number; min_staff_pm?: number; min_staff_night?: number; require_cls?: number; color?: string; abbr?: string }): Promise<Station> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update station');
  return res.json();
}

export async function deleteStation(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete station');
}

export async function saveEmployeeStations(employeeId: number, stationIds: number[]): Promise<Station[]> {
  const res = await fetch(`${BASE}/employee/${employeeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stationIds),
  });
  if (!res.ok) throw new Error('Failed to save employee stations');
  return res.json();
}
