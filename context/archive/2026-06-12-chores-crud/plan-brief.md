# Chores CRUD — Plan Brief

> Full plan: `context/changes/chores-crud/plan.md`

## What & Why

Parents need to define a catalog of household chores before the schedule generator (S-03) can assign them. This slice implements full CRUD for chores — the second of two prerequisite vertical slices — so parents can create, edit, and delete chores with name, age category, minimum weekly frequency, and minimum time to complete.

## Starting Point

Auth is working, the dashboard has a functioning ChildrenPanel. There is no `chores` table, no API routes, and no chores UI. The `children-crud` slice (S-01) is fully implemented and archived, providing the exact implementation pattern this slice replicates.

## Desired End State

Parent opens the dashboard, sees a "Chores" card stacked below "Children", and can add/edit/delete chores. Each chore stores four fields. Data is isolated per-user via Supabase RLS. UI uses optimistic updates — changes appear instantly and roll back on API failure.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Dashboard placement | Stacked below ChildrenPanel on `/dashboard` | Mirrors children integration; one page for all setup data before schedule generation | Plan |
| age_category enum | Same values as children (`small`/`medium`/`large`) | Scheduler can compare chore ↔ child age directly without any mapping layer | Plan |
| Deletion strategy | Soft-delete (`deleted_at`) | Consistent with children pattern; future schedule history can reference deleted chores | Plan |
| Frequency bounds | 1–7×/week | At most once per day; aligns naturally with the 7-day schedule | Plan |
| Time bounds | 5–480 min | Lower bound avoids zero-duration chores; upper bound matches child available-time range | Plan |
| NotFoundError | Extract to `src/lib/services/errors.ts` if not already shared | Avoids duplication between children and chores service files | Plan |

## Scope

**In scope:** `chores` table migration + RLS + soft-delete, zod schemas, `Chore` TS type, service layer, GET/POST/PUT/DELETE API routes, `ChoreForm`, `ChoresPanel`, `use-chores` hook, dashboard integration

**Out of scope:** Assigning chores to children, schedule generation, icons/descriptions/colours, pagination, automated unit tests

## Architecture / Approach

Direct replication of the `children-crud` vertical slice. Three independent layers deployed in sequence: database first (migration + types), then backend (service + API routes), then UI (React island + dashboard). Each layer is verifiable before the next starts. Shared `NotFoundError` extracted if needed to avoid duplication.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database & Schema | `chores` table, RLS policies, zod schemas, `Chore` type | Migration timestamp ordering — must be after `20260605000001` |
| 2. Backend | Service layer + API routes (CRUD) | `NotFoundError` shared vs duplicated — resolve before writing service |
| 3. UI & Dashboard | ChoresPanel island + dashboard integration | Dashboard layout: spacing between two stacked cards |

**Prerequisites:** `children-crud` archived (done); local Supabase running (`npx supabase start`); `npm run dev` available  
**Estimated effort:** ~1 session across 3 phases (direct pattern replication)

## Open Risks & Assumptions

- If `NotFoundError` is not yet exported from a shared file, it must be moved in Phase 2 before writing the chores service — a small refactor that touches `children.service.ts`
- The dashboard card spacing (mt-4 vs mt-6) is a minor UX detail; adjust after visual review in Phase 3

## Success Criteria (Summary)

- Parent can create, edit, and delete chores with all four fields via the dashboard UI
- Chore data is scoped per-user (RLS isolation verified between two accounts)
- Both ChildrenPanel and ChoresPanel render correctly on mobile without layout regressions
