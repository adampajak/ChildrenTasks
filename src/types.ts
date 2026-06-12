export interface Child {
  id: string;
  user_id: string;
  name: string;
  age_category: "small" | "medium" | "large";
  available_time: Record<string, number>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Chore {
  id: string;
  user_id: string;
  name: string;
  age_category: "small" | "medium" | "large";
  min_weekly_frequency: number;
  min_time_to_complete: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ScheduleAssignment {
  id: string;
  user_id: string;
  week_start_date: string;
  assignment_date: string;
  child_id: string;
  chore_id: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleAssignmentView extends ScheduleAssignment {
  child_name: string;
  chore_name: string;
  chore_time: number;
}

export interface ScheduleWarning {
  chore_id: string;
  chore_name: string;
  placed: number;
  needed: number;
}
