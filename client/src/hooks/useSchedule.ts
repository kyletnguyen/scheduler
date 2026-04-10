import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSchedule, fetchWarnings, createAssignment, deleteAssignment, generateSchedule, checkPTOImpact } from '../api/schedules';
import type { PTOImpact } from '../api/schedules';
import { fetchShifts } from '../api/shifts';

export function useShifts() {
  return useQuery({ queryKey: ['shifts'], queryFn: fetchShifts });
}

export function useSchedule(month: string) {
  return useQuery({
    queryKey: ['schedule', month],
    queryFn: () => fetchSchedule(month),
    enabled: !!month,
  });
}

export function useWarnings(month: string) {
  return useQuery({
    queryKey: ['warnings', month],
    queryFn: () => fetchWarnings(month).then(r => r.warnings),
    enabled: !!month,
  });
}

export function useCreateAssignment(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', month] });
      qc.invalidateQueries({ queryKey: ['warnings', month] });
    },
  });
}

export function useDeleteAssignment(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', month] });
      qc.invalidateQueries({ queryKey: ['warnings', month] });
    },
  });
}

export function usePTOImpact(employeeId: number, dates: string[]) {
  return useQuery<PTOImpact>({
    queryKey: ['pto-impact', employeeId, dates],
    queryFn: () => checkPTOImpact(employeeId, dates),
    enabled: dates.length > 0,
    staleTime: 30_000,
  });
}

export function useGenerateSchedule(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clear }: { clear: boolean }) => generateSchedule(month, clear),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', month] });
      qc.invalidateQueries({ queryKey: ['warnings', month] });
    },
  });
}
