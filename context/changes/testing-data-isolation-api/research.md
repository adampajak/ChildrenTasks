---
date: 2026-06-17T00:00:00+02:00
researcher: Adam Pajak
git_commit: 1c5a20fa10b843d9ec72d634fedb8da2274b4599
branch: master
repository: adampajak/ChildrenTasks
topic: "Phase 2 integration tests — data isolation and API auth (Risks #1, #2, #4)"
tags: [research, integration-tests, rls, scheduler, api-auth, supabase]
status: complete
last_updated: 2026-06-17
last_updated_by: Adam Pajak
---

# Research: Phase 2 Integration Tests — Data Isolation and API Auth

**Date**: 2026-06-17  
**Researcher**: Adam Pajak  
**Git Commit**: `1c5a20fa10b843d9ec72d634fedb8da2274b4599`  
**Branch**: master  
**Repository**: adampajak/ChildrenTasks

---

## Research Question

What does the codebase currently look like for Risks #1 (RLS cross-family isolation), #2 (non-atomic schedule replace), and #4 (unauthenticated API access)? Where specifically does each risk live, and what exactly needs to be tested to address it?

---

## Summary

All three risks are confirmed real and worth testing — none are "already proven safe by code review":

- **Risk #4** is partially mitigated: 9 of 9 protected API routes DO independently check auth and return 401. But two different code paths exist (8 routes call `supabase.auth.getUser()`; 1 uses `context.locals.user`), and no HTTP-level proof exists. The test must verify the actual HTTP 401 — not the code path.
- **Risk #1** has correctly-written RLS policies (`auth.uid() = user_id` on every SELECT/INSERT/UPDATE/DELETE across all three tables), but RLS correctness on paper is not the same as proven runtime isolation. No test has ever created two users and crossed the boundary.
- **Risk #2** is the most dangerous finding: `generateAndPersistSchedule` in `scheduler.service.ts` uses a hard delete-before-insert pattern with **no transaction, no rollback, and no RPC**. A single INSERT failure after the DELETE commits leaves the week permanently empty.

Phase 1 left a clean Vitest foundation (Node environment, TZ=Europe/Warsaw, `@supabase/supabase-js` already installed, local Supabase on port 54321). Phase 2 needs to add: a Vitest `globalSetup` to start the Astro dev server (for Risk #4 HTTP tests), a Supabase admin client utility for test user provisioning, and `.env.test` pointing to the local Supabase instance.

---

## Detailed Findings

### Risk #4 — API Endpoints Unauthenticated Access

#### API route inventory

10 files under `src/pages/api/`:

| File | Handlers | Auth guard? | Method |
|------|----------|-------------|--------|
| `api/auth/signin.ts` | POST | None (public) | — |
| `api/auth/signout.ts` | POST | None (public) | — |
| `api/auth/signup.ts` | POST | None (public) | — |
| `api/children/index.ts` | GET, POST | ✓ both | `supabase.auth.getUser()` |
| `api/children/[id].ts` | PUT, DELETE | ✓ both | `supabase.auth.getUser()` |
| `api/chores/index.ts` | GET, POST | ✓ both | `supabase.auth.getUser()` |
| `api/chores/[id].ts` | PUT, DELETE | ✓ both | `supabase.auth.getUser()` |
| `api/schedule/index.ts` | GET | ✓ | `supabase.auth.getUser()` |
| `api/schedule/[id].ts` | PATCH | ✓ | `context.locals.user` (outlier — see below) |
| `api/schedule/generate.ts` | POST | ✓ | `supabase.auth.getUser()` |

**Guard pattern (8 of 9 protected routes) — example from `src/pages/api/children/index.ts:15-20`:**
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
}
```

**Outlier — `src/pages/api/schedule/[id].ts:15-17`:**
```typescript
if (!locals.user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
}
```
This is the only route that trusts the middleware-populated `context.locals.user` rather than re-fetching from Supabase. Functionally equivalent, but a different code path — both need HTTP-level coverage.

#### Middleware

**`src/middleware.ts:4`:**
```typescript
const PROTECTED_ROUTES = ["/dashboard", "/schedule"];
```

`/api/*` routes are **not in PROTECTED_ROUTES**. The middleware runs for all requests and populates `context.locals.user`, but it only issues 302 redirects for the two page routes above. API routes receive no redirect protection from middleware — they are solely responsible for their own auth guard.

#### What the test must do

Send a raw HTTP request with **no auth cookie** to each of the three test endpoints (`/api/children`, `/api/chores`, `/api/schedule`). Assert HTTP 401 in the response body (`{"error":"Unauthorized"}`). Sending without a cookie exercises the `getUser()` → null path directly. This requires the Astro server to be running (Vitest `globalSetup`).

---

### Risk #1 — RLS Cross-Family Data Isolation

#### Tables and RLS policies

Three tables in `supabase/migrations/`:

| Table | Migration | user_id? | RLS enabled? | Soft delete? |
|-------|-----------|----------|--------------|--------------|
| `children` | `20260605000001_create_children_table.sql:26` | ✓ uuid FK→auth.users | ✓ | ✓ (`deleted_at`) |
| `chores` | `20260612000001_create_chores_table.sql:26` | ✓ uuid FK→auth.users | ✓ | ✓ (`deleted_at`) |
| `schedule_assignments` | `20260612000002_create_schedule_assignments_table.sql:26` | ✓ uuid FK→auth.users | ✓ | — |

**Policy pattern — children table (lines 31–49), identical structure for chores and schedule_assignments:**
```sql
CREATE POLICY "Users can view their own children"
  ON public.children FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert their own children"
  ON public.children FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own children"
  ON public.children FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own children"
  ON public.children FOR DELETE
  USING (auth.uid() = user_id);
```

All 12 policies (4 per table × 3 tables) use `auth.uid() = user_id` — **not** `auth.uid() IS NOT NULL`. This is the strict per-user form.

#### Why the test is still essential

The policies look correct on paper. But:

1. The application code does **not** add explicit `.eq("user_id", user.id)` filters on queries — it relies 100% on RLS to enforce isolation. A misconfiguration at the DB level (e.g., RLS disabled at the role level, superuser bypass, wrong schema) would return cross-user data with no application-level safety net.
2. No test has ever created two separate auth users and attempted a cross-boundary read. The challenge is real: "RLS is enabled" is not the same as "RLS prevents Parent A from reading Parent B's rows when both have valid sessions."

#### What the test must do

1. Use the Supabase admin client to create two distinct auth users (Parent A, Parent B).
2. Create children + chores rows owned by Parent B.
3. Authenticate as Parent A (obtain a valid JWT).
4. Call each API endpoint (`GET /api/children`, `GET /api/chores`, `GET /api/schedule`) as Parent A.
5. Assert the response body contains **zero** rows from Parent B's data — even though Parent A has a valid session.
6. Also test mutation (POST/PUT/DELETE with Parent B's row IDs as Parent A) → expect 404 or 0 rows affected (RLS silently filters rather than errors on SELECT; mutations against non-owned rows return empty result set, not 403).
7. Clean up both users and all their data after the test.

---

### Risk #2 — Non-Atomic Schedule Replace

#### The implementation

**File:** `src/lib/services/scheduler.service.ts`, function `generateAndPersistSchedule` (lines 173–204)

DB operation sequence:
```
line 184–188: supabase.from("schedule_assignments").delete().eq(...)  ← commits immediately
       ...
line 194–199: supabase.from("schedule_assignments").insert(rows)      ← separate HTTP round-trip
line 197:     if (insertError) { throw new Error(...) }               ← throws, no rollback
```

The DELETE and INSERT are **two independent Supabase HTTP calls** with no transaction wrapper. There is:
- No database-level transaction (`BEGIN`/`COMMIT`/`ROLLBACK`)
- No Supabase RPC call (confirmed: no `.rpc()` in `src/`, no `supabase/functions/` directory)
- No retry or compensating re-insert after INSERT failure
- No migration containing a stored procedure for this operation

The error path at line 197 throws, which causes `generate.ts:27` to catch it and return HTTP 500. The week is left empty permanently.

#### INSERT pattern detail

The INSERT is a single batch call: `.insert(rows)` where `rows` is the full array. This is one HTTP round-trip to Supabase — it either fully succeeds or fully fails from Supabase's perspective. The risk of a **partial** insert (some rows in, some missing) from a mid-loop failure does not apply. The actual risk is the binary scenario: DELETE commits, INSERT fails → zero rows.

Failure triggers include: network timeout between the two calls, a DB constraint violation on any row in the batch, a Supabase server error, or an RLS `WITH CHECK` violation if `user_id` is not set correctly on the inserted rows.

#### What the test must do

**Happy-path test (verifiable without mocking):**
1. Create test user, create children + chores.
2. Call `generateAndPersistSchedule` (directly, not via HTTP) with a real Supabase client.
3. Query `schedule_assignments` — assert row count > 0.

**Failure-path test (requires insert injection):**
1. Create test user, create children + chores, seed an existing schedule (so week starts non-empty).
2. Mock/spy on the Supabase client's `.insert()` to reject (e.g., `vi.spyOn(supabase.from("schedule_assignments"), "insert").mockResolvedValueOnce({ data: null, error: { message: "simulated failure" } })`).
3. Call `generateAndPersistSchedule` — expect it to throw.
4. Query real `schedule_assignments` for this user — assert 0 rows (the DELETE committed, the INSERT did not).
5. Cleanup.

This requires `generateAndPersistSchedule` to accept the Supabase client as a parameter (so tests can inject a partially-mocked client). Verify the exact function signature before writing the plan — see Open Questions.

---

### Phase 1 Test Infrastructure (What Exists)

**What Phase 1 installed:**

| Item | Detail |
|------|--------|
| Vitest version | `^4.1.9` (`package.json:63`) |
| Test environment | `node` (`vitest.config.ts:6`) |
| Timezone | `TZ: Europe/Warsaw` (`vitest.config.ts:7`) |
| Path alias | `@/` → `./src` (`vitest.config.ts:11`) |
| Test scripts | `npm run test` (watch), `npm run test:run` (CI) |
| Existing test files | `src/lib/__tests__/date.test.ts`, `src/lib/services/__tests__/scheduler.test.ts` |
| `@supabase/supabase-js` | `^2.99.1` — already installed (`package.json:26`) |

**Local Supabase configuration (`supabase/config.toml`):**

| Port | Service |
|------|---------|
| 54321 | Supabase REST API |
| 54322 | PostgreSQL |
| 54323 | Supabase Studio |
| 54324 | Email tester |

Auth: email confirmations disabled locally. No seed.sql (config.toml references `./seed.sql` which does not exist).

**What Phase 2 must add from scratch:**

| Missing piece | Purpose |
|---------------|---------|
| `.env.test` | Local Supabase URL (`http://localhost:54321`), anon key, service role key |
| Mock for `astro:env/server` | Vitest resolve alias so route handlers can be imported in Node |
| Supabase admin client utility | Create/delete test users programmatically (uses service role key) |
| `vitest globalSetup` or web server start | Run Astro dev server for HTTP tests (Risk #4) |
| Test setup/teardown helpers | Create test users + seed data; cleanup after each test |
| `seed.sql` (optional) | Baseline DB state for local Supabase `supabase db reset` |

No HTTP client library is required beyond Node's native `fetch` (available in Node 22, which is the project's runtime per `.nvmrc`).

---

## Code References

- `src/pages/api/children/index.ts:15-20` — canonical auth guard (GET, `getUser()` pattern)
- `src/pages/api/schedule/[id].ts:15-17` — outlier auth guard (`locals.user` pattern)
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/schedule"]` — no `/api/*`
- `src/lib/supabase.ts:1-24` — `createClient()` using `@supabase/ssr`, cookie-based sessions
- `supabase/migrations/20260605000001_create_children_table.sql:26-49` — children RLS enable + 4 policies
- `supabase/migrations/20260612000001_create_chores_table.sql:26-49` — chores RLS enable + 4 policies
- `supabase/migrations/20260612000002_create_schedule_assignments_table.sql:26-49` — schedule RLS + 4 policies
- `src/lib/services/scheduler.service.ts:173-204` — `generateAndPersistSchedule`: DELETE at 184–188, INSERT at 194–199, throw at 197
- `vitest.config.ts` — Node env, TZ, alias
- `supabase/config.toml:10,29` — local API port 54321, DB port 54322

---

## Architecture Insights

**Auth guard pattern is inconsistent.** Eight routes re-fetch the user via `supabase.auth.getUser()` on every request (a real Supabase network call). One route (`api/schedule/[id].ts`) trusts `context.locals.user` which the middleware populated earlier in the same request. Both are valid — but they are different code paths. Tests need to exercise both.

**RLS is the sole data-isolation enforcement layer.** No API route adds a `.eq("user_id", user.id)` filter in the application code. If RLS is misconfigured or bypassed at the DB level, cross-user data leaks with no safety net. This makes the integration test the only meaningful proof of isolation.

**The scheduler has no defensive layer for atomicity.** The `generateAndPersistSchedule` function signature and Supabase's `.insert()` API both support a clean refactor path (wrap in a Supabase RPC / PostgreSQL function for atomic replace), but no such protection exists today. The test will document the failure scenario before the fix is applied.

**No shared auth guard utility exists.** Each route inlines its own guard. There is no `withAuth()` wrapper or shared middleware for API routes. This is a consequence of Astro's file-based routing — a future refactor could introduce a shared helper, but the tests should verify each endpoint directly rather than assuming a shared guard applies everywhere.

---

## Historical Context

- `context/changes/testing-bootstrap-scheduler/` — Phase 1 work. Vitest bootstrapped, unit tests for `generateSchedule()` (scheduler constraint rules) and `getTodayLocal()` (UTC vs local date). The `vitest.config.ts` and npm test scripts produced here are the Phase 2 starting point.
- `context/foundation/lessons.md` — UTC/local date rule (Risk #6). Relevant to Phase 2 only as a reminder that date comparisons in tests must use the same `TZ=Europe/Warsaw` env set in `vitest.config.ts`.
- `context/foundation/test-plan.md §6.2` — Stub: "TBD — see §3 Phase 2". The cookbook pattern for integration tests will be filled in as part of this change.

---

## Open Questions

1. **`generateAndPersistSchedule` signature** — Does it receive the Supabase client as a parameter, or does it create its own internally? This determines whether the failure-path test can inject a partially-mocked client without patching module imports. Read `scheduler.service.ts:173` before writing the plan.

2. **Risk #4 test approach** — Is starting the Astro dev server via `vitest globalSetup` the right call, or is there a way to import and invoke the Astro route handler directly in a Node test (constructing a minimal `APIContext` with a `Request` that has no auth cookies)? The latter avoids a full server start but requires mocking `astro:env/server`. Evaluate both options in the plan.

3. **Test user cleanup strategy** — Supabase admin API (`auth.admin.deleteUser()`) requires the service role key. How is the service role key surfaced in `.env.test`? The local Supabase `config.toml` generates a deterministic service role key — confirm its value via `supabase status` before writing the plan.

4. **Risk #1 mutation test: 404 vs 403** — When Parent A attempts to UPDATE/DELETE a row owned by Parent B, RLS silently filters the target rows. The update returns HTTP 200 with 0 rows affected rather than a 403. Decide in the plan whether to assert the HTTP status (200) or the DB row state (unchanged) — both are valid but different assertions.

5. **seed.sql gap** — `supabase/config.toml` references `./seed.sql` but the file does not exist. Running `supabase db reset` (which integration tests may need) will error or warn. Either create an empty `seed.sql` or update `config.toml`. Address in the plan.
