import { describe, it, expect } from "vitest";
import { generateSchedule } from "@/lib/services/scheduler.service";
import type { Child, Chore } from "@/types";

const AGE_ORDER: Record<"small" | "medium" | "large", number> = { small: 0, medium: 1, large: 2 };
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

describe("generateSchedule", () => {
  it("assigns only age-eligible children within their daily time budget", () => {
    const children: Child[] = [
      {
        id: "c-small",
        user_id: "u1",
        name: "Small Child",
        age_category: "small",
        available_time: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 },
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
      {
        id: "c-large",
        user_id: "u1",
        name: "Large Child",
        age_category: "large",
        available_time: { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 },
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
    ];
    const chores: Chore[] = [
      {
        id: "ch-small",
        user_id: "u1",
        name: "Small Chore",
        age_category: "small",
        min_time_to_complete: 20,
        min_weekly_frequency: 3,
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
      {
        id: "ch-large",
        user_id: "u1",
        name: "Large Chore",
        age_category: "large",
        min_time_to_complete: 30,
        min_weekly_frequency: 2,
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
    ];
    const weekStart = new Date("2024-07-15");

    const { assignments, warnings } = generateSchedule(children, chores, weekStart);

    expect(warnings).toHaveLength(0);

    const childById: Record<string, Child> = Object.fromEntries(children.map((c) => [c.id, c]));
    const choreById: Record<string, Chore> = Object.fromEntries(chores.map((c) => [c.id, c]));

    // Every assignment must satisfy age eligibility
    for (const a of assignments) {
      const child = childById[a.child_id];
      const chore = choreById[a.chore_id];
      expect(AGE_ORDER[child.age_category]).toBeGreaterThanOrEqual(AGE_ORDER[chore.age_category]);
    }

    // No child may exceed their daily time budget
    const used: Record<string, Record<string, number>> = {};
    for (const a of assignments) {
      const chore = choreById[a.chore_id];
      const dayIndex = Math.round((new Date(a.assignment_date).getTime() - weekStart.getTime()) / 86_400_000);
      const dayKey = DAY_KEYS[dayIndex];
      used[a.child_id] ??= {};
      used[a.child_id][dayKey] = (used[a.child_id][dayKey] ?? 0) + chore.min_time_to_complete;
    }
    for (const [childId, days] of Object.entries(used)) {
      const child = childById[childId];
      for (const [dayKey, minutes] of Object.entries(days)) {
        expect(minutes).toBeLessThanOrEqual(child.available_time[dayKey]);
      }
    }
  });

  it("emits a warning with placed:0 when no child is eligible for a chore", () => {
    const children: Child[] = [
      {
        id: "c-small",
        user_id: "u1",
        name: "Small Child",
        age_category: "small",
        available_time: { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 },
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
    ];
    const chores: Chore[] = [
      {
        id: "ch-large",
        user_id: "u1",
        name: "Large Chore",
        age_category: "large",
        min_time_to_complete: 20,
        min_weekly_frequency: 3,
        created_at: "",
        updated_at: "",
        deleted_at: null,
      },
    ];

    const { assignments, warnings } = generateSchedule(children, chores, new Date("2024-07-15"));

    expect(assignments).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].placed).toBe(0);
    expect(warnings[0].needed).toBe(3);
  });
});
