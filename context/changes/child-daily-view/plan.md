# Child Daily View Implementation Plan

## Overview

Add a focused single-child view of today's tasks within the existing `/schedule` page. Tapping a child's name in the TodayView (Dziś tab) switches to a full-width view of that child's chores for today; a "← Wszystkie dzieci" link returns to the all-children view. No new route, no new API call, no schema change — pure UI state on top of already-loaded data.

## Current State Analysis

`TodayView` renders a CSS grid of child Cards, each with today's chores filtered from the full week's assignments. `ScheduleView` manages tab state (`"today" | "week"`) with `useState`. The `useSchedule()` hook delivers all assignments already — the focused-child filter is just `assignments.filter(a => a.child_id === focusedChildId && a.assignment_date === today)`. Child name and id are available directly from `ScheduleAssignmentView.child_name` / `child_id`.

## Desired End State

On the Dziś tab, each child's card header is a clickable button. Tapping a child's name replaces the card grid with a single full-width view showing only that child's today chores, with their name as a heading and a "← Wszystkie dzieci" back button where the tab bar was. The generate/regenerate button remains visible. Tapping "← Wszystkie dzieci" restores the all-children card grid.

### Key Discoveries

- `src/components/TodayView.tsx:13–15` — children are already derived from all assignments as `{ id, name }` objects; the same derivation feeds ChildDayView.
- `src/components/TodayView.tsx:9` — local-date pattern already uses `Intl.DateTimeFormat("en-CA")` (lessons.md rule); ChildDayView must use the same.
- `src/components/ScheduleView.tsx:11` — `activeTab` state lives here; `focusedChild` state slots in at the same level.
- `src/components/ScheduleView.tsx:83` — conditional `TodayView` / `WeekView` render; ChildDayView replaces TodayView when a child is focused.
- `src/components/ui/card.tsx` — `CardHeader` / `CardTitle` available; child name currently renders as plain `CardTitle` text.

## What We're NOT Doing

- No new route or Astro page (`/schedule/child/[id]`).
- No week-at-a-glance for the focused child.
- No separate child login or session.
- No mark-as-done from child view (FR-007 is a separate slice).
- No changes to the WeekView or week tab.

## Implementation Approach

Single phase: add a `ChildDayView` component, make child names clickable in `TodayView` via an `onFocusChild` callback prop, and manage `focusedChild` state in `ScheduleView` to swap TodayView for ChildDayView.

---

## Phase 1: ChildDayView & Wiring

### Overview

Three file changes: new `ChildDayView` component, extended `TodayView` props with click affordance, and `ScheduleView` state update to route between the two.

### Changes Required

#### 1. `ChildDayView` component

**File**: `src/components/ChildDayView.tsx`

**Intent**: Display today's chores for a single child, full-width, with a back button. This is a read-only focused variant of TodayView for one child.

**Contract**:
```typescript
interface Props {
  child: { id: string; name: string };
  assignments: ScheduleAssignmentView[];
  onBack: () => void;
}
```

- Computes `today` with `new Intl.DateTimeFormat("en-CA").format(new Date())` (same pattern as TodayView — lessons.md rule).
- Filters `assignments` by `child.id` and `today`.
- Header: child name as `<h2>` or similar, "← Wszystkie dzieci" `<button onClick={onBack}>` with the same ghost-button look as existing nav links.
- Chore list: same `<ul>` structure as the inner list in TodayView (chore name left, time right).
- Empty state: "Brak zadań na dziś."

#### 2. `TodayView` — clickable child name

**File**: `src/components/TodayView.tsx`

**Intent**: Make each child's name a clickable affordance so the parent can drill into a single child's view.

**Contract**: Extend Props with an optional `onFocusChild?: (child: { id: string; name: string }) => void`. When provided, wrap the `CardTitle` text in a `<button>` styled with `hover:underline cursor-pointer` classes. When absent (no prop), render as plain text (backwards-compatible — no existing callers break).

#### 3. `ScheduleView` — focusedChild state

**File**: `src/components/ScheduleView.tsx`

**Intent**: Track which child (if any) is focused, swap the Today-tab content accordingly, and replace the tab bar with the child name + back link when focused.

**Contract**:
- Add `const [focusedChild, setFocusedChild] = useState<{ id: string; name: string } | null>(null)`.
- Pass `onFocusChild={setFocusedChild}` to `<TodayView>`.
- When `activeTab === "today"` and `focusedChild !== null`: render `<ChildDayView child={focusedChild} assignments={assignments} onBack={() => setFocusedChild(null)} />` instead of `<TodayView>`.
- When focused: replace the tab-bar `<div>` with a back button `← Wszystkie dzieci` (calls `setFocusedChild(null)`) and the child's name as a heading. The Wygeneruj ponownie button stays in its current position.
- Reset `focusedChild` to `null` when `activeTab` changes to `"week"` (so returning to Dziś doesn't reopen the focused view unexpectedly).

### Success Criteria

#### Automated Verification

- TypeScript build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Tapping a child's name in the Dziś tab opens ChildDayView for that child
- ChildDayView shows only that child's today chores, full-width (no other children)
- "← Wszystkie dzieci" returns to the all-children card grid
- Tab bar is hidden when focused; visible when back in all-children view
- Wygeneruj ponownie button is visible in both states
- Switching to Ten tydzień tab and back to Dziś shows all-children view (not focused)
- Empty state ("Brak zadań na dziś") shown when child has no today assignments
- No regressions in Today all-children view, WeekView, generate/regenerate

---

## References

- PRD: `context/foundation/prd.md` — FR-006, Access Control § Child view
- Roadmap: `context/foundation/roadmap.md` — S-05
- Lessons: `context/foundation/lessons.md` — use `Intl.DateTimeFormat("en-CA")` for local date
- Existing pattern: `src/components/TodayView.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: ChildDayView & Wiring

#### Automated

- [x] 1.1 TypeScript build passes: `npm run build`
- [x] 1.2 Lint passes: `npm run lint`

#### Manual

- [x] 1.3 Tapping child name in Dziś tab opens ChildDayView for that child
- [x] 1.4 ChildDayView shows only that child's today chores, full-width
- [x] 1.5 "← Wszystkie dzieci" returns to all-children card grid
- [x] 1.6 Tab bar hidden when focused; visible when in all-children view
- [x] 1.7 Wygeneruj ponownie button visible in both states
- [x] 1.8 Switching to Ten tydzień and back to Dziś resets to all-children view
- [x] 1.9 No regressions in Today view, WeekView, generate/regenerate
