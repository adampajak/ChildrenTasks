# Testing Bootstrap + Scheduler Unit Tests — Plan Brief

> Full plan: `context/changes/testing-bootstrap-scheduler/plan.md`
> Research: `context/changes/testing-bootstrap-scheduler/research.md`

## What & Why

Bootstrap Vitest and write the first unit tests for this project: Risk #3 (scheduler constraint
violations) and Risk #6 (UTC vs local date bug). Phase 1 of the quality rollout requires automated
proof that the scheduler never assigns a chore to an ineligible child and that the "today" date
function returns the local calendar date, not the UTC date.

## Starting Point

No test runner, no test files, no test configuration exist. Two pure functions are the test
targets: `generateSchedule()` (already exported, no DB dependency) and the inline date expression
in TodayView (correct but not yet extractable — it lives inside the component).

## Desired End State

`npm run test:run` exits 0 with three tests passing across two new files:
`src/lib/__tests__/date.test.ts` (timezone regression test) and
`src/lib/services/__tests__/scheduler.test.ts` (age/time constraint happy path + no-eligible-child
warning). The date expression is extracted to `src/lib/date.ts` and shared by TodayView and
ChildDayView. Cookbook §6.1 and the lessons.md rule are complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test file location | Co-located `__tests__/` | Vitest convention; scales to Phase 3 component tests naturally | Plan |
| Timezone simulation | `test.env: { TZ: 'Europe/Warsaw' }` in vitest.config.ts + `vi.setSystemTime()` | `Intl.DateTimeFormat` reads TZ at worker-spawn time; must be set before tests run, not inside them | Research + Plan |
| Risk #3 scope | Happy path + no-eligible-child warning | Minimum the test plan requires; time-exhaustion deferred | Plan |
| Extraction scope | Both TodayView and ChildDayView | Identical inline expressions in both; one canonical function eliminates drift risk | Plan |
| Coverage tooling | Defer to Phase 4 | Test-plan scopes quality gates wiring to Phase 4 | Research |
| lessons.md completion | In scope (Phase 4) | Closes a `[placeholder]` that appears in every future agent's context | Plan |

## Scope

**In scope:**
- Vitest install + `vitest.config.ts` with `@/` alias and Warsaw timezone
- `src/lib/date.ts` — extracted `getTodayLocal()` function
- TodayView and ChildDayView updated to use `getTodayLocal()`
- `src/lib/__tests__/date.test.ts` — Risk #6 timezone unit test
- `src/lib/services/__tests__/scheduler.test.ts` — Risk #3 constraint unit tests
- `context/foundation/lessons.md` — complete rule body
- `context/foundation/test-plan.md §6.1` — cookbook entry

**Out of scope:**
- React component tests (Phase 3), integration/DB tests (Phase 2)
- Coverage tooling, CI YAML (Phase 4)
- `WeekView.tsx` date arithmetic (not the UTC bug), `getWeekStartDate()` testing, fairness rule testing

## Architecture / Approach

Vitest runs as a standalone node process with the `@/` alias resolving to `./src`. No Astro plugin
is needed because the test targets are pure TypeScript functions with no Astro imports. The Warsaw
timezone is applied globally via `test.env` in `vitest.config.ts`, making it a one-time config
rather than per-test boilerplate. `getTodayLocal()` is a one-line extraction — the risk is in
testing it correctly (timezone sim), not in writing the function itself.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest Bootstrap | `npm run test:run` exits 0, runner configured | `@/` alias misconfiguration causes all imports to fail |
| 2. Extract + Risk #6 test | `getTodayLocal()` extracted and proven timezone-correct | `vi.setSystemTime()` without `TZ` env set → test passes with old UTC bug (false green) |
| 3. Risk #3 scheduler tests | Constraint + warning tests green | Test inputs not representative → happy path never exercises the constraint |
| 4. Cleanup + cookbook | lessons.md complete, §6.1 filled | Trivial — no code risk |

**Prerequisites:** None — Phase 1 starts from a clean slate.  
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- `test.env: { TZ: 'Europe/Warsaw' }` in Vitest relies on Node.js v17+ dynamic TZ support.
  Node.js v22.14.0 (per `.nvmrc`) supports this reliably.
- `Intl.DateTimeFormat("en-CA")` returns CEST (UTC+2) in summer and CET (UTC+1) in winter for
  `Europe/Warsaw`. The test uses a July date (CEST = UTC+2), so the mock clock must be set to
  `22:30 UTC` (not `23:30 UTC`) to land at `00:30` local time on the next calendar day.

## Success Criteria (Summary)

- `npm run test:run` exits 0 with three named tests passing
- `getTodayLocal()` test fails if the old `toISOString()` pattern is substituted in — it is a
  real regression detector, not a tautology
- No regression in TodayView or ChildDayView rendering
