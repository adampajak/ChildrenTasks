# Children Profiles CRUD Implementation Plan

## Overview

Implement full CRUD for child profiles (name, age category, available time per weekday) — the first domain entity establishing the Supabase migration + RLS pattern, service layer, JSON API with zod validation, and React UI with react-hook-form + optimistic updates. This is S-01 from the roadmap, prerequisite for S-03 (schedule generation).

## Current State Analysis

- **Auth**: Fully implemented — Supabase SSR, cookie sessions, middleware attaches `context.locals.user`
- **Database**: No domain tables or migrations exist — only `supabase/config.toml`
- **API routes**: Auth endpoints use formData + redirects; no JSON API pattern yet
- **UI**: Only `/dashboard` page (empty protected page), 1 shadcn component (Button), auth forms use manual state
- **Services**: No service layer — `src/lib/` has only `supabase.ts` and `config-status.ts`
- **Validation**: Client-side only (manual regex in auth forms); no zod on server

### Key Discoveries:

- `src/lib/supabase.ts:createClient(requestHeaders, cookies)` — returns typed SupabaseClient or null
- `src/middleware.ts` — attaches `context.locals.user` (User | null), guards `PROTECTED_ROUTES`
- `src/env.d.ts` — declares `App.Locals` with user field
- `astro.config.mjs` — env schema declares SUPABASE_URL/KEY as optional server secrets
- No `src/lib/services/` directory exists yet
- No `src/components/hooks/` directory exists yet
- `package.json` — no zod, no react-hook-form currently installed

## Desired End State

After this plan is complete:
- A `children` table exists in Supabase with RLS policies scoping data per-user
- API endpoints at `/api/children` support GET (list), POST (create), PUT (update), DELETE (soft-delete)
- The dashboard page shows a children list panel with add/edit dialog
- Forms use react-hook-form + zod with shared validation schemas
- Optimistic UI updates on all mutations with error rollback
- The pattern (migration → RLS → service → API → UI) is established for S-02+

**Verification**: A logged-in user can create, view, edit, and soft-delete child profiles. Data is isolated per-user. Invalid input is rejected both client-side (inline errors) and server-side (400 responses).

## What We're NOT Doing

- Chores CRUD (S-02 — parallel but separate change)
- Schedule generation or assignment (S-03+)
- Undo/restore of soft-deleted children (future enhancement)
- Drag-and-drop reordering of children list
- Pagination of children list (no cap — expected list size <20)
- Child avatars or profile images
- Tests (no test framework is set up yet — would be a separate infrastructure change)

## Implementation Approach

Three-phase vertical slice: DB → Backend → UI. Each phase is independently verifiable.

**Data model**: Single `children` table with `user_id` FK to `auth.users`, `name` text, `age_category` enum via CHECK constraint, `available_time` JSONB (per-day minutes), `deleted_at` timestamp for soft delete, standard timestamps.

**Backend**: Service module (`src/lib/services/children.service.ts`) encapsulates DB queries; API routes delegate to service after zod validation. Shared schemas in `src/lib/schemas/children.schema.ts`.

**UI**: React island on `/dashboard` — `ChildrenPanel` component with list + shadcn Dialog for add/edit form. Uses react-hook-form with `@hookform/resolvers/zod` for form state and validation.

## Phase 1: Database & Schema

### Overview

Create the `children` table migration, RLS policies, and shared TypeScript types + zod schemas that the backend and frontend will consume.

### Changes Required:

#### 1. Supabase Migration

**File**: `supabase/migrations/20260605000001_create_children_table.sql`

**Intent**: Create the `children` table with user ownership, age category constraint, JSONB availability, soft-delete support, and RLS policies that scope all operations to the authenticated user's own rows.

**Contract**: Table `children` with columns: `id` (uuid PK), `user_id` (uuid FK → auth.users NOT NULL), `name` (text NOT NULL), `age_category` (text NOT NULL CHECK IN ('small', 'medium', 'large')), `available_time` (jsonb NOT NULL), `created_at` (timestamptz DEFAULT now()), `updated_at` (timestamptz DEFAULT now()), `deleted_at` (timestamptz NULL). Enable `moddatetime` extension and add a BEFORE UPDATE trigger on `updated_at` to auto-set it on every row change. RLS enabled with policies: SELECT/INSERT/UPDATE/DELETE all filtered by `auth.uid() = user_id`. Non-deleted filter on SELECT and UPDATE policies: `deleted_at IS NULL`.

#### 2. Shared Zod Schemas

**File**: `src/lib/schemas/children.schema.ts`

**Intent**: Define the validation schemas shared between API (server-side validation) and UI (form validation). Single source of truth for field constraints.

**Contract**: Exports `childFormSchema` (name: string min 1 max 100, age_category: enum ['small','medium','large'], available_time: object with mon–sun keys each number 0–480), `createChildSchema` (same as form), `updateChildSchema` (partial of createChildSchema with required id: uuid). Export `type ChildFormValues = z.infer<typeof childFormSchema>`.

#### 3. TypeScript Types

**File**: `src/types.ts` (create)

**Intent**: Add the `Child` entity type matching the DB schema for use across services and UI.

**Contract**: Export `Child` interface with fields matching the DB columns (id, user_id, name, age_category as `'small' | 'medium' | 'large'`, available_time as `Record<string, number>`, created_at, updated_at, deleted_at nullable).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push` (or `npx supabase migration up` locally)
- TypeScript compiles: `npx astro check` or `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- RLS policies work: authenticated user can only see their own children rows in Supabase Studio
- Inserting a row with invalid age_category is rejected by CHECK constraint

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Backend (Service + API)

### Overview

Create the children service layer and JSON API endpoints with zod validation, establishing the pattern for all subsequent domain APIs.

### Changes Required:

#### 1. Children Service

**File**: `src/lib/services/children.service.ts`

**Intent**: Encapsulate all children DB operations behind a typed service. Each method takes a Supabase client (already scoped to the authenticated user via RLS) and returns typed results.

**Contract**: Export functions: `listChildren(supabase)` → `Child[]`, `createChild(supabase, data: CreateChildInput)` → `Child`, `updateChild(supabase, id, data: UpdateChildInput)` → `Child`, `deleteChild(supabase, id)` → void (soft-delete via setting `deleted_at`). All throw/return errors that the API layer can translate to HTTP responses.

#### 2. GET /api/children

**File**: `src/pages/api/children/index.ts`

**Intent**: List all (non-deleted) children for the authenticated user. Returns JSON array.

**Contract**: Export `GET` handler. Returns `200` with `Child[]` JSON. Returns `401` if not authenticated (no supabase client or no user). Exports `const prerender = false`.

#### 3. POST /api/children

**File**: `src/pages/api/children/index.ts` (same file, additional export)

**Intent**: Create a new child profile. Validates input with zod, delegates to service.

**Contract**: Export `POST` handler. Expects JSON body matching `createChildSchema`. Returns `201` with created `Child`. Returns `400` with `{ error, details? }` on validation failure. Returns `401` if not authenticated.

#### 4. PUT /api/children/[id]

**File**: `src/pages/api/children/[id].ts`

**Intent**: Update an existing child profile. Validates input, ensures ownership via RLS.

**Contract**: Export `PUT` handler. Route param `id` (uuid). Expects JSON body matching `updateChildSchema`. Returns `200` with updated `Child`. Returns `400`/`404`/`401` as appropriate.

#### 5. DELETE /api/children/[id]

**File**: `src/pages/api/children/[id].ts` (same file, additional export)

**Intent**: Soft-delete a child (set `deleted_at`). RLS ensures ownership.

**Contract**: Export `DELETE` handler. Route param `id` (uuid). Returns `204` on success. Returns `404`/`401` as appropriate.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- API responds correctly via curl/Postman: create, list, update, delete a child
- Invalid input returns 400 with zod error details
- Unauthenticated request returns 401
- User A cannot see/modify User B's children (RLS)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI Components & Integration

### Overview

Install necessary shadcn/ui primitives, build the ChildrenPanel React island with list view and add/edit dialog form, wire up optimistic updates with error rollback.

### Changes Required:

#### 1. Install Dependencies

**Intent**: Add react-hook-form, @hookform/resolvers, zod, and shadcn/ui components needed for the CRUD UI.

**Contract**: `npm install react-hook-form @hookform/resolvers zod` + `npx shadcn@latest add dialog input label select card` (installs Dialog, Input, Label, Select, Card components into `src/components/ui/`).

#### 2. Children API Client Hook

**File**: `src/components/hooks/use-children.ts`

**Intent**: Custom React hook encapsulating fetch calls to the children API with optimistic state management. Provides `children` list, `isLoading`, and mutation functions that update local state optimistically and rollback on error.

**Contract**: Export `useChildren()` hook returning `{ children, isLoading, error, addChild, updateChild, deleteChild }`. Mutations update local state immediately, call API, and revert on failure with a toast/error state.

#### 3. Child Form Component

**File**: `src/components/children/ChildForm.tsx`

**Intent**: Reusable form for creating and editing a child. Uses react-hook-form with zod resolver for validation. Renders inside a Dialog.

**Contract**: Props: `defaultValues?: ChildFormValues`, `onSubmit: (data: ChildFormValues) => Promise<void>`, `isSubmitting: boolean`. Renders fields: name (Input), age_category (Select with small/medium/large options displaying Polish labels), available_time (7 number inputs for each weekday).

#### 4. Children Panel Component

**File**: `src/components/children/ChildrenPanel.tsx`

**Intent**: Main React island for the dashboard showing the children list with add/edit/delete actions. Orchestrates the form dialog and optimistic updates.

**Contract**: Self-contained component (no props needed — fetches own data). Renders: list of children cards with name + age category badge + edit/delete buttons, "Add child" button that opens the form dialog. Uses `useChildren` hook for state and mutations.

#### 5. Dashboard Page Integration

**File**: `src/pages/dashboard.astro`

**Intent**: Embed the ChildrenPanel React island on the dashboard page with `client:load` directive.

**Contract**: Import and render `<ChildrenPanel client:load />` in the dashboard layout. Remove any placeholder content.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- User can add a child via dialog form with inline validation errors
- Children list displays all created profiles with name and age category
- User can edit a child (pre-filled form, saves changes)
- User can delete a child (optimistic removal, appears gone immediately)
- Optimistic updates roll back visually if API call fails (simulate by disconnecting)
- Form shows Polish labels for age categories (Małe, Średnie, Duże)
- Available time inputs accept minutes per weekday (0–480 range)
- Mobile-responsive layout (works on 320px viewport)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Not applicable in this slice — no test framework is configured. Testing infrastructure is out of scope.

### Integration Tests:

- Not applicable — same reason as above.

### Manual Testing Steps:

1. Sign in as a user, navigate to dashboard
2. Click "Add child" — verify dialog opens with empty form
3. Submit empty form — verify inline validation errors appear
4. Fill valid data (name: "Ania", age: Małe, mon-fri: 30min, sat-sun: 60min) — submit
5. Verify child appears in list immediately (optimistic)
6. Click edit on the child — verify form pre-fills correctly
7. Change name to "Anna" — save — verify list updates
8. Click delete — verify child disappears from list
9. Refresh page — verify all changes persisted
10. Sign in as a different user — verify no children visible (RLS isolation)

## Performance Considerations

- Children list is expected to be small (<20 items) — no pagination or virtualization needed
- Single GET request on dashboard load fetches all children
- Optimistic UI avoids waiting for network on mutations
- JSONB `available_time` column avoids 7 extra columns and joins

## Migration Notes

- First migration in the project — establishes naming convention: `YYYYMMDDHHMMSS_description.sql`
- RLS pattern: enable RLS, create per-operation policies filtered by `auth.uid() = user_id`
- Soft-delete pattern: `deleted_at` timestamp, SELECT policy includes `AND deleted_at IS NULL`
- S-02 (chores-crud) will replicate this exact pattern for the `chores` table

## References

- PRD: `context/foundation/prd.md` — FR-001, FR-008, US-01
- Roadmap: `context/foundation/roadmap.md` — S-01
- Supabase client: `src/lib/supabase.ts`
- Middleware (user resolution): `src/middleware.ts`
- Existing form pattern: `src/components/auth/SignInForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database & Schema

#### Automated

- [x] 1.1 Migration applies cleanly
- [x] 1.2 TypeScript compiles
- [x] 1.3 Lint passes

#### Manual

- [x] 1.4 RLS policies scope data per-user
- [x] 1.5 CHECK constraint rejects invalid age_category

### Phase 2: Backend (Service + API)

#### Automated

- [ ] 2.1 TypeScript compiles
- [ ] 2.2 Lint passes

#### Manual

- [ ] 2.3 CRUD operations work via curl/Postman
- [ ] 2.4 Invalid input returns 400 with zod errors
- [ ] 2.5 Unauthenticated request returns 401
- [ ] 2.6 RLS isolates data between users

### Phase 3: UI Components & Integration

#### Automated

- [ ] 3.1 Build succeeds
- [ ] 3.2 Lint passes

#### Manual

- [ ] 3.3 Add child via dialog with inline validation
- [ ] 3.4 Children list displays profiles correctly
- [ ] 3.5 Edit child with pre-filled form
- [ ] 3.6 Delete child with optimistic removal
- [ ] 3.7 Optimistic rollback on API failure
- [ ] 3.8 Mobile-responsive layout
- [ ] 3.9 Polish labels for age categories
- [ ] 3.10 Available time inputs accept 0–480 range
