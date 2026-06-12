# Schedule Manual Adjust — Plan Brief

> Full plan: `context/changes/schedule-manual-adjust/plan.md`

## What & Why

After the auto-generator runs, the parent needs to correct individual assignments without regenerating the whole week — moving a chore to a different day, swapping which child does it, removing one, or adding one the generator couldn't place. This is FR-010 from the PRD: the schedule is a tool, not a dictator.

## Starting Point

The `schedule_assignments` table exists with full RLS (including UPDATE). There are no individual-row endpoints yet — only bulk GET and POST `/generate`. The WeekView renders static text cells; `use-schedule` exposes only `generate()`. The `Dialog` and `Select` shadcn/ui components are already installed.

## Desired End State

The parent can click any chore in the WeekView grid to open a dialog and reassign the child or move the day, click an empty cell to add a new assignment, or delete one from the dialog. Saves are always accepted; a warning banner inside the dialog appears if an age or time-budget constraint was broken. Manually placed/edited rows show a `*` suffix in the grid.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Adjustment scope | Both child + date | FR-010 says "reassign or reschedule" — one dialog covers both |
| Delete individual | Yes | Avoids forcing a full regeneration to remove an over-scheduled assignment |
| Add new manually | Yes, via empty cell click | Naturally fixes the "unschedulable chore" warning case |
| Constraint validation | Soft warn — save + return warnings | Parent is trusted; FR-010 is a correction tool, not an enforcer |
| UX surface | WeekView only | WeekView has full week context; TodayView is read-oriented |
| Visual distinction | `*` marker for `source='manual'` | Parent sees at a glance what the generator placed vs what they changed |
| State after save | Full reload (GET /api/schedule) | No rollback logic needed; acceptable latency for low-frequency mutations |

## Scope

**In scope:**
- PATCH + DELETE on `/api/schedule/[id]` (adjust/remove existing)
- POST on `/api/schedule` (add manual assignment)
- `AssignmentDialog` component (edit + create modes)
- WeekView interactive cells (clickable chores + empty-cell add)
- `source` column migration (`'generated' | 'manual'`)
- Soft constraint warnings (age violation, time exceeded) returned from API

**Out of scope:**
- TodayView interactivity
- Drag-and-drop
- Undo / change history
- Hard constraint enforcement
- Adjusting assignments from weeks other than the currently displayed one

## Architecture / Approach

Data-first in three phases. The `source` column lands first so the UI can rely on it from the start. The service layer adds three new functions (`updateAssignment`, `deleteAssignment`, `createManualAssignment`) each performing a single Supabase call followed by a soft-validation pass that returns warnings without blocking. API routes follow the exact auth + error pattern of existing schedule routes. UI wires everything through `ScheduleView` (which gains `useChildren` + `useChores` for dialog dropdowns) → `WeekView` (gains click callbacks) → `AssignmentDialog` (new, self-contained).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Schema | `source` column in DB + TS types + `toView()` update | None — additive migration with DEFAULT |
| 2. API & Service | PATCH/DELETE/POST endpoints; soft-warn validation | Time-budget check requires loading sibling assignments — 2 extra queries per save |
| 3. UI | Interactive WeekView + AssignmentDialog + hook mutations | Dialog UX polish (day picker labels, warning placement) |

**Prerequisites:** S-03 merged (schedule_assignments table exists)
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- The parent views only one week at a time — `week_start_date` for manual creates is derived from `assignments[0]`. Breaks only if the schedule page ever shows multiple weeks simultaneously (not planned).
- Soft warnings require the service to do 2 extra SELECT calls per save (child + siblings). At household scale (≤10 assignments/day) this is negligible.
