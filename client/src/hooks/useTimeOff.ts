import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTimeOff, createTimeOff, deleteTimeOff, clearTimeOff } from '../api/timeOff';

export function useTimeOff(params?: { employee_id?: number; month?: string }) {
  return useQuery({
    queryKey: ['timeOff', params],
    queryFn: () => fetchTimeOff(params),
  });
}

export function useCreateTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTimeOff,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timeOff'] }),
  });
}

export function useDeleteTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTimeOff,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timeOff'] }),
  });
}

export function useClearTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, month }: { employeeId: number; month: string }) =>
      clearTimeOff(employeeId, month),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timeOff'] }),
  });
}
