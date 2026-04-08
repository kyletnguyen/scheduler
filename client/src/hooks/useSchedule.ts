import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSchedule, fetchWarnings, createAssignment, deleteAssignment, generateSchedule } from '../api/schedules';
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
