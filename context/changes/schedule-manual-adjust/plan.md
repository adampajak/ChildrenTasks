# Schedule Manual Adjust Implementation Plan

## Overview

Allow the parent to adjust the auto-generated schedule after generation: click any chore in the WeekView grid to reassign its child or move it to a different day, click an empty cell to add a new manual assignment, or delete an existing one. Adjustments are accepted regardless of constraint violations; the API returns soft warnings when age or time-budget rules are broken. Manually placed rows are visually distinguished from auto-generated ones via a `source` column.

## Current State Analysis

`schedule_assignments` has `id`, `user_id`, `week_start_date`, `assignment_date`, `child_id`, `chore_id`, `created_at`, `updated_at`. UPDATE RLS exists with both USING and WITH CHECK on `auth.uid() = user_id`. No PATCH/DELETE individual-row endpoint exists yet — only GET (week) and POST `/generate` (bulk replace). WeekView renders static `<li>` text per cell. `use-schedule` exposes `generate()` only. `useChildren` and `useChores` hooks are already available for populating dialog dropdowns. The `Dialog` and `Select` shadcn/ui components are installed.

## Desired End State

A parent viewing the WeekView (Ten tydzień tab) can click any chore to open a dialog pre-filled with the current child and day, change either or both, and save. They can also delete the assignment from the dialog. Clicking an empty grid cell opens the same dialog in create mode with the day and child pre-filled, requiring only a chore selection. Manually created or edited assignments show a subtle `*` marker in their cell. If saving violates an age-category or time-budget constraint, a warning banner appears inside the dialog after save, but the change is persisted.

### Key Discoveries

- `src/types.ts:24–33` — `ScheduleAssignment` has all needed foreign key fields; adding `source` is a one-column migration.
- `supabase/migrations/20260612000002_…:41–44` — UPDATE RLS already enforces `user_id` on both USING and WITH CHECK; no policy changes needed.
- `src/components/hooks/use-children.ts` and `use-chores.ts` — ready-made hooks for populating child/chore pickers.
- `src/components/ui/dialog.tsx`, `select.tsx` — installed; no additional `shadcn add` needed.
- `src/components/ScheduleView.tsx:83` — WeekView is rendered with `assignments` only; no mutation callbacks wired yet.
- `src/lib/services/scheduler.service.ts` — `toView()` maps Supabase rows to `ScheduleAssignmentView`; needs `source` added after migration.

## What We're NOT Doing

- No drag-and-drop reordering.
- No TodayView interactivity — adjustments are WeekView-only.
- No undo / change history.
- No hard constraint enforcement — the API saves regardless; soft warnings only.
- No adjustment of assignments from previous or future weeks — only the currently displayed week.
- No child-specific time-availability editing from this screen.

## Implementation Approach

Three phases following the data-first pattern established by S-01/S-02/S-03: schema first, then API + service logic, then UI. The UI phase wires the new endpoints into the existing component tree by extending `use-schedule`, adding an `AssignmentDialog` component, and making WeekView cells interactive.

## Critical Implementation Details

- **`source` DEFAULT** — the migration sets `DEFAULT 'generated'` so the existing bulk-insert in `generateAndPersistSchedule` requires no changes; new manual rows must explicitly pass `source: 'manual'`.
- **week_start_date for manual creates** — the dialog receives `weekStartDate` as a prop (derived from `assignments[0].week_start_date`); the API create endpoint requires it in the request body.
- **Day-key mapping from date string** — `assignment_date` is YYYY-MM-DD; convert to the `mon/tue/…/sun` key used in `child.available_time` via `['sun','mon','tue','wed','thu','fri','sat'][new Date(Date.UTC(y,m-1,d)).getUTCDay()]`.
- **Reload vs optimistic** — after any mutation (PATCH/POST/DELETE), `use-schedule` does a full GET `/api/schedule` reload. No rollback logic needed.

---

## Phase 1: Schema — `source` Column

### Overview

Add a `source` text column (`'generated' | 'manual'`) to `schedule_assignments` and update the TypeScript types to match.

### Changes Required

#### 1. Database migration

**File**: `supabase/migrations/20260612000003_add_source_to_schedule_assignments.sql`

**Intent**: Add a `source` column that distinguishes auto-generated rows from manually placed ones. Existing rows get the default `'generated'`.

**Contract**:
```sql
alter table public.schedule_assignments
  add column source text not null default 'generated'
    check (source in ('generated', 'manual'));
```

#### 2. TypeScript types

**File**: `src/types.ts`

**Intent**: Add `source` to `ScheduleAssignment` and add `ScheduleAdjustmentWarning` for the soft-warn response from the adjust/create endpoints.

**Contract**:
- `ScheduleAssignment` gains `source: 'generated' | 'manual'`
- New type:
```typescript
export interface ScheduleAdjustmentWarning {
  type: 'age_violation' | 'time_exceeded';
  message: string;
}
```

#### 3. `toView()` in scheduler service

**File**: `src/lib/services/scheduler.service.ts`

**Intent**: Include `source` in the view mapping so all callers get the new field automatically.

**Contract**: In `toView()`, add `source: row.source` (the SELECT `*` already pulls it after migration).

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset`
- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `source` column visible in Supabase Studio on `schedule_assignments`
- Existing generated rows show `source = 'generated'`

---

## Phase 2: API & Service — Adjust, Delete, Create Manual

### Overview

Add three new service functions and the corresponding HTTP endpoints: PATCH + DELETE on `/api/schedule/[id]` for adjusting and removing existing assignments, and POST on `/api/schedule` for manually creating a new assignment. All mutating calls return constraint warnings (soft).

### Changes Required

#### 1. Service — `updateAssignment`

**File**: `src/lib/services/scheduler.service.ts`

**Intent**: Update `child_id` and/or `assignment_date` on an existing assignment, then compute and return any constraint warnings without blocking the save.

**Contract**: `async function updateAssignment(supabase, id, userId, patch: { child_id?: string; assignment_date?: string }): Promise<{ assignment: ScheduleAssignmentView; warnings: ScheduleAdjustmentWarning[] }>`

Internally:
1. SELECT the current row (to know chore_id and fill any missing patch fields).
2. Compute final `child_id` and `assignment_date` from current row + patch.
3. Execute UPDATE `set child_id, assignment_date, source='manual'` where `id = $id`.
4. Compute warnings: load child's `age_category` + `available_time`, load chore's `age_category` + `min_time_to_complete`, load sibling assignments on the target day (excluding this id), check age + time budget.
5. Return enriched row via `toView()` + warnings array.

#### 2. Service — `deleteAssignment`

**File**: `src/lib/services/scheduler.service.ts`

**Intent**: Delete a single assignment by id, scoped to the authenticated user via RLS.

**Contract**: `async function deleteAssignment(supabase, id): Promise<void>` — DELETE where `id = $id` (RLS enforces user ownership).

#### 3. Service — `createManualAssignment`

**File**: `src/lib/services/scheduler.service.ts`

**Intent**: Insert a single manually placed assignment and return the enriched view with constraint warnings.

**Contract**: `async function createManualAssignment(supabase, userId, data: { child_id: string; chore_id: string; assignment_date: string; week_start_date: string }): Promise<{ assignment: ScheduleAssignmentView; warnings: ScheduleAdjustmentWarning[] }>`

Inserts with `source = 'manual'`, then runs the same age + time-budget check as `updateAssignment`.

#### 4. API route — individual assignment

**File**: `src/pages/api/schedule/[id].ts`

**Intent**: Expose PATCH (adjust) and DELETE (remove) for a single assignment, following the auth and error-handling pattern of existing schedule routes.

**Contract**:
- `export const prerender = false`
- `PATCH`: parse zod body `{ child_id?: string, assignment_date?: string }`, call `updateAssignment`, return `200 { assignment, warnings }`
- `DELETE`: call `deleteAssignment`, return `204`
- Auth guard + supabase null-check identical to `src/pages/api/schedule/index.ts`

#### 5. API route — manual creation (extend existing index)

**File**: `src/pages/api/schedule/index.ts`

**Intent**: Add a POST handler for creating a single manual assignment alongside the existing GET.

**Contract**:
- Add `export const POST: APIRoute`
- Parse zod body `{ child_id: string, chore_id: string, assignment_date: string, week_start_date: string }`
- Call `createManualAssignment`, return `201 { assignment, warnings }`
- Same auth guard pattern

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `PATCH /api/schedule/:id` with valid body returns `200` with updated assignment + empty warnings (no violation)
- `PATCH /api/schedule/:id` assigning to an under-age child returns `200` with a warning in the array
- `DELETE /api/schedule/:id` returns `204` and the row is removed
- `POST /api/schedule` with valid body returns `201` with new assignment + warnings
- All three return `401` when called unauthenticated

---

## Phase 3: UI — Dialog, Interactive WeekView, Hook Mutations

### Overview

Add the `AssignmentDialog` component, make WeekView cells clickable (chore items open edit dialog; empty cells open create dialog), add mutation functions to `use-schedule`, and wire everything through `ScheduleView`.

### Changes Required

#### 1. `AssignmentDialog` component

**File**: `src/components/AssignmentDialog.tsx`

**Intent**: A shadcn Dialog that handles both edit and create modes for a single assignment. The parent controls `open` state and provides `onClose` + `onSaved` callbacks.

**Contract**:
```typescript
interface AssignmentDialogProps {
  mode: 'edit' | 'create';
  assignment?: ScheduleAssignmentView;          // edit mode: pre-populated
  prefill?: { assignment_date: string; child_id: string; week_start_date: string }; // create mode
  children: Child[];
  chores: Chore[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;   // triggers schedule reload
  onDeleted?: () => void; // edit mode only; triggers reload
  updateAssignment: (id: string, patch: { child_id?: string; assignment_date?: string }) => Promise<ScheduleAdjustmentWarning[]>;
  removeAssignment: (id: string) => Promise<void>;
  addManualAssignment: (data: { child_id: string; chore_id: string; assignment_date: string; week_start_date: string }) => Promise<ScheduleAdjustmentWarning[]>;
}
```

Internal state: `childId`, `assignmentDate` (pre-filled from props), `choreId` (create mode only), `isSaving`, `postSaveWarnings`.

The day picker is a `<Select>` showing the 7 days of the current week as "Pon 16.06", "Wt 17.06" etc., derived from `weekStartDate` using the `addDaysToDateStr` pattern from WeekView.

On save: call the appropriate hook function → if warnings returned, show them inside the dialog (yellow banner) and keep the dialog open. Parent's `onSaved()` fires immediately after the API call succeeds regardless of warnings, triggering a schedule reload in the background.

Delete button (edit mode only): calls `removeAssignment` then `onDeleted?.()`.

Polish labels throughout: "Dziecko", "Dzień", "Obowiązek", "Zapisz", "Usuń", "Anuluj".

#### 2. `WeekView` — interactive cells and manual marker

**File**: `src/components/WeekView.tsx`

**Intent**: Turn static chore items into clickable buttons that open the edit dialog, turn empty cells into clickable areas that open the create dialog, and visually mark manually placed chores with a `*` suffix.

**Contract**: Extend the `Props` interface:
```typescript
interface Props {
  assignments: ScheduleAssignmentView[];
  children: Child[];
  chores: Chore[];
  weekStartDate: string;
  onEditAssignment: (assignment: ScheduleAssignmentView) => void;
  onAddAssignment: (prefill: { assignment_date: string; child_id: string }) => void;
}
```

- Chore `<li>` items become `<button>` with `onClick={() => onEditAssignment(a)}` and `hover:underline` styling.
- Manual marker: append ` *` to the chore name text when `a.source === 'manual'`.
- Empty cell `<span>` (currently `–`) becomes a `<button>` with `onClick={() => onAddAssignment({...})}`, showing `+` on hover.

#### 3. `use-schedule` — mutation functions

**File**: `src/components/hooks/use-schedule.ts`

**Intent**: Expose `updateAssignment`, `removeAssignment`, and `addManualAssignment` that call the new endpoints and reload the schedule on success.

**Contract**: Return type gains:
```typescript
updateAssignment: (id: string, patch: { child_id?: string; assignment_date?: string }) => Promise<ScheduleAdjustmentWarning[]>;
removeAssignment: (id: string) => Promise<void>;
addManualAssignment: (data: { child_id: string; chore_id: string; assignment_date: string; week_start_date: string }) => Promise<ScheduleAdjustmentWarning[]>;
isSaving: boolean;
```

Pattern for `updateAssignment`:
1. Set `isSaving = true`
2. `PATCH /api/schedule/:id` with `{ "Content-Type": "application/json" }` body
3. On success: call existing `reload()` helper (or the same GET logic from the initial effect)
4. Return `warnings` from response
5. Set `isSaving = false` in finally

Same pattern for `addManualAssignment` (POST) and `removeAssignment` (DELETE — no body, reload on 204).

Extract the GET reload into a shared `reloadSchedule()` helper so all three mutations call it without duplicating fetch logic.

#### 4. `ScheduleView` — wire up hooks and dialog

**File**: `src/components/ScheduleView.tsx`

**Intent**: Add `useChildren` + `useChores` calls, manage dialog open/mode/prefill state, and pass mutation callbacks + dialog props down to WeekView.

**Contract**: Add:
```typescript
const { children } = useChildren();
const { chores } = useChores();
const { updateAssignment, removeAssignment, addManualAssignment, isSaving } = useSchedule(); // extend existing destructure
const [dialogOpen, setDialogOpen] = useState(false);
const [dialogMode, setDialogMode] = useState<'edit' | 'create'>('edit');
const [editTarget, setEditTarget] = useState<ScheduleAssignmentView | null>(null);
const [createPrefill, setCreatePrefill] = useState<{ assignment_date: string; child_id: string; week_start_date: string } | null>(null);
```

Pass to WeekView: `children`, `chores`, `weekStartDate` (= `assignments[0]?.week_start_date ?? ''`), `onEditAssignment`, `onAddAssignment`.

Render `<AssignmentDialog>` at the bottom of the JSX tree (outside the conditional blocks), with `open={dialogOpen}`, `onClose={() => setDialogOpen(false)}`, `onSaved={() => setDialogOpen(false)}`, `onDeleted={() => setDialogOpen(false)}`.

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Clicking a chore in WeekView (Ten tydzień tab) opens the dialog pre-filled with the correct child and day
- Changing child and saving reloads the schedule showing the reassigned chore
- Changing day and saving reloads the schedule with the chore on the new day
- Deleting an assignment removes it from the grid
- Clicking an empty cell opens the create dialog with day + child pre-filled
- Selecting a chore and saving adds it to the grid with a `*` marker
- Constraint warning (e.g., assign to under-age child) appears in dialog after save; schedule still reloads
- Auto-generated assignments have no marker; manually placed ones show `*`
- No regressions: Today tab, generate/regenerate, dashboard link all still work

---

## References

- PRD: `context/foundation/prd.md` — FR-010, US-01 acceptance criteria
- Roadmap: `context/foundation/roadmap.md` — S-04
- Preceding implementation: `context/archive/2026-06-12-schedule-generation/plan.md`
- Similar API pattern: `src/pages/api/children/[id].ts`
- Similar hook pattern: `src/components/hooks/use-children.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema — source Column

#### Automated

- [ ] 1.1 Migration applies cleanly: `npx supabase db reset`
- [ ] 1.2 TypeScript build passes: `npm run build`
- [ ] 1.3 Lint passes: `npm run lint`

#### Manual

- [ ] 1.4 `source` column visible in Supabase Studio on `schedule_assignments`
- [ ] 1.5 Existing generated rows show `source = 'generated'`

### Phase 2: API & Service — Adjust, Delete, Create Manual

#### Automated

- [ ] 2.1 TypeScript build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 `PATCH /api/schedule/:id` returns 200 with updated assignment + empty warnings (valid change)
- [ ] 2.4 `PATCH /api/schedule/:id` assigning to under-age child returns 200 with age_violation warning
- [ ] 2.5 `DELETE /api/schedule/:id` returns 204 and row is gone
- [ ] 2.6 `POST /api/schedule` returns 201 with new manual assignment
- [ ] 2.7 All three return 401 when called unauthenticated

### Phase 3: UI — Dialog, Interactive WeekView, Hook Mutations

#### Automated

- [ ] 3.1 TypeScript build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Clicking a chore in WeekView opens the edit dialog pre-filled with correct child and day
- [ ] 3.4 Changing child + saving reloads schedule with reassigned chore
- [ ] 3.5 Changing day + saving moves chore to the new day
- [ ] 3.6 Delete button in dialog removes the assignment from the grid
- [ ] 3.7 Clicking empty cell opens create dialog with day + child pre-filled
- [ ] 3.8 Selecting a chore + saving adds it with `*` marker
- [ ] 3.9 Constraint warning appears in dialog after saving an invalid assignment; schedule still reloads
- [ ] 3.10 No regressions in Today tab, generate/regenerate, and dashboard link
