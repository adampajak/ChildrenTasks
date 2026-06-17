# Phase 2 Integration Tests — Data Isolation and API Auth — Plan Brief

> Full plan: `context/changes/testing-data-isolation-api/plan.md`
> Research: `context/changes/testing-data-isolation-api/research.md`

## What & Why

Install Vitest integration test infrastructure and write three test suites to prove the three risks from test-plan §3 Phase 2 are covered: RLS actually isolates family data at runtime (Risk #1), a failed INSERT after DELETE leaves the week empty (Risk #2), and every API endpoint independently rejects unauthenticated requests at the HTTP level (Risk #4). The challenge in each case is that the existing behaviour looks correct in code review and in manual testing — only automated tests against real infrastructure can prove it.

## Starting Point

Phase 1 delivered a working Vitest setup (`vitest.config.ts`, `node` environment, `TZ=Europe/Warsaw`) with two pure-function unit tests. `@supabase/supabase-js` is already installed. Local Supabase is configured in `supabase/config.toml` (API port 54321) but has no `seed.sql` yet, and there is no integration test project, no admin client helper, and no `.env.test`.

## Desired End State

`npm run test:integration` runs against local Supabase, produces 10+ passing assertions across three test files, and fails loudly on any regression. `npm run test:unit` remains fast and independent (no server startup). Test-plan cookbook stubs §6.2 and §6.4 are filled in.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Risk #4 test approach | Astro dev server in `globalSetup` + `fetch()` | True black-box HTTP test; no Astro virtual module mocking; matches existing Playwright webServer pattern | Plan |
| Risk #2 failure simulation | `vi.spyOn` call-count injection on the Supabase client | `generateAndPersistSchedule` accepts `supabase` as a param, making injection clean without module-level mocking | Research + Plan |
| Vitest config structure | Workspace (`vitest.workspace.ts`) with unit + integration projects | Keeps `npm run test:unit` fast (no server startup); clean `--project` flag separation | Plan |
| Test user lifecycle | `beforeAll` / `afterAll` per file | Admin user creation is ~100–200 ms; `beforeAll` amortizes it across all tests in the file | Plan |
| Integration test location | `tests/integration/` (top-level) | Cross-service tests spanning HTTP + DB don't belong co-located with a single service's unit tests | Plan |
| Risk #1 DELETE assertion | HTTP 204 + admin client DB state check | `deleteChild` uses `.update()` without `.single()` — HTTP 204 is returned whether RLS blocked or not; only the DB knows | Research + Plan |
| `.env.test` sourcing | `dotenv.config({ path: ".env.test" })` in `global.setup.ts` | Standard approach; keys obtained from `supabase status` | Plan |
| `seed.sql` gap | Create empty `supabase/seed.sql` | Unblocks `supabase db reset` without adding fixture burden | Plan |

## Scope

**In scope:**
- Vitest workspace config + integration project
- `tests/integration/helpers/admin.ts` (admin client + `createTestUser` / `deleteTestUser`)
- `tests/integration/global.setup.ts` (Astro dev server lifecycle)
- `tests/integration/api-auth.test.ts` (Risk #4: 7 endpoints × no-cookie → 401)
- `tests/integration/rls-isolation.test.ts` (Risk #1: GET empty, PUT 404, DELETE 204 + DB check)
- `tests/integration/schedule-replace.test.ts` (Risk #2: happy path + spyOn failure path)
- `supabase/seed.sql` (empty), `.gitignore` update, `.env.example` update, npm scripts

**Out of scope:**
- CI wiring (Phase 4 of test-plan rollout)
- Tests for auth pages (signin/signup/confirm-email) — excluded in test-plan §7
- Risks #3, #5, #6 — other phases
- MSW network mocks

## Architecture / Approach

Two test patterns in parallel:

**HTTP-based (Risks #1 and #4):** Vitest `globalSetup` starts `astro dev --port 4322` and polls until ready. Tests use native Node `fetch()`. Auth cookies obtained by calling `POST /api/auth/signin` on the running server. Prerequisite: `.dev.vars` must point to local Supabase.

**Service-direct (Risk #2):** Test code imports `generateAndPersistSchedule` and `@supabase/supabase-js` directly. Creates an authenticated client via `signInWithPassword`. Uses a `vi.spyOn` call-count pattern to intercept the second `from("schedule_assignments")` call (the INSERT), letting the DELETE hit the real DB, then asserts 0 rows afterward via the admin client.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Infrastructure | `vitest.workspace.ts`, `admin.ts` helper, npm scripts, seed.sql, .env.test template | `.dev.vars` must be re-pointed to local Supabase before tests run |
| 2. Risk #4 tests | `api-auth.test.ts` + Astro server globalSetup | Astro server needs valid local Supabase config in `.dev.vars` |
| 3. Risk #1 tests | `rls-isolation.test.ts` two-user isolation via HTTP | Silent-204 on DELETE needs DB-state assertion, not just HTTP check |
| 4. Risk #2 tests | `schedule-replace.test.ts` happy + failure path | `vi.spyOn` call-count pattern must intercept 2nd `from()` call, not 1st |
| 5. Cookbook docs | `test-plan.md §6.2` and `§6.4` filled in | None |

**Prerequisites:** `supabase start` running; `.env.test` populated from `supabase status`; `.dev.vars` using local Supabase URL.  
**Estimated effort:** ~2–3 sessions across 5 phases.

## Open Risks & Assumptions

- The Astro dev server startup time on the CI machine (Phase 4, future) may exceed the 30 s timeout — increase if needed
- The `vi.spyOn` call-count pattern assumes `generateAndPersistSchedule` always calls `from("schedule_assignments")` exactly twice; if the function is refactored to use a transaction/RPC, the failure-path test will need updating (but the risk itself will be resolved)
- Tests use `@test.local` email addresses to avoid accidental collisions with real accounts; the local Supabase ignores email validation by default

## Success Criteria (Summary)

- `npm run test:integration` produces 10+ passing assertions with no failures against a clean local Supabase
- `npm run test:unit` remains unaffected (still runs Phase 1 unit tests only, no server startup)
- A developer can add a new API endpoint and know exactly how to test its auth guard from `test-plan.md §6.4`
