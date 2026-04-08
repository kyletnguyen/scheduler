import type { Shift } from '../types';

export async function fetchShifts(): Promise<Shift[]> {
  const res = await fetch('/api/shifts');
  if (!res.ok) throw new Error('Failed to fetch shifts');
  return res.json();
}
