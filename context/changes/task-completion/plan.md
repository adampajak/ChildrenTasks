# Task Completion Implementation Plan

## Overview

Allow the parent to mark individual chore assignments as done from TodayView and WeekView. A toggleable ghost-button with a circle/checkmark icon (lucide-react) appears on each chore item; tapping it sets `completed_at` to the current timestamp; tapping again resets it to null. Completed tasks remain in the list with strikethrough + reduced opacity. Implements FR-007.

## Current State Analysis

`schedule_assignments` has no `completed_at` column. `ScheduleAssignment` / `ScheduleAssignmentView` types have no completion field. `TodayView` and `WeekView` render chore items as plain text with no interaction for completion. `use-schedule.ts` exposes only `generate()`. No `/api/schedule/[id].ts` file exists yet.

## Desired End State

A ghost-button with `Circle` (pending) / `CheckCircle` (done) icon appears on every chore item in TodayView and WeekView. Tapping it sends `PATCH /api/schedule/:id` with `{ completed_at: <iso string> | null }`, then reloads the full schedule. Completed items show `line-through opacity-50` inline. The PATCH endpoint lives at `src/pages/api/schedule/[id].ts` — the same file S-04 will extend with reassign and delete operations.

### Key Discoveries

- `src/types.ts` — `ScheduleAssignmentView extends ScheduleAssignment`; adding `completed_at` to `ScheduleAssignment` propagates automatically.
- `src/lib/services/scheduler.service.ts:~106` — internal `SupabaseScheduleRow` interface also needs `completed_at: string | null`.
- `src/lib/services/scheduler.service.ts:~135–152` — `getScheduleForWeek` maps rows via `toView()`; add `completed_at: row.completed_at ?? null`.
- Existing `users can update own schedule assignments` RLS policy covers all columns — no new policy needed.
- `lucide-react` is already installed — `Circle` and `CheckCircle` icons available.
- `/api/schedule/[id].ts` does not yet exist — this plan creates it; S-04 extends it later with reassign + delete.
- S-04 (`schedule-manual-adjust`) also modifies `use-schedule.ts`; if S-04 lands first, `reloadSchedule()` may already be extracted there — skip that extraction if so.

## What We're NOT Doing

- No ChildDayView toggle — S-05 (`child-daily-view`) is not yet implemented; wiring will be added in that plan.
- No optimistic update — full reload on save, consistent with S-04 pattern.
- No aggregate progress indicator ("N of M done today").
- No completion history or audit log.
- No hard delete of completed assignments.

## Implementation Approach

Three phases: schema first (column + types + mapper), then service + API (toggle function + endpoint + hook mutation), then UI (icon button in both views + ScheduleView wiring). Every change is additive — nothing existing changes behavior, only gains a new optional prop or new field.

---

## Phase 1: Schema

### Overview

Add `completed_at timestamptz null` to `schedule_assignments`, propagate the field to TypeScript types, and update the service row mapper so the field flows through to `ScheduleAssignmentView` objects.

### Changes Required

#### 1. Migration

**File**: `supabase/migrations/20260612000004_add_completed_at_to_schedule_assignments.sql`

**Intent**: Add a nullable timestamp column to record when an assignment was completed. `null` = pending; non-null = done.

**Contract**:
```sql
alter table public.schedule_assignments
  add column completed_at timestamptz null;
```
No new RLS policy required — the existing `users can update own schedule assignments` policy already covers all columns on the row.

#### 2. `ScheduleAssignment` type

**File**: `src/types.ts`

**Intent**: Add `completed_at` to the base assignment interface so it propagates to `ScheduleAssignmentView` automatically.

**Contract**: Add `completed_at: string | null` to the `ScheduleAssignment` interface.

#### 3. Service row mapper

**File**: `src/lib/services/scheduler.service.ts`

**Intent**: Update the internal `SupabaseScheduleRow` interface and the `toView()` mapping so `completed_at` is included in every assignment returned by `getScheduleForWeek`.

**Contract**: Two targeted edits:
- `SupabaseScheduleRow` (~line 106): add `completed_at: string | null`
- The `map()` inside `getScheduleForWeek` (~line 135–152): add `completed_at: row.completed_at ?? null`

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Migration applies cleanly to local Supabase: `npx supabase db reset`

---

## Phase 2: API & Service

### Overview

Add a `toggleCompletion` service function, the `PATCH /api/schedule/[id]` endpoint, and a `toggleCompletion` hook mutation in `use-schedule.ts`. Extract `reloadSchedule()` as a named inner helper (for reuse by S-04 when it extends the same hook).

### Changes Required

#### 1. Service function

**File**: `src/lib/services/scheduler.service.ts`

**Intent**: Add a single-row update function that sets `completed_at` to the given value (ISO string) or null. No constraint validation needed — completion is a pure state toggle.

**Contract**:
```typescript
export async function toggleCompletion(
  supabase: SupabaseClient,
  id: string,
  userId: string,
  completedAt: string | null
): Promise<void>
```
Updates `completed_at` on the row matching `id AND user_id` (the `user_id` filter doubles up on RLS). Throws on Supabase error.

#### 2. API endpoint

**File**: `src/pages/api/schedule/[id].ts`

**Intent**: PATCH handler that authenticates the user, validates the request body, and calls `toggleCompletion`. This file will later be extended by S-04 (`schedule-manual-adjust`) with reassign body fields and a DELETE handler — keep the PATCH handler narrow and field-specific so S-04 can add alongside it.

**Contract**:
- `export const prerender = false`
- `export async function PATCH({ params, request, locals })`
- Auth: `locals.user` — return 401 if absent (same pattern as `src/pages/api/schedule/index.ts`)
- Body validation with zod: `z.object({ completed_at: z.string().nullable() })`
- On success: `200 { id, completed_at }`
- On zod error: `400 { error }`; on DB error: `500 { error }`

#### 3. Hook mutation

**File**: `src/components/hooks/use-schedule.ts`

**Intent**: Extract the existing fetch-and-setState logic into a named `reloadSchedule()` inner function (reusable by S-04), then add `toggleCompletion(id, completedAt)` that calls PATCH and then reloads.

**Contract**: Add to the `useSchedule` return value:
- `reloadSchedule: () => Promise<void>` — extracted from the existing initial-load fetch
- `toggleCompletion: (id: string, completedAt: string | null) => Promise<void>` — calls `PATCH /api/schedule/${id}`, then `reloadSchedule()`

If S-04 landed before this phase and already extracted `reloadSchedule()`, skip extracting it again — only add `toggleCompletion` on top.

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `PATCH /api/schedule/:id` with `{ completed_at: "<iso string>" }` returns 200
- `PATCH /api/schedule/:id` with `{ completed_at: null }` returns 200 (undo)
- Unauthenticated PATCH returns 401

---

## Phase 3: UI

### Overview

Add the ghost-button completion toggle to chore items in TodayView and WeekView, then wire `toggleCompletion` from `useSchedule()` in ScheduleView.

### Changes Required

#### 1. TodayView toggle

**File**: `src/components/TodayView.tsx`

**Intent**: Make each chore item in today-view cards optionally toggleable. When `onToggleComplete` is provided, a circle/checkmark icon button appears to the left of the chore name. When absent, the item renders as before (backwards-compatible — no existing callers break, and S-05's `ChildDayView` can wire this prop when it's ready).

**Contract**:
- Add optional prop: `onToggleComplete?: (id: string, completedAt: string | null) => void`
- Each chore `<li>` becomes a flex row: icon button (when prop present) + chore text
- Icon: import `Circle` and `CheckCircle` from `lucide-react`; render `CheckCircle` when `a.completed_at` is non-null, `Circle` otherwise; `className="h-4 w-4"`
- Button: `variant="ghost"` size, `onClick` calls `onToggleComplete(a.id, a.completed_at ? null : new Date().toISOString())`
- Text span: `className={cn("flex-1", a.completed_at ? "line-through opacity-50" : "")}`

Note: `new Date().toISOString()` is correct here — this is an event timestamp (when the action happened), not a calendar-date string. The `Intl.DateTimeFormat` local-date rule from `lessons.md` applies only to date comparisons, not to event timestamps.

#### 2. WeekView toggle

**File**: `src/components/WeekView.tsx`

**Intent**: Same visual treatment as TodayView inside table cells. When `onToggleComplete` is provided, each chore entry in a cell has the icon button + strikethrough when done.

**Contract**:
- Add optional prop: `onToggleComplete?: (id: string, completedAt: string | null) => void`
- Per chore in a cell: when prop present, wrap in a flex row with icon button + name span
- Completed name: `line-through opacity-50`
- Note: S-04 adds `onEditAssignment` to this same file as a separate optional prop — these are additive (different interaction zones on the same item).

#### 3. ScheduleView wiring

**File**: `src/components/ScheduleView.tsx`

**Intent**: Pull `toggleCompletion` from `useSchedule()` and pass it down to both views.

**Contract**:
- Destructure `toggleCompletion` from `useSchedule()`
- Pass `onToggleComplete={toggleCompletion}` to `<TodayView>` and `<WeekView>`

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Tapping the circle icon on a chore marks it done (strikethrough + dim)
- Tapping the checkmark icon un-marks it (back to normal text)
- Completion state is visible in both TodayView and WeekView for the same assignment
- Switching tabs does not reset completion state
- Full page reload preserves completion state (confirmed from DB)
- No regressions in Today view card layout, WeekView table, generate/regenerate

---

## References

- PRD: `context/foundation/prd.md` — FR-007
- Roadmap: `context/foundation/roadmap.md` — S-06
- Lessons: `context/foundation/lessons.md` — local-date rule (does not apply to event timestamps)
- Auth pattern to follow: `src/pages/api/schedule/index.ts`
- S-04 integration note: `context/changes/schedule-manual-adjust/plan.md` — extends `[id].ts` and `use-schedule.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema

#### Automated

- [x] 1.1 TypeScript build passes: `npm run build` — 238b6e0
- [x] 1.2 Lint passes: `npm run lint` — 238b6e0

#### Manual

- [x] 1.3 Migration applies cleanly: `npx supabase db reset` — 238b6e0

### Phase 2: API & Service

#### Automated

- [x] 2.1 TypeScript build passes: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`

#### Manual

- [x] 2.3 PATCH with `completed_at` timestamp returns 200
- [x] 2.4 PATCH with `null` returns 200 (undo)
- [x] 2.5 Unauthenticated PATCH returns 401

### Phase 3: UI

#### Automated

- [ ] 3.1 TypeScript build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Tapping circle marks task done (strikethrough + dim)
- [ ] 3.4 Tapping checkmark un-marks task
- [ ] 3.5 Completion state visible in both TodayView and WeekView
- [ ] 3.6 Full reload preserves completion state
- [ ] 3.7 No regressions in Today view, WeekView, generate/regenerate
