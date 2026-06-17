# Phase 2 Integration Tests — Data Isolation and API Auth

## Overview

Install Vitest integration test infrastructure and write three test suites covering Risks #1 (RLS cross-family isolation), #2 (non-atomic schedule replace), and #4 (unauthenticated API access). Tests use a real local Supabase instance; Risks #1 and #4 also hit the Astro dev server via HTTP.

## Current State Analysis

- Vitest ^4.1.9 installed, `node` environment, `TZ=Europe/Warsaw`, path alias `@/` (from Phase 1)
- `@supabase/supabase-js` ^2.99.1 already installed
- Local Supabase: `supabase/config.toml` — REST API on port 54321, DB on 54322; `./seed.sql` referenced but missing
- `generateAndPersistSchedule(supabase, userId, weekStart)` — accepts the client as first parameter; DELETE at `:184`, INSERT at `:196` (no transaction)
- All API routes independently guard auth; middleware `PROTECTED_ROUTES` excludes `/api/*`
- `deleteChild` uses `.update()` without `.single()` — cross-user deletes return HTTP 204 silently (data safe via RLS, but HTTP status is misleading)
- All 3 tables have RLS `auth.uid() = user_id`; no application-level `user_id` filter is added

### Key Discoveries

- `src/lib/services/scheduler.service.ts:173` — `generateAndPersistSchedule` signature; injectable client enables spy-based failure simulation
- `src/lib/services/children.service.ts:52` — `deleteChild` uses `.update()` (not `.select().single()`); PGRST116 is not raised on RLS block → HTTP 204 always returned; DB state is the only truth
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/schedule"]`; API routes rely solely on their own per-handler guards
- `supabase/migrations/20260605000001_create_children_table.sql:31–49` — RLS policies use strict `auth.uid() = user_id` form (not IS NOT NULL)
- `vitest.config.ts` — no `name`, no `include` constraint yet; must be updated to limit unit project to `src/**/__tests__/`

## Desired End State

`npm run test:integration` runs 3 test suites (api-auth, rls-isolation, schedule-replace) against local Supabase, produces a green report, and fails loudly on any violation. `npm run test:unit` continues to run only the pure-function tests from Phase 1.

### Key Discoveries

- `context/changes/testing-bootstrap-scheduler/` — Phase 1 foundation: Vitest config, 2 unit test files, npm scripts `test` and `test:run`

## What We're NOT Doing

- No CI wiring — that is Phase 4 of the test-plan rollout
- No MSW mocks — tests hit a real local Supabase, not a network mock
- No tests for auth pages (signin, signup, confirm-email) — excluded in test-plan §7
- Not touching Risk #3 or #6 — those are unit tests already in Phase 1
- Not modifying `.dev.vars` in this plan — developer must configure it as a prerequisite

## Implementation Approach

Five phases: infrastructure first, then one phase per risk suite, then cookbook documentation. Risks #1 and #4 test via HTTP (Astro server + `fetch`); Risk #2 calls `generateAndPersistSchedule` directly with an injectable Supabase client, using a `vi.spyOn` call-count pattern to intercept the INSERT without blocking the DELETE.

## Critical Implementation Details

**Astro server dependency (Phases 2 & 3):** The dev server reads `SUPABASE_URL` and `SUPABASE_KEY` from `.dev.vars` (Cloudflare runtime). If `.dev.vars` still points to the remote Supabase instance when tests run, Risks #1 and #4 will interact with production data. This is a hard prerequisite: `.dev.vars` must set `SUPABASE_URL=http://localhost:54321` and the corresponding local anon key before running integration tests.

**vi.spyOn call-count pattern (Phase 4, failure-path test):** `generateAndPersistSchedule` calls `supabase.from("schedule_assignments")` twice — first to DELETE, then to INSERT. The spy must intercept the *second* call only (the first must reach the real DB so DELETE commits). Implement with a counter inside the `from()` mock implementation; on the second invocation for that table, return a fake builder whose `.insert()` resolves to `{ data: null, error: { message: "simulated", code: "TEST_ERR" } }`.

**Cross-user DELETE assertion (Phase 3):** HTTP 204 is returned whether or not RLS blocked the soft-delete. The test must issue a follow-up read via the admin client and assert `deleted_at IS NULL` to confirm the write was actually blocked.

---

## Phase 1: Integration Test Infrastructure

### Overview

Scaffold everything needed before any integration test can run: fix the missing `seed.sql`, add `.env.test` to git-ignore, document its required shape in `.env.example`, set up a Vitest workspace with separate unit and integration projects, install `dotenv`, add the admin client helper, and wire up new npm scripts.

### Changes Required

#### 1. Fix missing seed.sql

**File**: `supabase/seed.sql`

**Intent**: Create the empty SQL file that `supabase/config.toml` already references. Its absence causes `supabase db reset` to error, which integration test setup may invoke.

**Contract**: File exists at `supabase/seed.sql`. Contents: a single SQL comment line (`-- seed data (intentionally empty)`). No tables, no rows.

---

#### 2. Protect .env.test from commit

**File**: `.gitignore`

**Intent**: Prevent `.env.test` (which will contain the local Supabase service-role key) from being committed.

**Contract**: Append `.env.test` to the "environment variables" section alongside `.env` and `.env.production`.

---

#### 3. Document integration test env vars

**File**: `.env.example`

**Intent**: Tell every developer exactly what values to put in `.env.test` before running integration tests, and where to find them.

**Contract**: Append a new block to `.env.example`:

```
# Integration test — local Supabase (run `supabase status` for the values below)
# Copy to .env.test (gitignored) and fill in before running `npm run test:integration`
SUPABASE_TEST_URL=http://localhost:54321
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

#### 4. Install dotenv devDependency

**File**: `package.json`

**Intent**: `dotenv` is used in `global.setup.ts` (Phase 2) and the integration test helpers to load `.env.test` into `process.env` before tests run. No other package in the current devDependencies provides this.

**Contract**: Add `"dotenv": "^16.0.0"` (or latest) under `devDependencies`.

---

#### 5. Name the unit Vitest project and constrain its include pattern

**File**: `vitest.config.ts`

**Intent**: The workspace requires each project to have a unique `name` so `--project unit` works. Adding an explicit `include` pattern prevents unit tests from accidentally matching files in `tests/integration/`.

**Contract**: Add `name: "unit"` and `include: ["src/**/__tests__/**/*.test.ts"]` inside the `test` block. No other changes to this file.

---

#### 6. Create the Vitest workspace definition

**File**: `vitest.workspace.ts` (new, project root)

**Intent**: Define the two Vitest projects — `unit` (existing lightweight config) and `integration` (new config with its own setup). This is the entry point for `vitest --workspace` commands.

**Contract**: The workspace file extends two config files: `"./vitest.config.ts"` (unit) and `"./vitest.integration.config.ts"` (integration). Use Vitest's `defineWorkspace` from `"vitest/config"`.

---

#### 7. Create the integration project Vitest config

**File**: `vitest.integration.config.ts` (new, project root)

**Intent**: Configure the integration test project: name it `integration`, target `tests/integration/**/*.test.ts`, add globalSetup, and set a longer timeout to accommodate DB + HTTP latency.

**Contract**: Extends `vitest/config`'s `defineConfig`. Key settings:
- `test.name: "integration"`
- `test.include: ["tests/integration/**/*.test.ts"]`
- `test.globalSetup: ["tests/integration/global.setup.ts"]`
- `test.testTimeout: 30000`
- `test.env: { TZ: "Europe/Warsaw" }`
- `resolve.alias` matching the existing `vitest.config.ts` (`@` → `./src`)

---

#### 8. Create the Supabase admin helper

**File**: `tests/integration/helpers/admin.ts` (new)

**Intent**: Provide `createTestUser`, `deleteTestUser`, and a shared `adminClient` for all integration test files. The admin client uses the service-role key so it can bypass RLS for setup and teardown.

**Contract**: Exports:
- `adminClient: SupabaseClient` — created with `SUPABASE_TEST_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `process.env`; `auth: { autoRefreshToken: false, persistSession: false }`
- `createTestUser(emailPrefix: string): Promise<{ user: User; email: string; password: string }>` — creates a user via `adminClient.auth.admin.createUser` with `email_confirm: true`; uses `${emailPrefix}-${Date.now()}@test.local` and a fixed test password
- `deleteTestUser(userId: string): Promise<void>` — deletes via `adminClient.auth.admin.deleteUser`

---

#### 9. Add npm scripts

**File**: `package.json`

**Intent**: Expose named commands for running unit and integration tests independently. `test:run` (used by CI for Phase 1) should continue to run unit tests only until Phase 4 wires CI.

**Contract**:
- `"test:unit": "vitest run --project unit"` — unit tests only, no server startup
- `"test:integration": "vitest run --project integration"` — integration tests only; requires `.env.test` and local Supabase running
- Keep `"test:run": "vitest run --project unit"` (add `--project unit` to the existing script so CI only runs unit tests until Phase 4)
- Keep `"test": "vitest"` (watch mode across all projects)

---

### Success Criteria

#### Automated Verification

- `npm run test:unit` runs Phase 1's 2 unit tests, passes, no integration test files are picked up
- `npm run lint` passes on all new files
- `supabase seed.sql` file exists and `supabase db reset` completes without error (requires local Supabase running)

#### Manual Verification

- Running `npm run test:integration` before Phases 2–4 are implemented shows "0 tests found" but exits 0 (passWithNoTests)
- `vitest run --project unit` and `vitest run --project integration` each complete without cross-project interference

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Risk #4 — Unauthenticated API Access Tests

### Overview

Start the Astro dev server in Vitest's `globalSetup` and write HTTP tests that send requests to the three main API resources without any auth cookie, asserting HTTP 401.

### Changes Required

#### 1. Create the global test server setup

**File**: `tests/integration/global.setup.ts` (new)

**Intent**: Start the Astro dev server on port 4322 before any integration test runs, and shut it down after all tests finish. Export the test base URL as `process.env.ASTRO_TEST_URL` for test files to consume.

**Contract**: Exports `setup()` and `teardown()`. `setup()` calls `dotenv.config({ path: ".env.test" })`, spawns `npm run dev -- --port 4322` (using `{ shell: true }` for Windows compatibility), polls `http://localhost:4322/` every 500 ms until any non-500 response is received (with a 30 s timeout), then sets `process.env.ASTRO_TEST_URL = "http://localhost:4322"`. `teardown()` calls `SIGTERM` on the spawned process.

---

#### 2. Write the unauthenticated API auth test suite

**File**: `tests/integration/api-auth.test.ts` (new)

**Intent**: Prove that each protected API endpoint returns HTTP 401 when called without an auth cookie. Covers both code paths: the 8 routes using `supabase.auth.getUser()` and the 1 route (`PATCH /api/schedule/:id`) using `context.locals.user`.

**Contract**: Uses `process.env.ASTRO_TEST_URL` as the base URL. Tests: `GET /api/children`, `POST /api/children`, `GET /api/chores`, `POST /api/chores`, `GET /api/schedule`, `POST /api/schedule/generate`, `PATCH /api/schedule/:id` (with a dummy UUID in path). Each `fetch()` sends **no `Cookie` header**. Each assertion: `expect(res.status).toBe(401)` and `expect(body).toMatchObject({ error: expect.any(String) })`. No `beforeAll`/`afterAll` needed — these are stateless HTTP calls.

---

### Success Criteria

#### Automated Verification

- `npm run test:integration` shows 7+ passing tests in `api-auth.test.ts`
- `npm run lint` passes

#### Manual Verification

- With local Supabase stopped, `npm run test:integration` should fail on server startup (not on the tests themselves); verify the error message is clear ("Server startup timeout")
- With `.dev.vars` missing or pointing to wrong Supabase URL, server may start but tests should still pass (getUser returns null for any valid Supabase client with no cookie)

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Risk #1 — RLS Cross-Family Isolation Tests

### Overview

Create two authenticated test users, seed data owned by Parent B, then make API requests as Parent A and verify: GET returns empty arrays, PUT returns 404, DELETE returns 204 but DB state confirms the soft-delete was blocked by RLS.

### Changes Required

#### 1. Write the RLS isolation test suite

**File**: `tests/integration/rls-isolation.test.ts` (new)

**Intent**: Prove Parent A cannot read or mutate Parent B's children, chores, or schedule assignments via any API endpoint, even with a valid auth session. Tests use HTTP (Astro server + real Supabase) to exercise the full stack.

**Contract**:

`beforeAll`:
1. Create Parent A via `createTestUser("parent-a")`; create Parent B via `createTestUser("parent-b")`
2. Sign Parent B in via `POST /api/auth/signin` on the Astro server; use their auth cookies to create at least one child and one chore owned by Parent B (via `POST /api/children` and `POST /api/chores`)
3. Sign Parent A in via `POST /api/auth/signin`; store Parent A's auth cookie string for test requests

`afterAll`:
- Delete all children/chores/schedule_assignments for both users via `adminClient` (using `.delete().eq("user_id", ...)`)
- `deleteTestUser(parentAId)`, `deleteTestUser(parentBId)`

**Cookie helper** (file-local function or extracted to `tests/integration/helpers/http.ts`):
```typescript
async function signIn(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (res.headers.getSetCookie() ?? [])
    .map((h) => h.split(";")[0])
    .join("; ");
}
```

Tests (all use Parent A's cookie, all target data owned by Parent B):
- `GET /api/children` as Parent A → `200`, body array length 0
- `GET /api/chores` as Parent A → `200`, body array length 0
- `GET /api/schedule` as Parent A → `200`, body array of length 0 (Parent B has no schedule assignments yet)
- `PUT /api/children/:parentBChildId` as Parent A → `404`
- `PUT /api/chores/:parentBChoreId` as Parent A → `404`
- `DELETE /api/children/:parentBChildId` as Parent A → `204` **AND** admin client query confirms `deleted_at IS NULL` (data not soft-deleted)

---

### Success Criteria

#### Automated Verification

- `npm run test:integration` shows all RLS isolation tests passing
- `npm run lint` passes

#### Manual Verification

- Run `supabase db reset` then re-run `npm run test:integration` — tests should still pass (data isolation is enforced by DB policies, not by test fixture order)
- Check Supabase Studio (port 54323) after a test run: Parent A's rows in each table should be empty; Parent B's rows should be untouched

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Risk #2 — Non-Atomic Schedule Replace Tests

### Overview

Test that `generateAndPersistSchedule` produces a non-empty week (happy path) and that a simulated INSERT failure after a committed DELETE leaves the DB with zero schedule rows (failure path). These tests call the service function directly with an injectable Supabase client; no Astro server needed.

### Changes Required

#### 1. Write the schedule replace atomicity test suite

**File**: `tests/integration/schedule-replace.test.ts` (new)

**Intent**: Prove that (a) a parent with valid children + chores gets a non-empty schedule after Generate, and (b) when the INSERT batch fails after DELETE has committed, the week is left empty — demonstrating the non-atomic risk scenario is real.

**Contract**:

`beforeAll`:
1. `createTestUser("schedule-test")` → `testUser`
2. Create a Supabase client for `testUser` using `createClient(SUPABASE_TEST_URL, SUPABASE_ANON_KEY)` then `signInWithPassword({ email, password })`
3. Insert at least 1 child (age compatible with the chore) and 1 chore owned by `testUser` via the authenticated client

`afterAll`:
- Delete all `schedule_assignments` for `testUser.id` via `adminClient`
- Delete children and chores for `testUser.id` via `adminClient`
- `deleteTestUser(testUser.id)`

**Happy-path test** (`it("generates a non-empty week")`):
1. Delete any existing schedule for `testUser` via `adminClient`
2. Call `generateAndPersistSchedule(testUserClient, testUser.id, getWeekStartDate(new Date()))`
3. Query `adminClient.from("schedule_assignments").select("*").eq("user_id", testUser.id)`
4. `expect(data.length).toBeGreaterThan(0)`

**Failure-path test** (`it("leaves an empty week when INSERT fails after DELETE commits")`):
1. Seed one row into `schedule_assignments` via `adminClient.insert(...)` so the week starts non-empty
2. Build a spy over `testUserClient`:
   ```typescript
   let fromScheduleCallCount = 0;
   const originalFrom = testUserClient.from.bind(testUserClient);
   vi.spyOn(testUserClient, "from").mockImplementation((table: string) => {
     if (table === "schedule_assignments") {
       fromScheduleCallCount++;
       if (fromScheduleCallCount === 2) {
         return { insert: () => Promise.resolve({ data: null, error: { message: "simulated", code: "TEST_ERR", details: "", hint: "" } }) } as any;
       }
     }
     return originalFrom(table);
   });
   ```
3. Call `generateAndPersistSchedule(testUserClient, testUser.id, weekStart)` and `await expect(promise).rejects.toThrow("Failed to save schedule")`
4. `vi.restoreAllMocks()`
5. Query `adminClient.from("schedule_assignments").select("*").eq("user_id", testUser.id).eq("week_start_date", weekStartStr)`
6. `expect(data.length).toBe(0)` — DELETE committed, INSERT did not, week is empty

---

### Success Criteria

#### Automated Verification

- `npm run test:integration` shows both schedule replace tests passing
- Happy-path test produces `data.length > 0`
- Failure-path test: the `rejects.toThrow` assertion passes AND the follow-up DB query returns 0 rows

#### Manual Verification

- Check Supabase Studio after running the failure-path test: the `schedule_assignments` table should have 0 rows for `testUser.id` in the tested week
- Re-run tests twice in sequence — `afterAll` cleanup must leave no orphan rows that cause interference

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Cookbook Documentation

### Overview

Fill in the two TBD stubs in `context/foundation/test-plan.md` so future contributors know how to add new integration tests and how to add tests for new API endpoints.

### Changes Required

#### 1. Fill in §6.2 — Adding an integration test

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 2" placeholder in §6.2 with a short cookbook pattern capturing the conventions established by this change: `tests/integration/` location, `beforeAll`/`afterAll` user lifecycle, admin client for DB reads, `signIn` helper for HTTP auth cookies.

**Contract**: §6.2 body covers: file location (`tests/integration/*.test.ts`), prerequisites (`supabase start` + `.dev.vars` local config), user lifecycle pattern (`beforeAll` via `createTestUser`, `afterAll` via `deleteTestUser` + bulk admin delete), run command (`npm run test:integration`), and a reference to `tests/integration/rls-isolation.test.ts` as the canonical example.

---

#### 2. Fill in §6.4 — Adding a test for a new API endpoint

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 2" placeholder in §6.4 with a pattern for testing any new `/api/*` endpoint: unauthenticated request (no cookie → 401) and cross-user request (valid cookie for wrong user → 404 or empty body).

**Contract**: §6.4 body covers: the two mandatory checks for any new endpoint (no-cookie 401 test pointing to `api-auth.test.ts` pattern; cross-user isolation pointing to `rls-isolation.test.ts` pattern), the silent-204 note for mutations that use `.update()` without `.single()` (always verify DB state, not just HTTP status), and the admin client pattern for DB-state assertions.

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes (Prettier formats the updated `test-plan.md`)

#### Manual Verification

- A developer can read §6.2 and §6.4 and add a new integration test without consulting the plan

---

## Testing Strategy

### Integration Tests

- `tests/integration/api-auth.test.ts` — Risk #4: 7 unauthenticated HTTP requests → 401 each
- `tests/integration/rls-isolation.test.ts` — Risk #1: cross-user GET (empty), PUT (404), DELETE (204 + DB state)
- `tests/integration/schedule-replace.test.ts` — Risk #2: happy path (non-empty), failure path (0 rows after INSERT spy)

### Unit Tests (unchanged from Phase 1)

- `src/lib/__tests__/date.test.ts` — Risk #6: local date function
- `src/lib/services/__tests__/scheduler.test.ts` — Risk #3: scheduler constraints

### Manual Verification Steps

1. Run `supabase start` and confirm local instance is healthy (`supabase status`)
2. Copy the local anon key and service-role key into `.env.test`
3. Set `.dev.vars` to use `SUPABASE_URL=http://localhost:54321` (local anon key)
4. Run `npm run test:integration` — all suites should pass
5. Inspect Supabase Studio (port 54323) to confirm no orphan test rows remain

## Prerequisites

Before running integration tests, the following must be true (not enforced by test code — the test run will produce confusing failures without them):

- `supabase start` is running (`supabase status` shows healthy)
- `.env.test` exists with local Supabase URL, anon key, and service-role key
- `.dev.vars` has `SUPABASE_URL=http://localhost:54321` and local anon key (not production Supabase)

## References

- Research: `context/changes/testing-data-isolation-api/research.md`
- Test plan: `context/foundation/test-plan.md`
- Phase 1 implementation: `context/changes/testing-bootstrap-scheduler/`
- Scheduler service: `src/lib/services/scheduler.service.ts:173`
- Children service (silent-204 pattern): `src/lib/services/children.service.ts:52`
- RLS policies: `supabase/migrations/20260605000001_create_children_table.sql:31`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration Test Infrastructure

#### Automated

- [x] 1.1 `npm run test:unit` runs Phase 1 unit tests only, no integration files picked up — 3f54323
- [x] 1.2 `npm run lint` passes on all new files — 3f54323
- [x] 1.3 `supabase db reset` completes without error (seed.sql exists) — 3f54323

#### Manual

- [x] 1.4 `npm run test:integration` with no integration test files exits 0 (passWithNoTests behavior) — 3f54323
- [x] 1.5 `vitest run --project unit` and `vitest run --project integration` complete without cross-project interference — 3f54323

### Phase 2: Risk #4 — Unauthenticated API Access Tests

#### Automated

- [x] 2.1 `npm run test:integration` shows 7+ passing tests in `api-auth.test.ts`
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 With local Supabase stopped, `npm run test:integration` fails with clear server startup error
- [x] 2.4 All 7 tested endpoints return 401 in the test output

### Phase 3: Risk #1 — RLS Cross-Family Isolation Tests

#### Automated

- [ ] 3.1 `npm run test:integration` shows all RLS isolation tests passing
- [ ] 3.2 `npm run lint` passes

#### Manual

- [ ] 3.3 After test run, Supabase Studio shows no orphan rows for test users
- [ ] 3.4 Re-run tests twice — no interference from previous run

### Phase 4: Risk #2 — Non-Atomic Schedule Replace Tests

#### Automated

- [ ] 4.1 `npm run test:integration` shows both schedule replace tests passing
- [ ] 4.2 Happy-path test: DB query returns `> 0` rows
- [ ] 4.3 Failure-path test: `rejects.toThrow` passes AND follow-up DB query returns 0 rows

#### Manual

- [ ] 4.4 Supabase Studio shows 0 rows for testUser's schedule after failure-path test run
- [ ] 4.5 `afterAll` cleanup leaves no orphan rows on re-run

### Phase 5: Cookbook Documentation

#### Automated

- [ ] 5.1 `npm run lint` passes (Prettier formats updated `test-plan.md`)

#### Manual

- [ ] 5.2 §6.2 and §6.4 in `test-plan.md` are filled in and readable without consulting the plan
