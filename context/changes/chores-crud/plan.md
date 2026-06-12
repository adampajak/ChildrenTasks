# Chores CRUD Implementation Plan

## Overview

Implement full CRUD management for chores (obowiązki domowe) — the second vertical slice of the ChildrensTasks app. Parents will be able to create, edit, and delete chores with four fields: name, age category, minimum weekly frequency, and minimum time to complete. This is the companion slice to `children-crud` (S-01) and unblocks schedule generation (S-03).

## Current State Analysis

The `children-crud` slice is fully implemented and establishes the complete pattern this plan replicates:

- **Database**: `children` table with RLS + soft-delete (`deleted_at`) in `supabase/migrations/20260605000001_create_children_table.sql`
- **Types**: `Child` interface in `src/types.ts`
- **Validation**: Zod schemas in `src/lib/schemas/children.schema.ts`
- **Service layer**: `src/lib/services/children.service.ts` with `list/create/update/delete` functions
- **API routes**: `src/pages/api/children/index.ts` (GET/POST) + `src/pages/api/children/[id].ts` (PUT/DELETE)
- **React island**: `src/components/children/ChildrenPanel.tsx`, `ChildForm.tsx`, `src/components/hooks/use-children.ts`
- **Dashboard**: `src/pages/dashboard.astro` renders `<ChildrenPanel client:load />` in a single card

What is absent: any `chores` table, service, API routes, or UI components.

## Desired End State

Parent can open the dashboard, see a "Chores" section below the Children section, and create/edit/delete chores. Each chore has: name (string), age category (small/medium/large — same enum as children), minimum weekly frequency (1–7), and minimum time to complete (5–480 minutes). Data is isolated per-user via RLS. UI uses optimistic updates identical to the children panel.

### Key Discoveries

- `age_category` enum values (`small | medium | large`) are identical in children and chores — the scheduler can compare them directly without mapping (`context/archive/2026-06-05-children-crud/plan.md`)
- Soft-delete via `deleted_at IS NULL` filter is enforced in RLS SELECT/UPDATE policies — not in application code (`supabase/migrations/20260605000001_create_children_table.sql`)
- `NotFoundError` is thrown by the service when Supabase returns PGRST116; API routes catch it and return 404 (`src/lib/services/children.service.ts`)
- react-hook-form, @hookform/resolvers, and all shadcn/ui components needed are already installed

## What We're NOT Doing

- Assigning chores to specific children (that's S-03 schedule generation)
- Adding icons, descriptions, or colour tags to chores
- Pagination or search in the chores list
- Any automated tests beyond TypeScript + lint

## Implementation Approach

Replicate the `children-crud` vertical slice three times:

1. **Phase 1** — DB migration + zod schemas + TS types (no UI, no API)
2. **Phase 2** — Service layer + API routes wired to Supabase
3. **Phase 3** — React island (hook + form + panel) + dashboard integration

Each phase is independently verifiable. Phases 1 and 2 can be reviewed before any UI exists.

---

## Phase 1: Database & Schema

### Overview

Create the `chores` table with the same RLS + soft-delete pattern as `children`. Define zod schemas for form, create, and update operations. Add the `Chore` TypeScript interface to `src/types.ts`.

### Changes Required

#### 1. Supabase Migration

**File**: `supabase/migrations/20260612000001_create_chores_table.sql`

**Intent**: Create the `chores` table with user-scoped RLS, soft-delete support, and a moddatetime trigger — mirroring the `children` migration exactly.

**Contract**: Table columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name text NOT NULL`, `age_category text NOT NULL CHECK (age_category IN ('small', 'medium', 'large'))`, `min_weekly_frequency integer NOT NULL CHECK (min_weekly_frequency BETWEEN 1 AND 7)`, `min_time_to_complete integer NOT NULL CHECK (min_time_to_complete BETWEEN 5 AND 480)`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `deleted_at timestamptz`. RLS enabled; four policies: SELECT/INSERT/UPDATE/DELETE each scoped to `auth.uid() = user_id`; SELECT and UPDATE additionally filter `deleted_at IS NULL`. Index on `user_id`. Moddatetime trigger on `updated_at`.

#### 2. Zod Schemas

**File**: `src/lib/schemas/chores.schema.ts`

**Intent**: Define validation schemas shared by API endpoints and the client-side form — following the structure in `src/lib/schemas/children.schema.ts`.

**Contract**: Export `choreFormSchema` (fields: `name` string 1–100 chars, `age_category` enum `['small','medium','large']`, `min_weekly_frequency` integer 1–7, `min_time_to_complete` integer 5–480); `createChoreSchema` (mirrors form schema); `updateChoreSchema` (form schema partial + required `id` string uuid). Export inferred types: `ChoreFormValues`, `CreateChoreInput`, `UpdateChoreInput`.

#### 3. TypeScript Types

**File**: `src/types.ts`

**Intent**: Add the `Chore` interface alongside the existing `Child` interface.

**Contract**: `export interface Chore { id: string; user_id: string; name: string; age_category: 'small' | 'medium' | 'large'; min_weekly_frequency: number; min_time_to_complete: number; created_at: string; updated_at: string; deleted_at: string | null; }`

### Success Criteria

#### Automated Verification

- Migration applies cleanly against local Supabase: `npx supabase db reset`
- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `supabase db reset` shows no errors in migration output
- Supabase Studio (or `psql`) confirms `chores` table exists with all columns, CHECK constraints, RLS enabled, and four policies

**Implementation Note**: After all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Backend — Service Layer & API Routes

### Overview

Implement the `chores` service with four functions and wire up two API route files. No UI changes in this phase.

### Changes Required

#### 1. Chores Service

**File**: `src/lib/services/chores.service.ts`

**Intent**: Provide `listChores`, `createChore`, `updateChore`, and `deleteChore` functions — replicating the structure of `children.service.ts`. RLS enforces authorization; service functions do not check `user_id` explicitly.

**Contract**: `listChores(supabase)` → SELECT from `chores` ordered by `created_at asc`. `createChore(supabase, userId, input: CreateChoreInput)` → INSERT with `user_id`, return inserted row. `updateChore(supabase, id, input: Partial<CreateChoreInput>)` → UPDATE by `id`, throw `NotFoundError` on PGRST116. `deleteChore(supabase, id)` → UPDATE `deleted_at = now()` by `id`, throw `NotFoundError` on PGRST116. Re-export or import the existing `NotFoundError` class from `children.service.ts` — do not duplicate it; if it is not already exported from a shared location, move it to `src/lib/services/errors.ts` and re-import in both service files.

#### 2. Collection Route

**File**: `src/pages/api/chores/index.ts`

**Intent**: Handle `GET /api/chores` (list) and `POST /api/chores` (create) — identical flow to `src/pages/api/children/index.ts`.

**Contract**: `export const prerender = false`. `GET`: authenticate → `listChores()` → 200 JSON. `POST`: authenticate → parse body → validate with `createChoreSchema` → `createChore()` → 201 JSON; 400 on zod error (use `z.treeifyError`), 401 on no user, 500 on unexpected error.

#### 3. Item Route

**File**: `src/pages/api/chores/[id].ts`

**Intent**: Handle `PUT /api/chores/:id` (update) and `DELETE /api/chores/:id` (soft-delete) — identical flow to `src/pages/api/children/[id].ts`.

**Contract**: `export const prerender = false`. `PUT`: authenticate → extract `id` from `context.params.id` → validate body with `updateChoreSchema` → `updateChore()` → 200 JSON; 404 on `NotFoundError`, 400 on zod error, 500 otherwise. `DELETE`: authenticate → extract `id` → `deleteChore()` → 204 no content; 404 on `NotFoundError`.

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `GET /api/chores` returns `[]` for a fresh user (200)
- `POST /api/chores` with valid body creates a chore (201) and it appears on subsequent GET
- `POST /api/chores` with invalid body (e.g. `min_weekly_frequency: 0`) returns 400 with zod error details
- `PUT /api/chores/:id` updates the chore (200)
- `DELETE /api/chores/:id` soft-deletes and chore disappears from GET (204)
- Unauthenticated request to any endpoint returns 401
- RLS isolation: a chore created by user A is not visible to user B

**Implementation Note**: After all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: UI Components & Dashboard Integration

### Overview

Build the React island (hook + form + panel) following the `children` component pattern, then add `ChoresPanel` to the dashboard stacked below `ChildrenPanel`.

### Changes Required

#### 1. useChores Hook

**File**: `src/components/hooks/use-chores.ts`

**Intent**: Manage chores state with optimistic CRUD — replicating `src/components/hooks/use-children.ts` for the `Chore` type and `/api/chores` endpoints.

**Contract**: `useChores()` returns `{ chores: Chore[], isLoading: boolean, error: string | null, addChore, updateChore, deleteChore }`. Optimistic add: generate temp id via `crypto.randomUUID()`, render immediately, swap on server response, rollback on error. Optimistic update: merge fields immediately, rollback on error. Optimistic delete: remove immediately, restore on error. Cleanup ref prevents state updates after unmount.

#### 2. ChoreForm Component

**File**: `src/components/chores/ChoreForm.tsx`

**Intent**: Reusable create/edit form using react-hook-form + zod resolver — replicating `src/components/children/ChildForm.tsx` for chore fields.

**Contract**: Props: `defaultValues?: ChoreFormValues`, `onSubmit: (values: ChoreFormValues) => Promise<void>`. Fields: `name` (text input), `age_category` (Select with options Małe/Średnie/Duże mapping to small/medium/large), `min_weekly_frequency` (number input 1–7), `min_time_to_complete` (number input 5–480, labelled in minutes). Submit button text: "Dodaj obowiązek" when creating, "Zapisz zmiany" when editing (`defaultValues` present). Disable submit during submission.

#### 3. ChoresPanel Component

**File**: `src/components/chores/ChoresPanel.tsx`

**Intent**: Container island that renders the chores list with add/edit/delete actions and dialogs — replicating `src/components/children/ChildrenPanel.tsx`.

**Contract**: Uses `useChores()`. Shows loading state, error banner (dismissible), and empty state ("Brak obowiązków. Dodaj pierwszy obowiązek."). Each list item shows name, age category label, frequency (e.g. "3×/tydz."), and time (e.g. "30 min"). Edit and delete buttons per item. Add button opens Dialog with `ChoreForm`. Edit button opens Dialog with `ChoreForm` pre-filled. Delete triggers optimistic removal with no confirmation dialog (matching children pattern).

#### 4. Dashboard Integration

**File**: `src/pages/dashboard.astro`

**Intent**: Import and render `ChoresPanel` in a new card stacked below the existing `ChildrenPanel` card.

**Contract**: Add `import { ChoresPanel } from "@/components/chores/ChoresPanel"` to the frontmatter. Add a second `<div class="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl md:p-6">` wrapping `<ChoresPanel client:load />` immediately after the first card. Add `mt-4` or `mt-6` spacing between cards.

### Success Criteria

#### Automated Verification

- Build succeeds: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Dashboard shows "Chores" panel below "Children" panel
- Add chore via dialog with all four fields — appears in list immediately (optimistic)
- Edit chore — dialog pre-filled, update reflected immediately
- Delete chore — removed from list immediately
- Optimistic rollback: if API returns error, the add/edit/delete is reverted and error banner appears
- Mobile layout: both panels stack cleanly on narrow viewport
- No regressions in ChildrenPanel behaviour

**Implementation Note**: After all automated verification passes, pause for manual confirmation before proceeding.

---

## Testing Strategy

### Manual Testing Steps

1. `npx supabase start` + `npm run dev` → open dashboard
2. Add 3 chores with different age categories and frequencies
3. Edit each chore — confirm form pre-fills correctly
4. Delete one chore — confirm it disappears
5. Disconnect network mid-create — confirm rollback and error banner
6. Open dashboard as a second user — confirm chores do not cross-contaminate (RLS)
7. Resize to mobile — confirm both panels render correctly

## Migration Notes

No existing data to migrate. Migration file timestamp `20260612000001` places it after the children migration (`20260605000001`).

## References

- Archived children-crud plan (pattern reference): `context/archive/2026-06-05-children-crud/plan.md`
- PRD chores requirement: `context/foundation/prd.md` § FR-002
- Children migration (RLS pattern): `supabase/migrations/20260605000001_create_children_table.sql`
- Children service (service pattern): `src/lib/services/children.service.ts`
- Children API (route pattern): `src/pages/api/children/index.ts`, `src/pages/api/children/[id].ts`
- Children components (UI pattern): `src/components/children/ChildrenPanel.tsx`, `src/components/children/ChildForm.tsx`, `src/components/hooks/use-children.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database & Schema

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — bfd57d5
- [x] 1.2 TypeScript compiles: `npm run build` — bfd57d5
- [x] 1.3 Lint passes: `npm run lint` — bfd57d5

#### Manual

- [x] 1.4 Supabase Studio confirms chores table, CHECK constraints, RLS enabled, four policies — bfd57d5

### Phase 2: Backend — Service Layer & API Routes

#### Automated

- [x] 2.1 TypeScript compiles: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`

#### Manual

- [x] 2.3 CRUD operations work via curl/Postman (GET 200, POST 201, PUT 200, DELETE 204)
- [x] 2.4 Invalid input returns 400 with zod errors
- [x] 2.5 Unauthenticated request returns 401
- [x] 2.6 RLS isolates data between users

### Phase 3: UI Components & Dashboard Integration

#### Automated

- [ ] 3.1 Build succeeds: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Add chore via dialog with inline validation
- [ ] 3.4 Chores list displays correctly
- [ ] 3.5 Edit chore with pre-filled form
- [ ] 3.6 Delete chore with optimistic removal
- [ ] 3.7 Optimistic rollback on API failure
- [ ] 3.8 Mobile-responsive layout
- [ ] 3.9 No regressions in ChildrenPanel
