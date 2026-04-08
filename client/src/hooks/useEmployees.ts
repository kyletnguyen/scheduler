import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchEmployees, createEmployee, updateEmployee, deleteEmployee, saveConstraints } from '../api/employees';
import type { Employee, DefaultShift } from '../types';

export function useEmployees() {
  return useQuery({ queryKey: ['employees'], queryFn: fetchEmployees });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; employment_type: Employee['employment_type']; target_hours_week: number; default_shift: DefaultShift }) =>
      updateEmployee(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useSaveConstraints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, constraints }: { employeeId: number; constraints: { rule_type: string; rule_value: string }[] }) =>
      saveConstraints(employeeId, constraints),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}
