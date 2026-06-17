# Testing Bootstrap + Scheduler Unit Tests — Implementation Plan

## Overview

Bootstrap Vitest from zero, extract `getTodayLocal()` into a testable pure function, and write
the Risk #3 (scheduler constraint) and Risk #6 (UTC vs local date) unit tests that Phase 1 of
the quality rollout requires.

## Current State Analysis

No test runner, test files, or test configuration exist. The two test targets are:

- `generateSchedule()` at `src/lib/services/scheduler.service.ts:30–104` — already an exported
  pure function; takes `Child[]`, `Chore[]`, `Date`; returns `{ assignments, warnings }`. No DB,
  no mocks required.
- The "today" date expression at `src/components/TodayView.tsx:13` — correct
  (`Intl.DateTimeFormat("en-CA")`) but inline in the component. Must be extracted to a standalone
  function before a unit test can be written.

### Key Discoveries

- `scheduler.service.ts` imports `listChildren`/`listChores` at the top level, but
  `generateSchedule()` never calls them. The import chain never reaches `astro:env/server`, so no
  virtual-module mocking is needed in `vitest.config.ts`. Only the `@/` path alias must be
  configured.
- `ChildDayView.tsx:10` has the identical inline date expression as `TodayView.tsx:13`; both
  will be updated to import `getTodayLocal()` from `src/lib/date.ts`.
- The bug scenario: in Central European Summer Time (CEST, UTC+2), at 22:30 UTC it is already
  00:30 the **next** calendar day locally. The old `toISOString().split("T")[0]` returned the UTC
  date (the previous day); `Intl.DateTimeFormat("en-CA")` returns the correct local date.
- `Intl.DateTimeFormat` reads the process timezone from the `TZ` environment variable. Since this
  must be set before the process starts (or at worker-spawn time), it is set via
  `test.env: { TZ: 'Europe/Warsaw' }` in `vitest.config.ts`, which Vitest applies to every worker
  before any test file is imported.

## Desired End State

`npm run test:run` exits 0 with tests in two files passing:

- `src/lib/__tests__/date.test.ts` — `getTodayLocal()` returns the correct local calendar date
  when the clock is simulated at 22:30 UTC in the `Europe/Warsaw` timezone (00:30 local next day),
  proving the function does not use UTC.
- `src/lib/services/__tests__/scheduler.test.ts` — every assignment in the happy-path output
  satisfies the age and time constraint invariants; the no-eligible-child scenario returns
  `assignments: []` with a warning of `placed: 0`.

`getTodayLocal()` is extracted to `src/lib/date.ts` and imported by both TodayView and
ChildDayView. `context/foundation/lessons.md` has a complete rule body.
`context/foundation/test-plan.md §6.1` documents the cookbook pattern so future contributors
know where to add unit tests and how to run them.

### Key Discoveries (reiterated for the implementer)

- `src/lib/services/scheduler.service.ts:9` — `AGE_ORDER: { small: 0, medium: 1, large: 2 }` is
  the constant that drives eligibility. Tests use it as the expected invariant.
- `src/lib/services/scheduler.service.ts:98–100` — warnings are emitted only when
  `slotsPlaced < needed` (chore-level, not day-level). A day skip is silent; an under-placed chore
  is always surfaced.
- `src/types.ts:1–47` — `Child.available_time` is `Record<string, number>` keyed by day abbreviation
  (`mon`…`sun`). Chore time is `min_time_to_complete` (number, minutes). Tests use these field
  names directly.

## What We're NOT Doing

- No React component tests — Phase 3.
- No integration or DB tests — Phase 2.
- No coverage tooling (`@vitest/coverage-v8`) — Phase 4.
- No testing of `getWeekStartDate()` or the fairness rule (lines 78–79) — not required by the
  Phase 1 risk map.
- No `WeekView.tsx` changes — `addDaysToDateStr` uses `Date.UTC` for pure date arithmetic, not a
  "today" comparison; it is not the UTC bug documented in lessons.md.
- No CI YAML changes — Phase 4.

## Implementation Approach

Install Vitest as a standalone runner (no Astro plugin needed for pure-function tests). Configure
it with the `@/` path alias and `test.env: { TZ: 'Europe/Warsaw' }` so every worker runs in a
consistent timezone. Extract the inline date expression to `src/lib/date.ts` before writing its
test — without the extraction, there is nothing to import in the test file. Write scheduler tests
with plain object literals; no fixtures or factories are needed for these two scenarios.

## Critical Implementation Details

**Timezone scope**: All tests run under `TZ=Europe/Warsaw` (set via `test.env` in
`vitest.config.ts`). This is safe — the scheduler's `toISODate()` uses `toISOString()` (UTC) and
is not affected; only `Intl.DateTimeFormat` is TZ-sensitive. The `vi.setSystemTime()` call in the
date test controls what `new Date()` returns; `test.env.TZ` controls how `Intl.DateTimeFormat`
formats that instant. Both must be in place for the test to catch the real regression.

---

## Phase 1: Vitest Bootstrap

### Overview

Install Vitest, create `vitest.config.ts`, and add test scripts to `package.json`. After this
phase, `npm run test:run` starts and exits 0 with zero test files (runner is alive, nothing fails
yet).

### Changes Required

#### 1. Install Vitest

**File**: `package.json` (devDependencies)

**Intent**: Add Vitest as the sole new devDependency. Phase 1 tests are pure-function unit tests
that need no DOM, no React test utilities, and no other test tooling.

**Contract**: Add `"vitest"` to `devDependencies`. Version: latest stable (`^3.x` at time of
writing, but use `npm install vitest --save-dev` to get the current latest).

#### 2. Create vitest.config.ts

**File**: `vitest.config.ts` (project root, new file)

**Intent**: Configure the test environment with the `@/` path alias (matching `tsconfig.json`
`paths`) and the Warsaw timezone so all workers run consistently.

**Contract**: The config must set `environment: 'node'`, `env: { TZ: 'Europe/Warsaw' }`, and a
`resolve.alias` mapping `@` to `./src`. The `path.resolve(__dirname, './src')` form (not the bare
string `'./src'`) is required because Vitest resolves aliases relative to the config file, not the
project root.

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    env: { TZ: 'Europe/Warsaw' },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

#### 3. Add test scripts

**File**: `package.json` (scripts)

**Intent**: Expose `npm run test` (watch mode for local development) and `npm run test:run`
(single-pass for CI).

**Contract**: Add `"test": "vitest"` and `"test:run": "vitest run"` to the `scripts` object.
No `TZ=` prefix in the script — timezone is handled by `vitest.config.ts`.

### Success Criteria

#### Automated Verification

- `npm run test:run` exits 0 (no test files yet; Vitest starts cleanly)
- `npm run lint` exits 0 (vitest.config.ts passes ESLint)
- `npm run build` exits 0 (vitest is devDependency only, not in production bundle)

#### Manual Verification

- `npm run test` starts the Vitest watch server in the terminal without errors

**Implementation Note**: Pause here once automated checks pass, confirm the watcher starts, then
proceed to Phase 2.

---

## Phase 2: Extract `getTodayLocal()` and Write the Risk #6 Test

### Overview

Create `src/lib/date.ts` with an exported `getTodayLocal()` function, update TodayView and
ChildDayView to import from it, then write the timezone unit test.

### Changes Required

#### 1. Create `src/lib/date.ts`

**File**: `src/lib/date.ts` (new file)

**Intent**: Give the inline date expression in TodayView/ChildDayView a home so it can be
imported in tests and is not duplicated across components.

**Contract**: Export one function, `getTodayLocal(): string`, that returns the current local
calendar date as a `YYYY-MM-DD` string using `Intl.DateTimeFormat("en-CA").format(new Date())`.
No parameters, no side effects.

#### 2. Update TodayView

**File**: `src/components/TodayView.tsx:13`

**Intent**: Replace the inline date expression with a call to `getTodayLocal()` from
`src/lib/date.ts`.

**Contract**: Import `getTodayLocal` from `@/lib/date`; replace the right-hand side of the
`today` const assignment on line 13 with `getTodayLocal()`. The assignment on line 14 that uses
`today` is unchanged.

#### 3. Update ChildDayView

**File**: `src/components/ChildDayView.tsx:10`

**Intent**: Same extraction as TodayView — ChildDayView has the identical inline expression.

**Contract**: Import `getTodayLocal` from `@/lib/date`; replace the right-hand side of its
`today` const (line 10) with `getTodayLocal()`.

#### 4. Write the date unit test

**File**: `src/lib/__tests__/date.test.ts` (new file)

**Intent**: Prove that `getTodayLocal()` returns the LOCAL calendar date, not the UTC date, at
the exact point where the old `toISOString()` pattern would return the wrong answer.

**Contract**: One test, using `vi.useFakeTimers()` + `vi.setSystemTime()` to pin the clock to
`2024-07-15T22:30:00.000Z` (22:30 UTC summer = 00:30 CEST local next day). Expected return value:
`"2024-07-16"`. Restore real timers in `afterEach`. Import `describe`, `it`, `expect`,
`vi`, `afterEach` from `vitest`.

```typescript
// Shape of the test — not the full file
vi.setSystemTime(new Date('2024-07-15T22:30:00.000Z'))
expect(getTodayLocal()).toBe('2024-07-16')
```

### Success Criteria

#### Automated Verification

- `npm run test:run` exits 0 with the date test passing
- `npm run lint` exits 0 (new files pass ESLint + Prettier)
- TypeScript check passes (`npm run build` exits 0 — Astro's build typehecks all `src/` files)

#### Manual Verification

- TodayView still renders today's tasks correctly in `npm run dev` (no regression from the
  extraction)
- ChildDayView still filters to the correct child on the day view

**Implementation Note**: Pause here, confirm the test output shows the date test passing, and
verify TodayView/ChildDayView work in the browser before proceeding.

---

## Phase 3: Scheduler Constraint Tests

### Overview

Write two test scenarios for `generateSchedule()` in a new co-located test file: a happy-path
invariant check and a no-eligible-child warning edge case.

### Changes Required

#### 1. Write the scheduler test file

**File**: `src/lib/services/__tests__/scheduler.test.ts` (new file)

**Intent**: Prove the two things the risk map requires: (a) every generated assignment satisfies
the age-eligibility and time-budget invariants; (b) when no child qualifies for a chore's entire
week, the algorithm surfaces it in `warnings` with `placed: 0` rather than silently skipping.

**Contract**: Two `it()` blocks inside one `describe('generateSchedule')`. Import
`generateSchedule` from `@/lib/services/scheduler.service` and the `Child`/`Chore` types from
`@/types`. Build test inputs as plain object literals — no factory helpers needed.

**Happy-path test inputs and assertions**:
- 2 children: one `age_category: "small"` with `available_time: 30 min/day`; one
  `age_category: "large"` with `available_time: 60 min/day`.
- 2 chores: one `age_category: "small"`, `min_time_to_complete: 20`, `min_weekly_frequency: 3`;
  one `age_category: "large"`, `min_time_to_complete: 30`, `min_weekly_frequency: 2`.
- `weekStartDate`: any Monday `new Date('2024-07-15')`.
- Assertions: `warnings` is empty; for each assignment, look up the assigned child and chore in
  the input arrays and assert `AGE_ORDER` (define it locally as `{ small: 0, medium: 1, large: 2 }`)
  satisfies `AGE_ORDER[child.age_category] >= AGE_ORDER[chore.age_category]`; accumulate assigned
  minutes per child per day and assert none exceeds `available_time[dayKey]`.

**No-eligible-child test inputs and assertions**:
- 1 child: `age_category: "small"`, `available_time: 60 min/day`.
- 1 chore: `age_category: "large"`, `min_weekly_frequency: 3`, `min_time_to_complete: 20`.
- Assertions: `assignments.length === 0`; `warnings` has exactly one entry with `placed: 0` and
  `needed: 3`.

### Success Criteria

#### Automated Verification

- `npm run test:run` exits 0 with all tests passing (date test + both scheduler tests)
- `npm run lint` exits 0

#### Manual Verification

- Test output in terminal names both scheduler scenarios and shows them green

**Implementation Note**: Pause here and confirm all tests pass and are named descriptively before
moving to cleanup.

---

## Phase 4: Cleanup and Cookbook

### Overview

Complete the `lessons.md` placeholder rule body and fill in `test-plan.md §6.1` with the cookbook
pattern so future contributors know how to add and run unit tests.

### Changes Required

#### 1. Complete lessons.md rule

**File**: `context/foundation/lessons.md`

**Intent**: The rule body currently contains `[your rule here — ...]` and
`[your scope here — ...]` placeholder text. Replace both with concrete text so future `/10x-plan`
and `/10x-research` agents read a complete rule rather than an unfilled template.

**Contract**: Replace the placeholder rule text with:
`"Always use getTodayLocal() from @/lib/date (Intl.DateTimeFormat('en-CA').format(new Date())) for local calendar date strings in client code; never toISOString().split('T')[0]."`.
Replace the placeholder scope text with:
`"Any client component that compares a date string to 'today'. Server-side date strings (scheduler.service.ts, stored in DB) use toISODate() via UTC — correct for Cloudflare Workers (UTC runtime) but not for browser-context callers."`.

#### 2. Update test-plan.md §6.1

**File**: `context/foundation/test-plan.md`

**Intent**: Fill in the `§6.1 Adding a unit test (pure function)` cookbook entry so it provides
the location, naming convention, and run command instead of "TBD — see §3 Phase 1."

**Contract**: Replace the TBD line under `### 6.1 Adding a unit test (pure function)` with a
completed cookbook entry covering: (a) file location (`src/<area>/__tests__/<source>.test.ts`
co-located with the source file), (b) naming convention (describe block = function name, it block
= "returns X given Y"), (c) timezone note (all tests run under `TZ=Europe/Warsaw` via
`vitest.config.ts`; use `vi.useFakeTimers()` + `vi.setSystemTime()` for time-sensitive tests),
(d) run command (`npm run test:run`), (e) reference tests: `src/lib/__tests__/date.test.ts` for
date utilities, `src/lib/services/__tests__/scheduler.test.ts` for pure service functions.

### Success Criteria

#### Manual Verification

- `context/foundation/lessons.md` has no placeholder text; rule body is a complete sentence
- `context/foundation/test-plan.md §6.1` has a filled cookbook entry with location, naming,
  timezone note, run command, and two reference test paths

---

## Testing Strategy

### Unit Tests

- `src/lib/__tests__/date.test.ts` — `getTodayLocal()`: one test at 22:30 UTC in Warsaw timezone
  proves local-date return. Covers Risk #6.
- `src/lib/services/__tests__/scheduler.test.ts` — `generateSchedule()`: happy-path invariant
  check (age + time constraints satisfied, warnings empty); no-eligible-child edge case (zero
  assignments, warning with placed: 0). Covers Risk #3.

### Manual Testing

1. After Phase 2: open `npm run dev`, navigate to dashboard; confirm TodayView shows today's tasks.
2. After Phase 3: run `npm run test:run` and read test output — all test names should be
   descriptive (`generateSchedule > assigns only age-eligible children`, etc.).

---

## References

- Research doc: `context/changes/testing-bootstrap-scheduler/research.md`
- Risk map and rollout phases: `context/foundation/test-plan.md §2–§3`
- Scheduler implementation: `src/lib/services/scheduler.service.ts:30–104`
- Type definitions: `src/types.ts`
- Lessons (UTC rule): `context/foundation/lessons.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm run test:run` exits 0 — 9cd1508
- [x] 1.2 `npm run lint` exits 0 — 9cd1508
- [x] 1.3 `npm run build` exits 0 — 9cd1508

#### Manual

- [x] 1.4 `npm run test` starts Vitest watch server without errors

### Phase 2: Extract getTodayLocal() and Write the Risk #6 Test

#### Automated

- [x] 2.1 `npm run test:run` exits 0 with date test passing — 7c022f8
- [x] 2.2 `npm run lint` exits 0 — 7c022f8
- [x] 2.3 `npm run build` exits 0 — 7c022f8

#### Manual

- [x] 2.4 TodayView renders today's tasks correctly in dev server — 7c022f8
- [x] 2.5 ChildDayView filters to correct child on day view — 7c022f8

### Phase 3: Scheduler Constraint Tests

#### Automated

- [x] 3.1 `npm run test:run` exits 0 with all tests passing (date + both scheduler tests) — 433a23f
- [x] 3.2 `npm run lint` exits 0 — 433a23f

#### Manual

- [x] 3.3 Test output names both scheduler scenarios and shows them green — 433a23f

### Phase 4: Cleanup and Cookbook

#### Manual

- [x] 4.1 `context/foundation/lessons.md` has no placeholder text; rule body is complete
- [x] 4.2 `context/foundation/test-plan.md §6.1` has a filled cookbook entry
