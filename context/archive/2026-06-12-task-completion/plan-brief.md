# Task Completion — Plan Brief

> Full plan: `context/changes/task-completion/plan.md`

## What & Why

The parent needs to mark individual chore assignments as done from within the schedule page — without waiting for a regeneration cycle. FR-007 requires completion marking from any view; this plan delivers it for TodayView and WeekView (the two existing views), leaving ChildDayView wiring for S-05.

## Starting Point

`schedule_assignments` has no completion column. TodayView and WeekView render chore items as plain read-only text. `use-schedule.ts` exposes only `generate()`. The data layer (Supabase client, RLS, service mapper) is fully in place and additive changes are safe.

## Desired End State

A circle/checkmark ghost-button appears on every chore item in both the Dziś tab and the Ten tydzień tab. Tapping marks it done (strikethrough + dim); tapping again un-marks it. State is persisted immediately and survives page reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Completed display | Strikethrough + opacity-50 (stay in list) | Parent sees done vs. pending at a glance without tasks mysteriously vanishing |
| Undo toggle | Yes — same button flips back to null | Prevents accidental mis-taps from being permanent; trivial to implement |
| Views in scope | TodayView + WeekView now; ChildDayView in S-05 | S-05 not yet implemented; wiring note left for that plan |
| PATCH endpoint | Shared `/api/schedule/[id].ts`, completion-only now | S-04 extends the same file with reassign/delete — no duplication or merge conflict |
| State refresh | Full reload after save | Consistent with S-04 pattern; no rollback logic needed |
| Toggle control | Ghost button with `Circle`/`CheckCircle` from lucide-react | Zero new shadcn dependency; accessible; fits existing button pattern |
| Column type | `completed_at timestamptz null` | Records when the action happened (not just whether) — useful for future history |

## Scope

**In scope:**
- `completed_at` column migration + types + service mapper
- `toggleCompletion` service function
- `PATCH /api/schedule/[id]` endpoint (completion-only; S-04 extends later)
- `toggleCompletion` hook mutation + `reloadSchedule()` extraction in `use-schedule.ts`
- TodayView and WeekView icon-button toggle with strikethrough/dim visual

**Out of scope:**
- ChildDayView toggle (S-05 not implemented yet)
- Optimistic update (full reload chosen)
- Progress indicator ("N of M done")
- Completion history or audit log

## Architecture / Approach

Three-phase additive build. Schema lands first (column, types, mapper) so the field flows end-to-end before any UI is wired. API & Service phase adds the toggle endpoint and hook mutation. UI phase adds the optional `onToggleComplete` prop to TodayView and WeekView (backwards-compatible — existing callers pass nothing and behavior is unchanged).

The PATCH endpoint at `[id].ts` is intentionally minimal — only `completed_at` now. S-04 extends the same file with reassign/delete body fields. Both plans are additive at the route-handler level.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Schema | `completed_at` column + types + mapper | None — purely additive migration with `null` default |
| 2. API & Service | PATCH endpoint + service function + hook mutation | `use-schedule.ts` may conflict if S-04 lands first — plan notes the conditional |
| 3. UI | Icon-button toggle in TodayView + WeekView | None significant — optional prop, backwards-compatible |

**Prerequisites:** S-03 merged (schedule_assignments table and views exist)  
**Parallel with:** S-04 (schedule-manual-adjust), S-05 (child-daily-view) — note Phase 2 has a conditional on `use-schedule.ts` if S-04 lands first  
**Estimated effort:** ~1 session, 3 phases

## Open Risks & Assumptions

- If S-04 implements Phase 3 (UI) before this plan's Phase 2 lands, `reloadSchedule()` will already be extracted in `use-schedule.ts` — skip re-extraction, only add `toggleCompletion`.
- `completed_at` is reset when the week is regenerated (delete + insert replaces all rows). This is the expected behaviour — a new schedule starts fresh.
- `new Date().toISOString()` is intentional for the completion timestamp (it's an event timestamp, not a calendar date — the `Intl.DateTimeFormat` lessons.md rule does not apply here).

## Success Criteria (Summary)

- Parent can tap a chore in TodayView or WeekView and see it visually marked done
- Tapping again un-marks it
- State survives a full page reload
