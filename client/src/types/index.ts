export interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: number;
}

export type DefaultShift = 'am' | 'pm' | 'night' | 'floater';
export type RuleType = 'weekend_availability' | 'weekend_group' | 'weekend_off_pattern' | 'blocked_day' | 'shift_restriction' | 'max_consecutive_days' | 'custom_block' | 'required_shift';

export interface EmployeeConstraint {
  id: number;
  employee_id: number;
  rule_type: RuleType;
  rule_value: string;
  created_at: string;
}

export interface Station {
  id: number;
  name: string;
  min_staff: number;
  max_staff: number;
  min_staff_am: number;
  min_staff_pm: number;
  min_staff_night: number;
  require_cls: number;
  priority?: number;
  is_active?: number;
  color?: string;
  abbr?: string;
}

export interface Employee {
  id: number;
  name: string;
  employment_type: 'full-time' | 'part-time' | 'per-diem';
  target_hours_week: number;
  default_shift: DefaultShift;
  role: 'cls' | 'mlt' | 'admin';
  is_active: number;
  created_at: string;
  constraints: EmployeeConstraint[];
  stations: Station[];
}

export interface ScheduleAssignment {
  id: number;
  employee_id: number;
  shift_id: number;
  date: string;
  employee_name: string;
  employment_type: string;
  shift_name: string;
  start_time?: string;
  end_time?: string;
  station_id?: number | null;
  station_name?: string | null;
}

export type OffType = 'full' | 'custom';

export interface TimeOffEntry {
  id: number;
  employee_id: number;
  date: string;
  off_type: OffType;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  employee_name: string;
}
