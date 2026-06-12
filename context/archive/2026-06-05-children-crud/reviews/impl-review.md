<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Children Profiles CRUD

- **Plan**: context/changes/children-crud/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-11
- **Verdict**: REJECTED
- **Findings**: 1 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — deleteChild silently returns 204 for non-existent or foreign IDs

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/children.service.ts:48–57
- **Detail**: The service does `.update().eq("id", id)` with no `.select()` and no row-count check. Supabase does NOT return PGRST116 for UPDATE when zero rows match — it returns `data: []` with no error. This means: (a) deleting a non-existent ID succeeds silently with 204, and (b) if a user sends a DELETE for another user's child ID, the RLS UPDATE policy silently matches zero rows, and the endpoint still returns 204. The NotFoundError branch in this function is dead code. By contrast, updateChild uses .single() after a SELECT, which correctly fires PGRST116 — so only deleteChild is broken.
- **Fix**: Add `.select().single()` after the update so Supabase fires PGRST116 when zero rows are matched. updateChild already uses this exact pattern — one-line change, zero new surface area.
  - Strength: Matches the pattern already used in updateChild; removes the silent-success class entirely.
  - Tradeoff: None. .single() on an UPDATE targeting one row is idiomatic Supabase.
  - Confidence: HIGH — PGRST116 is documented Supabase behavior for .single() on empty result.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — createChild service signature deviates from plan contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/children.service.ts (createChild)
- **Detail**: Plan contract: `createChild(supabase, data: CreateChildInput)`. Actual signature: `createChild(supabase, userId: string, input)`. The caller at api/children/index.ts:62 explicitly passes user.id from a separate getUser() call. The intent was for the service to receive a fully-authenticated Supabase client and let RLS handle ownership — user_id would be supplied by the caller via the data payload. The implementation requires the API layer to know about userId as a separate concern.
- **Fix**: Accept userId as part of the input type (CreateChildInput) rather than a positional argument. This eliminates the extra positional param and keeps the service signature clean.
- **Decision**: PENDING

### F3 — PUT /api/children/[id] accepts a partial body via updateChildSchema

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/schemas/children.schema.ts:22–24, src/pages/api/children/[id].ts:34
- **Detail**: updateChildSchema is `childFormSchema.partial()` — every field is optional. A client can send `{}` and the PUT will silently write nothing. HTTP PUT semantics are full-replace; partial updates are PATCH. The hook always sends all fields so this never bites in practice, but the schema contract is misleading and will confuse future callers or a generated SDK client.
- **Fix A ⭐ Recommended**: Make PUT require all fields — use `createChildSchema` (not partial) for the PUT handler validation in `[id].ts:34`.
  - Strength: Correct PUT semantics; no schema change needed, just swap the schema reference.
  - Tradeoff: Breaking change for any client currently sending partial payloads — but the hook always sends full ChildFormValues so no actual clients break.
  - Confidence: HIGH — the hook sends full ChildFormValues on every edit.
  - Blind spot: None significant.
- **Fix B**: Rename to PATCH and document partial update semantics.
  - Strength: Honest about what the endpoint actually does.
  - Tradeoff: Requires renaming the export and updating the hook's fetch method; slightly more churn.
  - Confidence: MEDIUM — depends on whether partial updates are intentional for future use.
  - Blind spot: Whether any other consumer already relies on PUT.
- **Decision**: PENDING

### F4 — Optimistic rollback on delete loses original list order

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/use-children.ts:~124
- **Detail**: On API failure during deleteChild, the rollback calls `setChildren((prev) => [...prev, previous])` which appends the restored child to the end of the array. The original position is lost. The user sees the item jump to the bottom of the list on rollback — visually jarring and inconsistent with addChild and updateChild which snapshot and restore state correctly.
- **Fix**: Snapshot the full array before the optimistic removal and restore it on rollback: `const snapshot = children; setChildren(prev => prev.filter(c => c.id !== id)); try { ... } catch { setChildren(snapshot); throw e; }`
- **Decision**: PENDING

### F5 — API endpoints call getUser() redundantly (middleware already resolved user)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/children/index.ts:10–19, src/pages/api/children/[id].ts:10–19
- **Detail**: `src/middleware.ts` already calls `supabase.auth.getUser()` on every request and attaches the result to `context.locals.user`. The new endpoints create a second Supabase client and call `getUser()` again — a redundant network round-trip per request that deviates from the middleware pattern.
- **Fix**: Read `context.locals.user` for the auth check; keep `createClient()` only for the data access client. Remove the standalone `getUser()` calls from both endpoint files.
- **Decision**: PENDING

### F6 — Error responses missing Content-Type: application/json header

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/children/index.ts, src/pages/api/children/[id].ts (all error Response constructors)
- **Detail**: Success responses include `headers: { "Content-Type": "application/json" }` but 400/401/404/500 error responses do not. Inconsistent and can cause client-side JSON.parse() failures depending on the fetch client.
- **Fix**: Add `headers: { "Content-Type": "application/json" }` to all error `new Response(JSON.stringify(...))` calls, or extract a small helper function shared across both files.
- **Decision**: PENDING

### F7 — PROTECTED_ROUTES does not cover /api/children routes

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:4
- **Detail**: The middleware only lists `/dashboard` in PROTECTED_ROUTES. The API routes do their own 401 check so there is no actual bypass, but this establishes a dual-check pattern. A future developer copying an endpoint without the auth check would ship an unprotected route silently.
- **Fix**: Either add `/api/` to PROTECTED_ROUTES (middleware as first line of defense) or add a comment to middleware explaining the dual-check pattern so the intent is clear.
- **Decision**: PENDING

### F8 — listChildren has no row limit

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/children.service.ts:6
- **Detail**: The query has no `.limit()`. The plan explicitly notes <20 expected rows for children so this is not a current concern, but the pattern is copied for future tables (S-02 chores-crud). Adding pagination later would be a breaking API change.
- **Fix**: Add `.limit(50)` as a safety cap to establish the pattern for S-02.
- **Decision**: PENDING
