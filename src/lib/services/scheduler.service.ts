import type { SupabaseClient } from "@supabase/supabase-js";
import type { Child, Chore, ScheduleAssignment, ScheduleAssignmentView, ScheduleWarning } from "@/types";
import { listChildren } from "@/lib/services/children.service";
import { listChores } from "@/lib/services/chores.service";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const AGE_ORDER: Record<"small" | "medium" | "large", number> = { small: 0, medium: 1, large: 2 };

export function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday, 1=Monday, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function generateSchedule(
  children: Child[],
  chores: Chore[],
  weekStartDate: Date,
): {
  assignments: Omit<ScheduleAssignment, "id" | "user_id" | "created_at" | "updated_at">[];
  warnings: ScheduleWarning[];
} {
  const weekStartStr = toISODate(weekStartDate);

  const remainingTime: Record<string, Record<DayKey, number>> = {};
  const assignmentCount: Record<string, number> = {};
  const lastAssignedDayIndex: Record<string, number> = {};

  for (const child of children) {
    remainingTime[child.id] = {
      mon: child.available_time.mon,
      tue: child.available_time.tue,
      wed: child.available_time.wed,
      thu: child.available_time.thu,
      fri: child.available_time.fri,
      sat: child.available_time.sat,
      sun: child.available_time.sun,
    };
    assignmentCount[child.id] = 0;
    lastAssignedDayIndex[child.id] = -1;
  }

  const sortedChores = [...chores].sort((a, b) => b.min_weekly_frequency - a.min_weekly_frequency);

  const assignments: Omit<ScheduleAssignment, "id" | "user_id" | "created_at" | "updated_at">[] = [];
  const warnings: ScheduleWarning[] = [];

  for (const chore of sortedChores) {
    let slotsPlaced = 0;
    const needed = chore.min_weekly_frequency;

    for (let dayIndex = 0; dayIndex < 7 && slotsPlaced < needed; dayIndex++) {
      const dayKey = DAY_KEYS[dayIndex];

      const eligible = children.filter(
        (c) =>
          AGE_ORDER[c.age_category] >= AGE_ORDER[chore.age_category] &&
          remainingTime[c.id][dayKey] >= chore.min_time_to_complete,
      );

      if (eligible.length === 0) continue;

      const preferred = eligible.filter((c) => lastAssignedDayIndex[c.id] !== dayIndex - 1);
      const pool = preferred.length > 0 ? preferred : eligible;

      pool.sort((a, b) => assignmentCount[a.id] - assignmentCount[b.id]);
      const selected = pool[0];

      remainingTime[selected.id][dayKey] -= chore.min_time_to_complete;
      assignmentCount[selected.id] += 1;
      lastAssignedDayIndex[selected.id] = dayIndex;

      assignments.push({
        week_start_date: weekStartStr,
        assignment_date: toISODate(addDays(weekStartDate, dayIndex)),
        child_id: selected.id,
        chore_id: chore.id,
      });

      slotsPlaced++;
    }

    if (slotsPlaced < needed) {
      warnings.push({ chore_id: chore.id, chore_name: chore.name, placed: slotsPlaced, needed });
    }
  }

  return { assignments, warnings };
}

interface SupabaseScheduleRow {
  id: string;
  user_id: string;
  week_start_date: string;
  assignment_date: string;
  child_id: string;
  chore_id: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  children: { name: string };
  chores: { name: string; min_time_to_complete: number };
}

function toView(row: SupabaseScheduleRow): ScheduleAssignmentView {
  return {
    id: row.id,
    user_id: row.user_id,
    week_start_date: row.week_start_date,
    assignment_date: row.assignment_date,
    child_id: row.child_id,
    chore_id: row.chore_id,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    child_name: row.children.name,
    chore_name: row.chores.name,
    chore_time: row.chores.min_time_to_complete,
  };
}

export async function getScheduleForWeek(
  supabase: SupabaseClient,
  weekStartDate: Date,
): Promise<ScheduleAssignmentView[]> {
  const weekStartStr = toISODate(weekStartDate);

  const { data, error } = await supabase
    .from("schedule_assignments")
    .select("*, children(name), chores(name, min_time_to_complete)")
    .eq("week_start_date", weekStartStr)
    .order("assignment_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch schedule: ${error.message}`);
  }

  return (data as SupabaseScheduleRow[]).map(toView);
}

export async function generateAndPersistSchedule(
  supabase: SupabaseClient,
  userId: string,
  weekStartDate: Date,
): Promise<{ assignments: ScheduleAssignmentView[]; warnings: ScheduleWarning[] }> {
  const weekStartStr = toISODate(weekStartDate);

  const [children, chores] = await Promise.all([listChildren(supabase), listChores(supabase)]);

  const { assignments: rawAssignments, warnings } = generateSchedule(children, chores, weekStartDate);

  const { error: deleteError } = await supabase
    .from("schedule_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("week_start_date", weekStartStr);

  if (deleteError) {
    throw new Error(`Failed to clear existing schedule: ${deleteError.message}`);
  }

  if (rawAssignments.length > 0) {
    const rows = rawAssignments.map((a) => ({ ...a, user_id: userId }));
    const { error: insertError } = await supabase.from("schedule_assignments").insert(rows);
    if (insertError) {
      throw new Error(`Failed to save schedule: ${insertError.message}`);
    }
  }

  const assignments = await getScheduleForWeek(supabase, weekStartDate);
  return { assignments, warnings };
}
