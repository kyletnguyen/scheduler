import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStations, createStation, updateStation, deleteStation, saveEmployeeStations } from '../api/stations';

export function useStations() {
  return useQuery({ queryKey: ['stations'], queryFn: fetchStations });
}

export function useCreateStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createStation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stations'] }),
  });
}

export function useUpdateStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; min_staff?: number; max_staff?: number; min_staff_am?: number; min_staff_pm?: number; min_staff_night?: number; require_cls?: number; color?: string; abbr?: string }) => updateStation(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stations'] }),
  });
}

export function useDeleteStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteStation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stations'] }),
  });
}

export function useSaveEmployeeStations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, stationIds }: { employeeId: number; stationIds: number[] }) =>
      saveEmployeeStations(employeeId, stationIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['stations'] });
    },
  });
}
