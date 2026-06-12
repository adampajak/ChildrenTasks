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
