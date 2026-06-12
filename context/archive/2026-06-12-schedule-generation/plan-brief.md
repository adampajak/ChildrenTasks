# Schedule Generation — Plan Brief

> Full plan: `context/changes/schedule-generation/plan.md`

## What & Why

Generate a 7-day chore schedule that respects each child's age-category eligibility, daily time
budget, and each chore's minimum weekly frequency — with round-robin fairness to avoid loading the
same child on consecutive days. This is the north-star feature of ChildrensTasks: the core value
proposition the whole product is built around (S-03 in the roadmap).

## Starting Point

S-01 (children CRUD) and S-02 (chores CRUD) are complete. The `children` and `chores` tables exist
in Supabase with all the data the algorithm needs: `age_category`, `available_time` (JSONB,
`mon`–`sun` keys in minutes), `min_weekly_frequency`, and `min_time_to_complete`. The established
service → API route → React island pattern provides the implementation template.

## Desired End State

A parent visits `/schedule`, clicks "Generate Schedule", and immediately sees two tabs: **Dziś**
(Today) showing a card per child with that day's assigned chores, and **Ten tydzień** (This Week)
showing a Mon–Sun × children grid. If any chore could not be placed at its minimum frequency, a
warning banner identifies it. The schedule persists in a new `schedule_assignments` table so S-04
(manual adjustment) can edit individual rows.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Algorithm location | Server-side API route | Keeps business logic server-only; consistent with all existing API patterns | Plan |
| Schedule persistence | `schedule_assignments` DB table | Survives page refresh and gives S-04 a concrete row to edit | Plan |
| Re-generation | Overwrite silently | Simple; no manual adjustments yet (S-04 is a separate slice) | Plan |
| UI placement | New `/schedule` page | Full-page layout suits the schedule grid; clean separation from CRUD panels | Plan |
| Week scope | Current Mon–Sun ISO week | Predictable; aligns with family/school planning rhythm | Plan |
| Unschedulable chore | Partial schedule + warning | Parent gets a useful result and knows exactly what to fix | Plan |
| Day overflow | Skip day, try other days | Greedy approach maximises total placement with minimal complexity | Plan |
| Empty state | Explicit Generate button | No surprises; parent may not have finished defining children/chores | Plan |
| Today view | Cards per child | Mirrors the child-centric mental model; consistent with ChildrenPanel | Plan |
| Weekly view | Day-columns × child-rows grid | Shows fairness at a glance; parent can see who is overloaded | Plan |
| View toggle | Tabs (Today default) | Familiar; matches PRD today-first default | Plan |
| Algorithm testing | Manual only | MVP scope; pure function is easily unit-tested later if needed | Plan |
| Dashboard navigation | Button/link on dashboard | Minimal change; natural flow from setup (children, chores) to action | Plan |

## Scope

**In scope:**
- `schedule_assignments` DB table + RLS + index
- Pure `generateSchedule()` algorithm function in `scheduler.service.ts`
- `POST /api/schedule/generate` + `GET /api/schedule` API routes
- `/schedule` Astro page + `ScheduleView` React island (Today + This Week tabs)
- Warning banner for unschedulable chores
- "Harmonogram" link on `/dashboard`

**Out of scope:**
- Manual reassignment after generation (S-04)
- Child-specific daily view (S-05)
- Mark task as done / `completed_at` (S-06)
- Confirmation dialog before re-generation
- Automated algorithm unit tests

## Architecture / Approach

```
POST /api/schedule/generate
  └─ scheduler.service.ts
       ├─ generateSchedule(children, chores, weekStart)   ← pure function, no DB
       │    greedy loop: sort chores by freq desc, scan days 0–6,
       │    filter eligible children (age + time), pick lowest-count child,
       │    track remainingTime + assignmentCount
       └─ generateAndPersistSchedule(supabase, userId, weekStart)
            delete week rows → run algorithm → batch insert → return enriched view

GET /api/schedule
  └─ scheduler.service.ts: getScheduleForWeek(supabase, weekStart)
       supabase.from('schedule_assignments').select('*, children(name), chores(name, min_time_to_complete)')

/schedule.astro  →  <ScheduleView client:load />
  └─ useSchedule() hook  →  TodayView (cards) | WeekView (grid)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database | `schedule_assignments` table + RLS + index | FK cascade on child/chore delete may orphan existing assignments — acceptable since re-generate is the recovery path |
| 2. Scheduler service + API | Algorithm + generate + fetch endpoints | Algorithm edge cases (no eligible child, day overflow) must be handled without crashing |
| 3. Schedule page + Dashboard nav | Full UI (Today + Week tabs, warnings, generate button) + dashboard link | Weekly grid horizontal scroll on mobile needs `overflow-x-auto` wrapper |

**Prerequisites:** S-01 (children) and S-02 (chores) done (they are).
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- `available_time` JSONB structure is assumed to always have all 7 day keys (mon–sun) with integer
  values; missing keys default to 0 in the algorithm.
- The algorithm doesn't guarantee exactly equal workload across children — only "rough fairness"
  (lowest-count child preferred), which matches the PRD.
- If a child is deleted mid-week, their FK-cascaded assignment rows vanish; re-generation recovers.

## Success Criteria (Summary)

- Parent can generate a schedule and immediately see today's chores per child and the full week grid
- Zero age-category violations and zero daily time-budget overruns in generated assignments
- Any chore that cannot be scheduled (no eligible children) surfaces a visible warning, not a silent miss
