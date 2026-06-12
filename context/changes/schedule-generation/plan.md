# Schedule Generation Implementation Plan

## Overview

Implement S-03: generate a 7-day ISO-week chore schedule respecting age-category eligibility,
per-child daily time budgets, minimum chore frequency, and consecutive-day fairness — then display
it on a dedicated `/schedule` page with Today and This Week tabs.

## Current State Analysis

S-01 and S-02 are complete. The codebase has:
- `children` table: `id`, `user_id`, `name`, `age_category` ('small'|'medium'|'large'),
  `available_time` (JSONB, keys `mon`–`sun`, values = minutes per day), soft-delete
- `chores` table: `id`, `user_id`, `name`, `age_category`, `min_weekly_frequency` (1–7),
  `min_time_to_complete` (minutes), soft-delete
- Established patterns: service layer (`src/lib/services/`) → API route (`src/pages/api/`) →
  React island with hook on `/dashboard`
- `PROTECTED_ROUTES = ["/dashboard"]` in middleware — `/schedule` must be added

## Desired End State

A parent visits `/schedule`, clicks "Generate Schedule", and immediately sees:
- **Today tab**: a card per child listing today's assigned chores (name + time)
- **This Week tab**: a grid (Mon–Sun columns × children rows) showing all assignments
- If any chore could not be placed at its minimum frequency, a warning banner lists the affected chores

Any chore that violates age or time constraints is never assigned. The generated schedule persists in
the DB so S-04 (manual adjustment) can later edit individual rows.

### Key Discoveries

- `available_time` JSONB keys: `'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'` (minutes)
- Age category ordering for eligibility: `small < medium < large` (child's category ≥ chore's category)
- Existing services throw `NotFoundError` on PGRST116 — the same error class can be reused
- `PROTECTED_ROUTES` in `src/middleware.ts` must include `"/schedule"`
- Migration naming: `20260612000002_create_schedule_assignments_table.sql` (next in sequence)
- Dashboard pattern: header section + `client:load` React islands stacked on `/dashboard`

## What We're NOT Doing

- No manual reassignment (S-04 — separate slice)
- No child-specific daily view (S-05)
- No task completion marking (S-06); no `completed_at` column in this slice
- No confirmation dialog before overwriting — re-generation silently replaces the current week
- No automated tests for the algorithm (manual verification is sufficient for MVP)
- No rolling 7-day window — schedule always covers the current Mon–Sun ISO week
- No auto-generation on page load — explicit Generate button only

## Implementation Approach

Three-phase vertical slice following the established S-01/S-02 pattern:
1. DB migration establishes the persistence contract
2. Server-side scheduler service + two API routes expose the algorithm
3. React island + Astro page + dashboard link deliver the UI

The scheduling algorithm is a pure TypeScript function that takes `Child[]` + `Chore[]` + `weekStartDate`
and returns `{ assignments, warnings }`. It uses a greedy loop: iterate chores sorted by descending
frequency; for each needed slot scan days 0–6, filter eligible children (age ≥ chore age, remaining
time ≥ chore time), deprioritize those assigned on the previous day, and pick the child with the
fewest total assignments so far this week. All state (remaining time, assignment counts) is local to
the function — no side effects.

## Critical Implementation Details

**Age ordering**: compare categories via `const AGE_ORDER = { small: 0, medium: 1, large: 2 }`;
eligibility is `AGE_ORDER[child.age_category] >= AGE_ORDER[chore.age_category]`.

**Day-key mapping**: `const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun']` — index 0 = Monday.
`assignment_date` for index `i` = `weekStartDate + i days`.

**Week start**: `getWeekStartDate(today)` returns the Monday of the current ISO week using `Date.getDay()`
(0 = Sunday, adjust by `day === 0 ? -6 : 1 - day`).

**Re-generation**: `POST /api/schedule/generate` first deletes all `schedule_assignments` rows where
`week_start_date = currentWeekStart AND user_id = user.id`, then inserts the new batch.

---

## Phase 1: Database Migration

### Overview

Create the `schedule_assignments` table that persists the generated schedule. This table is the
shared contract between the scheduler service (Phase 2) and the UI (Phase 3), and the foundation
S-04 will extend.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260612000002_create_schedule_assignments_table.sql`

**Intent**: Create the `schedule_assignments` table with RLS enforcing per-user isolation, an index
supporting efficient weekly fetches, and a moddatetime trigger on `updated_at`.

**Contract**:
```sql
CREATE TABLE public.schedule_assignments (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,        -- always the Monday of the scheduled week
  assignment_date date NOT NULL,        -- the specific day (Mon–Sun)
  child_id       uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  chore_id       uuid NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now() NOT NULL,
  updated_at     timestamptz DEFAULT now() NOT NULL
);

-- moddatetime trigger (same pattern as children + chores)
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS
ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments"   ON public.schedule_assignments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assignments" ON public.schedule_assignments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assignments" ON public.schedule_assignments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own assignments" ON public.schedule_assignments FOR DELETE USING (auth.uid() = user_id);

-- Index for weekly fetches
CREATE INDEX idx_schedule_assignments_user_week ON public.schedule_assignments(user_id, week_start_date);
```

### Success Criteria

#### Automated Verification

- Migration applies cleanly against a local Supabase instance: `npx supabase db reset`
- Table and RLS policies exist in schema: `npx supabase db diff` shows no drift
- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- In Supabase Studio, confirm `schedule_assignments` table exists with all columns and policies
- Attempt to SELECT as a different user (via Supabase SQL editor with `SET role`) — returns 0 rows

**Implementation Note**: Pause after Phase 1 and confirm manual verification passes before proceeding.

---

## Phase 2: Scheduler Service + API Routes

### Overview

Implement the pure scheduling algorithm and expose it through two API routes. The algorithm is
server-only and reads from the DB — no business logic is in the React layer.

### Changes Required

#### 1. Add shared types

**File**: `src/types.ts`

**Intent**: Add `ScheduleAssignment` entity type and the `GenerateScheduleResult` DTO returned by
the generate endpoint.

**Contract**: Append to existing types:
```typescript
export interface ScheduleAssignment {
  id: string;
  user_id: string;
  week_start_date: string;       // ISO date string "YYYY-MM-DD"
  assignment_date: string;       // ISO date string "YYYY-MM-DD"
  child_id: string;
  chore_id: string;
  created_at: string;
  updated_at: string;
}

// Enriched view returned by GET /api/schedule
export interface ScheduleAssignmentView extends ScheduleAssignment {
  child_name: string;
  chore_name: string;
  chore_time: number;            // min_time_to_complete in minutes
}

export interface ScheduleWarning {
  chore_id: string;
  chore_name: string;
  placed: number;
  needed: number;
}
```

#### 2. Scheduler service

**File**: `src/lib/services/scheduler.service.ts`

**Intent**: Pure algorithm + two Supabase-backed functions: one that generates and persists a
schedule, one that fetches the current week's schedule.

**Contract**: Export the following:

```typescript
// Pure algorithm — no DB access, fully testable
export function generateSchedule(
  children: Child[],
  chores: Chore[],
  weekStartDate: Date
): { assignments: Omit<ScheduleAssignment, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]; warnings: ScheduleWarning[] }

// DB-backed: delete current week, run algorithm, insert results, return enriched view + warnings
export async function generateAndPersistSchedule(
  supabase: SupabaseClient,
  userId: string,
  weekStartDate: Date
): Promise<{ assignments: ScheduleAssignmentView[]; warnings: ScheduleWarning[] }>

// DB-backed: fetch current week's assignments joined with child name + chore name/time
export async function getScheduleForWeek(
  supabase: SupabaseClient,
  weekStartDate: Date
): Promise<ScheduleAssignmentView[]>
```

The pure `generateSchedule` function implements:
1. Build a `remainingTime[childId][dayKey]` matrix from `child.available_time`
2. Build an `assignmentCount[childId]` map, initialised to 0
3. Sort chores descending by `min_weekly_frequency`
4. For each chore, iterate day indices 0–6 until `slotsPlaced === min_weekly_frequency`:
   - Filter eligible children: `AGE_ORDER[child.age_category] >= AGE_ORDER[chore.age_category]` AND `remainingTime[child.id][DAY_KEYS[dayIndex]] >= chore.min_time_to_complete`
   - Deprioritise children whose last assignment was on `dayIndex - 1`
   - Pick child with lowest `assignmentCount` from the preferred pool (fall back to all eligible if preferred pool is empty)
   - Deduct `min_time_to_complete` from `remainingTime`; increment `assignmentCount`
   - Push assignment row
5. If `slotsPlaced < min_weekly_frequency`, push to `warnings`

#### 3. Middleware — add /schedule to protected routes

**File**: `src/middleware.ts`

**Intent**: Protect `/schedule` so unauthenticated requests redirect to sign-in.

**Contract**: Change `PROTECTED_ROUTES` from `["/dashboard"]` to `["/dashboard", "/schedule"]`.

#### 4. Generate API route

**File**: `src/pages/api/schedule/generate.ts`

**Intent**: Accept a `POST` with no body, determine the current ISO week start, call
`generateAndPersistSchedule`, and return `{ assignments, warnings }` as JSON.

**Contract**: Auth check → `getWeekStartDate(new Date())` → `generateAndPersistSchedule(...)` → 200 JSON.
On error return 500. No request body validation needed (no user input).

#### 5. Fetch schedule API route

**File**: `src/pages/api/schedule/index.ts`

**Intent**: `GET` returns the current week's enriched assignments as JSON.

**Contract**: Auth check → `getWeekStartDate(new Date())` → `getScheduleForWeek(...)` → 200 JSON array.
Returns empty array if no schedule exists yet.

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `POST /api/schedule/generate` with a valid session returns 200 with an `assignments` array and
  a `warnings` array (empty if all chores were placed)
- Assignments in DB cover Mon–Sun of the current week with correct `week_start_date`
- No child is assigned a chore below their age category (inspect returned assignments)
- No child's total assigned minutes on any day exceed their `available_time` for that day
- `GET /api/schedule` returns the same assignments enriched with `child_name`, `chore_name`, `chore_time`
- Re-running `POST /api/schedule/generate` replaces existing rows (row count stays the same, `created_at` is updated)
- When a chore has no eligible children (e.g., all children are 'small' but chore requires 'large'),
  it appears in `warnings`

**Implementation Note**: Pause after Phase 2 and confirm all manual verification passes before proceeding.

---

## Phase 3: Schedule Page + Dashboard Navigation

### Overview

Build the `/schedule` Astro page and the `ScheduleView` React island. The island handles generate,
loading states, the two-tab view, and the warning banner. Update dashboard to link to the new page.

### Changes Required

#### 1. Schedule Astro page

**File**: `src/pages/schedule.astro`

**Intent**: Server-rendered page (no `prerender` export) that mounts the `ScheduleView` React island.
Same layout/styling pattern as `dashboard.astro` (`Layout` wrapper, `bg-cosmic` background).

**Contract**: Import and render `<ScheduleView client:load />`. Page header shows "Harmonogram" (or
"Schedule") and the user email, with a back-link to `/dashboard`.

#### 2. useSchedule hook

**File**: `src/components/hooks/useSchedule.ts`

**Intent**: Manages schedule state — fetches the current week on mount, exposes a `generate()`
function that calls `POST /api/schedule/generate`, and tracks loading + warning state.

**Contract**:
```typescript
export function useSchedule(): {
  assignments: ScheduleAssignmentView[];
  warnings: ScheduleWarning[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  generate: () => Promise<void>;
}
```
On mount: `GET /api/schedule`. On `generate()`: `POST /api/schedule/generate` then update state
from response. Both paths set `isLoading` / `isGenerating` appropriately.

#### 3. ScheduleView component

**File**: `src/components/ScheduleView.tsx`

**Intent**: Top-level React island. Shows either an empty-state with Generate button (no assignments),
or two tabs ("Dziś" / "Ten tydzień") plus a Generate button to regenerate. Renders a warning banner
when `warnings.length > 0`.

**Contract**: Uses `useSchedule()` hook. Tab state is local React state (default: 'today'). Renders
`TodayView` or `WeekView` based on active tab.

#### 4. TodayView component

**File**: `src/components/TodayView.tsx`

**Intent**: Displays today's assignments as a card per child. Each card shows the child's name and
a list of their chores for today (chore name + time in minutes). If a child has no chores today,
their card shows "Brak zadań na dziś".

**Contract**: Accepts `assignments: ScheduleAssignmentView[]`. Filters to `assignment_date === today`
(compare ISO date strings). Groups by `child_id` (collect unique children from the filtered list).
Renders one `<Card>` per child using the existing shadcn/ui Card component.

#### 5. WeekView component

**File**: `src/components/WeekView.tsx`

**Intent**: Renders a Mon–Sun × children grid. Columns are days (7), rows are children. Each cell
lists chore names assigned to that child on that day.

**Contract**: Accepts `assignments: ScheduleAssignmentView[]`. Derives unique children from
assignments. Renders an HTML `<table>` (or CSS grid) with day headers Mon–Sun and child-name row
headers. Each cell is the list of chores for that child+day intersection. Empty cells show "–".
The table wrapper has `overflow-x-auto` for mobile scrolling.

#### 6. Dashboard navigation link

**File**: `src/pages/dashboard.astro`

**Intent**: Add a "Harmonogram" button/link in the dashboard header that navigates to `/schedule`.

**Contract**: Add an `<a href="/schedule">` styled with the same button classes used by the sign-out
button in the header, placed to the left of the sign-out button.

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Visiting `/schedule` while unauthenticated redirects to `/auth/signin`
- Visiting `/schedule` with no existing schedule shows the empty state with a Generate button
- Clicking Generate creates a schedule; the Today tab appears with child cards showing chores
- The This Week tab shows a day × child grid with chore assignments
- A chore that cannot be scheduled (no eligible children) triggers a visible warning banner naming
  the chore
- Clicking Generate again (with a schedule present) silently replaces the schedule
- Dashboard shows a working "Harmonogram" link that navigates to `/schedule`
- Layout renders correctly on a 375px-wide mobile viewport (weekly grid scrolls horizontally)

**Implementation Note**: Pause after Phase 3 and confirm all manual verification passes before marking
S-03 complete.

---

## Testing Strategy

### Manual Testing Steps

1. Log in as the test user; confirm children and chores are defined (run seed data if needed)
2. Navigate to `/schedule` — confirm empty state with Generate button
3. Click Generate — confirm Today tab appears with child cards
4. Check each child card: chore names shown match chores eligible for that child's age category
5. Switch to This Week tab — confirm grid shows Mon–Sun columns and one row per child
6. Verify no day shows a child assigned more minutes than their `available_time` for that day
7. In Supabase Studio, temporarily set all children to `age_category = 'small'` and add a chore with
   `age_category = 'large'` — regenerate and confirm warning banner appears for that chore
8. Click Generate a second time — confirm the schedule is replaced (timestamps change) with no duplicates
9. Confirm `/schedule` is inaccessible without a session (redirect to sign-in)
10. Confirm dashboard "Harmonogram" link works on both desktop and mobile

## Performance Considerations

The algorithm is O(C × D × N) where C = number of chores, D = 7 days, N = number of children.
For a typical household (≤ 10 chores, ≤ 5 children) this is negligible. Supabase batch insert
(`insert([...rows])`) handles the 10–35 expected rows in a single round-trip.

## Migration Notes

No existing data migration needed — `schedule_assignments` is a new table. Re-generation is
idempotent (delete-then-insert), so no stale rows accumulate.

## References

- PRD Business Logic: `context/foundation/prd.md` §Business Logic
- Roadmap S-03: `context/foundation/roadmap.md`
- Children service pattern: `src/lib/services/children.service.ts`
- Chores service pattern: `src/lib/services/chores.service.ts`
- Dashboard pattern: `src/pages/dashboard.astro`
- Existing migration examples: `supabase/migrations/20260612000001_create_chores_table.sql`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database Migration

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — b60a896
- [x] 1.2 TypeScript build passes: `npm run build` — b60a896
- [x] 1.3 Lint passes: `npm run lint` — b60a896

#### Manual

- [x] 1.4 Confirm `schedule_assignments` table + all RLS policies exist in Supabase Studio — b60a896
- [x] 1.5 Confirm cross-user RLS isolation (SELECT returns 0 rows for another user) — b60a896

### Phase 2: Scheduler Service + API Routes

#### Automated

- [x] 2.1 TypeScript build passes: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`

#### Manual

- [x] 2.3 POST /api/schedule/generate returns 200 with `assignments` + `warnings` arrays
- [x] 2.4 Assignments cover Mon–Sun of current week with correct `week_start_date`
- [x] 2.5 No age-category violations in returned assignments
- [x] 2.6 No child's daily minutes exceed their `available_time` for that day
- [x] 2.7 GET /api/schedule returns enriched assignments (`child_name`, `chore_name`, `chore_time`)
- [x] 2.8 Re-running generate replaces existing rows without duplicates
- [x] 2.9 Unschedulable chore appears in `warnings`

### Phase 3: Schedule Page + Dashboard Navigation

#### Automated

- [ ] 3.1 TypeScript build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Unauthenticated /schedule redirects to sign-in
- [ ] 3.4 Empty state with Generate button shown when no schedule exists
- [ ] 3.5 Generate button creates schedule; Today tab shows child cards
- [ ] 3.6 This Week tab shows day × child grid
- [ ] 3.7 Warning banner appears for unschedulable chores
- [ ] 3.8 Second Generate replaces schedule silently
- [ ] 3.9 Dashboard "Harmonogram" link navigates to /schedule
- [ ] 3.10 Weekly grid scrolls horizontally on 375px mobile viewport
