# Child Daily View — Plan Brief

> Full plan: `context/changes/child-daily-view/plan.md`

## What & Why

The parent needs to hand the phone to a child showing only that child's tasks for today — without the other children's cards cluttering the screen. FR-006 requires a focused single-child view accessible from within the parent's session; no separate child accounts.

## Starting Point

`TodayView` already renders one Card per child with today's chores filtered from the already-loaded week assignments. `ScheduleView` manages tab state via `useState`. All the data needed for a child-focused view is already in memory.

## Desired End State

On the Dziś tab, each child's name is a clickable button. Tapping it replaces the card grid with a full-width view of only that child's today chores, with a "← Wszystkie dzieci" back link where the tab bar was. Returning restores the all-children grid.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Where child view lives | State within ScheduleView | Data is already loaded; no new route needed for a single-family app |
| Content shown | Today's tasks only, full-width | Matches FR-006 exactly — week context is not part of this view |
| Entry point | Tap child name in TodayView card | Natural tap target; discoverable with hover:underline affordance |
| Header when focused | Child name + "← Wszystkie dzieci" back link | Clear context + easy exit; no need to strip navigation |

## Scope

**In scope:**
- `ChildDayView` component (focused single-child today view)
- TodayView card header becomes clickable (optional `onFocusChild` callback prop)
- ScheduleView `focusedChild` state + conditional render

**Out of scope:**
- New route or Astro page
- Week-at-a-glance for the focused child
- Mark-as-done from this view (FR-007 is a separate slice)
- Any WeekView changes

## Architecture / Approach

Pure UI in one phase. `ChildDayView` is a new component that receives `{ child, assignments, onBack }` props and filters/renders today's chores for that child. `TodayView` gains an optional `onFocusChild` callback (backwards-compatible). `ScheduleView` holds `focusedChild` state and swaps TodayView for ChildDayView when a child is selected. No API calls, no schema changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. ChildDayView & Wiring | Clickable child names + focused single-child view | None significant — all data already in state |

**Prerequisites:** S-03 merged (schedule page and TodayView exist)
**Estimated effort:** ~1 session, 1 phase

## Open Risks & Assumptions

- `focusedChild` is reset when switching to the Ten tydzień tab; this is the expected behaviour (returning to Dziś shows all children, not the last focused child).
- Child names are derived from `ScheduleAssignmentView.child_name` — if a child has no assignments this week, they won't appear in TodayView and can't be focused (by design; no schedule = nothing to show).

## Success Criteria (Summary)

- Parent can tap a child's name and see only that child's today chores
- Back link returns to all-children view without full reload
- No regressions in existing schedule page features
