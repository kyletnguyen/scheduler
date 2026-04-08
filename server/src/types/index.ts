export interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: number;
}

export type DefaultShift = 'am' | 'pm' | 'night' | 'floater';

export interface Employee {
  id: number;
  name: string;
  employment_type: 'full-time' | 'part-time' | 'per-diem';
  target_hours_week: number;
  default_shift: DefaultShift;
  role: 'cls' | 'mlt' | 'admin';
  is_active: number;
  created_at: string;
}

export interface EmployeeShiftOverride {
  id: number;
  employee_id: number;
  shift_id: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleAssignment {
  id: number;
  employee_id: number;
  shift_id: number;
  date: string;
  created_at: string;
}

export type RuleType = 'weekend_availability' | 'blocked_day' | 'shift_restriction' | 'max_consecutive_days' | 'custom_block' | 'weekend_swing';

export interface EmployeeConstraint {
  id: number;
  employee_id: number;
  rule_type: RuleType;
  rule_value: string;
  created_at: string;
}

export interface TimeOff {
  id: number;
  employee_id: number;
  date: string;
  off_type: 'full' | 'custom';
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}
