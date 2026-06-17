# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-17 (Phase 1 change opened)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` — 20 commits / 30 days.

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|-------------------------------|
| 1 | Parent A reads or mutates Parent B's children, chores, or schedule via a missing or misconfigured RLS policy | High | Medium | PRD §Data isolation NFR, interview Q1, AGENTS.md (RLS mandatory on every table) |
| 2 | Schedule generation leaves an empty week — non-atomic replace deletes the old schedule before inserting the new one; a failed insert leaves nothing | High | Medium | roadmap TD-01, PRD §Business Logic + §Success Criteria |
| 3 | Generated schedule assigns a chore to a child below the age threshold, or exceeds a child's daily time budget — "zero violations" is the primary success criterion | High | Medium | PRD §Success Criteria "zero violations", PRD §Business Logic, roadmap S-03 risk note |
| 4 | API endpoint (`/api/children`, `/api/chores`, `/api/schedule`) returns data to an unauthenticated request — middleware guards page routes via PROTECTED_ROUTES but API routes may not independently check the session | Medium | Low-Medium | PRD §Access Control "Unauthenticated access: redirect to login", hot-spot `src/middleware.ts` (4 commits/30d) |
| 5 | UI regression in an interactive component — a change to TodayView, WeekView, or ChildDayView silently breaks an existing flow (toggle gone, child filter fails, Generate button missing) | Medium | High | interview Q3, hot-spot dir `src/components` (57 commits/30d), hot-spot `src/components/TodayView.tsx` (4 commits/30d) |
| 6 | TodayView shows the wrong day's tasks after ~22:00 local time — UTC vs local date bug; documented in lessons.md but no automated enforcement exists | Medium | Low-Medium | `context/foundation/lessons.md`, hot-spot `src/components/TodayView.tsx` (4 commits/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|-----------------|------------------------------------- |-----------------------|-----------------------|
| #1 | Parent A cannot GET or mutate Parent B's resources via any API endpoint, even with a valid auth session | "RLS is enabled on the table" — the policy may still allow SELECT without a `user_id` filter | Which tables carry RLS; what each SELECT / INSERT / UPDATE / DELETE policy actually checks | Integration test (real Supabase local instance) | Mock the DB — mocked tests stay green while the real RLS policy is absent or wrong |
| #2 | A parent with valid children + chores always gets a non-empty schedule after Generate; a simulated DB insert failure mid-batch does not leave an empty week | "Generate works in manual testing" — manual test never triggers a DB failure mid-replace | The delete-before-insert order in the scheduler service; what the service does when the insert batch throws | Integration test (real DB with simulated insert failure) | Unit test with a mocked DB that always succeeds — the failure path requires a real DB error |
| #3 | Every assignment in a generated schedule satisfies age eligibility AND time budget; the edge case "no eligible child on a given day" produces a warning rather than a silent skip | "The algorithm is deterministic so it must be correct" — deterministic code still violates invariants on edge-case inputs | The eligibility filter logic, time-budget decrement per day, day-scan order, what the algorithm emits when no child qualifies | Unit test (pure function, no DB needed) | Test only the happy path where all children are eligible and no time conflicts occur |
| #4 | An HTTP request to `/api/children`, `/api/chores`, and `/api/schedule` without a valid auth cookie returns 401 or 403 — not data | "Middleware handles auth for all routes" — middleware may redirect page routes but leave `/api/*` unguarded | Whether each API route reads `context.locals.user` and rejects null before querying the DB | Integration test (HTTP request without auth cookie) | Test only the middleware page-redirect behavior, not the API endpoint directly |
| #5 | TodayView renders the correct task list with completion toggles; ChildDayView filters to the correct child; WeekView renders without a crash when given realistic assignment data | "It looks right in the browser" — browser checks are not reproducible regressions | The props contract of each component; what `useSchedule()` returns; how assignments map to rendered items | Component unit test (React Testing Library + Vitest + jsdom) | Snapshot test — breaks on every styling tweak, catches nothing behaviorally meaningful |
| #6 | TodayView passes the local calendar date (not UTC) to the "is this today?" comparison; a test simulating 23:00 UTC while the local timezone is UTC+2 gets the correct local date | "`toISOString()` gives the same date as local time" — it does not when the offset pushes the UTC clock past midnight | The date utility or expression used in each client component that compares to "today" | Unit test (pure date function, locale-aware) | Test only at noon — the bug only manifests late evening in non-UTC timezones |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|---------------|
| 1 | Bootstrap + scheduler unit tests | Stand up Vitest; prove the scheduler's constraint rules and the local-date function with pure-function unit tests | #3, #6 | unit | change opened | context/changes/testing-bootstrap-scheduler |
| 2 | Data isolation + API auth | Integration tests against local Supabase: RLS cross-family isolation, non-atomic schedule replace failure, API endpoints reject unauthenticated requests | #1, #2, #4 | integration | not started | — |
| 3 | UI component smoke tests | React component tests for TodayView, WeekView, ChildDayView — catch silent regressions in interactive flows | #5 | component (RTL + jsdom) | not started | — |
| 4 | Quality gates wiring | Add unit + integration + component test steps to CI; add pre-commit typecheck hook | cross-cutting | CI / gates | not started | — |

---

## 4. Stack

The classic test base for this project. No test runner is installed yet
(test-base profile: `none`); Phase 1 bootstraps the runner.
AI-native tools are not planned — the risk set is covered by deterministic
classic tests at lower cost.

| Layer | Tool | Notes |
|-------|------|-------|
| Unit + integration + component | Vitest (none yet — see §3 Phase 1) | Natural choice: Astro 6 is Vite-powered; Vitest shares the Vite config and supports jsdom/happy-dom for React component tests |
| React component testing | @testing-library/react (none yet — see §3 Phase 1) | Pairs with Vitest; avoids snapshot-only patterns |
| DOM environment | jsdom or happy-dom (none yet — see §3 Phase 1) | Required by @testing-library/react in Vitest; happy-dom is faster for simple tests |
| API mocking | MSW (none yet — see §3 Phase 2) | Intercepts fetch at the network edge; does not mock internal modules |
| E2e | not planned in this rollout | Infrastructure cost exceeds signal for current risk set; reconsider on `--refresh` if manual smoke testing becomes a bottleneck |

**Stack grounding tools (current session):**
- Docs: none — no Context7 or framework-docs MCP available in this session; checked: 2026-06-17
- Search: none — no Exa.ai or web-search MCP available in this session; checked: 2026-06-17
- Runtime/browser: none — no Playwright MCP in this session; checked: 2026-06-17
- Provider/platform: microsoft-learn MCP present (Microsoft/Azure docs only, not relevant for Astro/Vitest stack); Figma MCP present (not relevant); checked: 2026-06-17

---

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired in CI) | syntactic / type drift |
| unit + integration tests | local + CI | required after §3 Phase 1 | scheduler constraint violations, data isolation gaps, unauthenticated API access |
| component tests | local + CI | required after §3 Phase 3 | silent UI regressions in interactive components |
| pre-commit typecheck hook | local | recommended after §3 Phase 4 | type errors caught before commit |
| e2e on critical flows | CI on PR | not planned (see §7) | full user-path regressions |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test (pure function)

**File location**: `src/<area>/__tests__/<source>.test.ts`, co-located with the source file.
Examples: `src/lib/__tests__/date.test.ts` for utilities in `src/lib/`, `src/lib/services/__tests__/scheduler.test.ts` for services.

**Naming convention**: `describe` block = function name; `it` block = "returns X given Y" / "emits Z when N".

**Timezone note**: All unit tests run under `TZ=Europe/Warsaw` (set in `vitest.config.ts` via `test.env`). For time-sensitive tests, pin the clock with `vi.useFakeTimers()` + `vi.setSystemTime(new Date("...Z"))` and restore it in `afterEach(() => vi.useRealTimers())`.

**Run command**: `npm run test:run` (single pass) or `npm run test` (watch mode).

**Reference tests**:
- `src/lib/__tests__/date.test.ts` — date utility with fake-timer timezone simulation (Risk #6)
- `src/lib/services/__tests__/scheduler.test.ts` — pure service function with invariant + edge-case assertions (Risk #3)

### 6.2 Adding an integration test (RLS / API)

TBD — see §3 Phase 2. Will cover: cross-family data isolation, unauthenticated API request rejection.

### 6.3 Adding a component test (React)

TBD — see §3 Phase 3. Will cover: TodayView, WeekView, ChildDayView with realistic assignment data.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 2. Pattern: send HTTP request without / with auth cookie; assert response status and body shape; check that a second user's data is not present in the response.

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5).

- **External infrastructure (Supabase, Cloudflare Workers)** — we trust the vendor; testing the platform itself adds no signal and breaks on infra changes. Re-evaluate if we fork or self-host any of these. (Source: interview Q5.)
- **Generated TypeScript types/clients** — the generator is the test; checking its output is an implementation mirror. Re-evaluate if we swap the generator. (Source: interview Q5 + implied by Supabase type generation pattern.)
- **Auth pages (sign-in, sign-up, confirm-email)** — these delegate entirely to Supabase Auth; functional testing of the Supabase flow is the vendor's responsibility. We do test that our middleware correctly rejects unauthenticated requests to our own API (Risk #4). (Source: interview Q5.)
- **E2e / browser automation** — infrastructure cost exceeds signal for the current risk set; all top risks are covered by cheaper deterministic layers. Re-evaluate on `--refresh` when manual smoke testing becomes a bottleneck.

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-17
- Stack versions last verified: 2026-06-17
- AI-native tool references last verified: n/a (no AI-native layer planned)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
