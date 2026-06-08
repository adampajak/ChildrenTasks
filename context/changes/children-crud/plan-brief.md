# Children Profiles CRUD — Plan Brief

> Full plan: `context/changes/children-crud/plan.md`

## What & Why

Implement full CRUD for child profiles (name, age category, weekly time availability) — the first domain entity in the app. This establishes the vertical slice pattern (migration → RLS → service → API → UI) that all subsequent features (chores, schedules) will follow. Without children defined, the scheduler (S-03) has no input data.

## Starting Point

Auth is fully implemented (Supabase SSR + cookie sessions + middleware). The `/dashboard` page exists but is empty. No database tables, no service layer, no zod validation, and no domain UI exist yet. Only 1 shadcn/ui component (Button) is installed.

## Desired End State

A logged-in parent can open the dashboard and see their children list. They can add a child (name, age category, per-weekday available minutes), edit any field, and soft-delete a child — all with optimistic UI and inline form validation. Data is strictly isolated per-user via RLS. The established patterns (migration, RLS, service, JSON API, react-hook-form) are ready for S-02 to replicate.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|----------|--------|-------------------|
| Availability storage | JSONB column `{"mon": 60, ...}` | Simple, flexible, one column — easy per-day query in scheduler. |
| Age category model | CHECK constraint enum ('small','medium','large') | Type-safe at DB level, maps directly to PRD categories. |
| API pattern | JSON body/response + zod validation | Matches AGENTS.md requirement, enables proper error responses for CRUD. |
| UI location | Dashboard page with inline dialog | One protected page, modal for create/edit — minimal routing. |
| Form library | react-hook-form + @hookform/resolvers/zod | Shared schemas client & server, industry standard DX. |
| Deletion strategy | Soft delete (deleted_at timestamp) | Safe, recoverable — scheduler may reference children later. |
| Children limit | No cap (UI warning at 10+) | Real families vary; hard caps are arbitrary. |
| Mutation UX | Optimistic UI with error rollback | Instant feedback, best perceived performance for CRUD. |

## Scope

**In scope:**
- Supabase migration + RLS policies for `children` table
- Shared zod schemas (server + client validation)
- Service layer (`children.service.ts`)
- JSON API endpoints (GET, POST, PUT, DELETE)
- React island with list view + add/edit dialog
- Optimistic updates with rollback
- Soft delete

**Out of scope:**
- Chores CRUD (S-02, parallel change)
- Schedule generation (S-03)
- Undo/restore deleted children
- Pagination, avatars, reordering
- Test infrastructure

## Architecture / Approach

Vertical slice in 3 phases: DB first (schema + RLS establishes data contract), then backend (service + API implements business logic), then UI (React island consumes the API). Each phase is independently deployable and verifiable. The service layer decouples API routes from DB queries. Zod schemas are shared between client form validation and server input validation to prevent drift.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Database & Schema | `children` table, RLS, zod schemas, TS types | First migration — sets the pattern for all future tables |
| 2. Backend (Service + API) | CRUD endpoints with validation | New JSON API pattern (differs from existing auth formData routes) |
| 3. UI Components & Integration | Dashboard children panel with dialog + optimistic UX | Most dependencies to install (react-hook-form, shadcn components) |

**Prerequisites:** Working local Supabase instance (`npx supabase start`), authenticated user session
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- First migration establishes the pattern — if RLS policy design is wrong, S-02+ inherit the problem (mitigated: simple 1-table, 1-policy pattern)
- No test framework exists — verification is manual until test infra is added
- Assumes Supabase local dev is available (`npx supabase start` + Docker)

## Success Criteria (Summary)

- Logged-in user can create, view, edit, and soft-delete child profiles from the dashboard
- Data is isolated per-user (User A cannot see User B's children)
- Invalid input is rejected with clear error messages both client-side and server-side
