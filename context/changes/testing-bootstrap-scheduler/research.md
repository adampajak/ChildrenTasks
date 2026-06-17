---
date: 2026-06-17T00:00:00+02:00
researcher: Adam Pajak
git_commit: 31a62b921bd59f6cba46c83f02433e9e0fe80f86
branch: master
repository: ChildrenTasks
topic: "Phase 1 unit-test grounding: scheduler constraint logic and TodayView local-date function"
tags: [research, scheduler, date-handling, unit-tests, vitest, testing-bootstrap]
status: complete
last_updated: 2026-06-17
last_updated_by: Adam Pajak
---

# Research: Phase 1 unit-test grounding — scheduler constraints and local-date function

**Date**: 2026-06-17  
**Researcher**: Adam Pajak  
**Git Commit**: 31a62b921bd59f6cba46c83f02433e9e0fe80f86  
**Branch**: master  
**Repository**: ChildrenTasks

---

## Research Question

What are the exact testable units in the scheduler algorithm (Risk #3) and the TodayView date
logic (Risk #6), and what does the Vitest bootstrap for Phase 1 need to add?

---

## Summary

**Risk #3 — scheduler constraint violations**

`generateSchedule()` at `src/lib/services/scheduler.service.ts:30` is already an exported pure
function. It takes `Child[]`, `Chore[]`, and a `weekStartDate: Date`, never touches the DB, and
returns `{ assignments, warnings }`. It can be imported and tested directly with no mocks or
module aliases beyond the `@/` path alias.

The eligibility check is a two-part AND at lines 70–74: age (`AGE_ORDER[child] >= AGE_ORDER[chore]`)
AND time (`remainingTime[child][day] >= chore.min_time_to_complete`). An ineligible day is silently
skipped via `continue` (line 76); if a chore accumulates fewer placements than its
`min_weekly_frequency`, it is pushed to the `warnings` array (lines 98–100). This is the
mechanism the test plan's "unplaced chore list" refers to — individual day skips are silent but
chore-level failures are always surfaced in warnings.

**Risk #6 — UTC vs local date**

TodayView.tsx:13 already uses the correct pattern
(`new Intl.DateTimeFormat("en-CA").format(new Date())`). The date expression is inline in the
component; there is no shared `src/lib/date.ts`. Phase 1 must extract it into a pure function so
it can be unit-tested in isolation. The test needs to run with `TZ=Europe/Warsaw` and a mocked
`Date` set to 22:30 UTC (= 00:30 local Warsaw time) to prove the function returns the local date,
not the UTC date.

**Bootstrap**

No test runner, test files, or test config exist. Vitest is not installed. The import chain for
`generateSchedule()` is clean — `children.service.ts` and `chores.service.ts` do not reach
`astro:env/server`, so no virtual-module mocking is needed in `vitest.config.ts`. The only
required alias is `@/ → ./src/`.

---

## Detailed Findings

### 1. Scheduler algorithm — `generateSchedule()` (Risk #3)

**File**: [`src/lib/services/scheduler.service.ts`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts)

#### Exports available as pure functions

| Function | Lines | Signature | Notes |
|---|---|---|---|
| `generateSchedule` | 30–104 | `(children: Child[], chores: Chore[], weekStartDate: Date) → { assignments, warnings }` | **Primary test target.** No DB. |
| `getWeekStartDate` | 11–18 | `(date: Date) → Date` | Returns Monday of ISO week. Sets `setHours(0, 0, 0, 0)` (local midnight). |

Internal helpers (`toISODate`, `addDays`) are not exported.

#### Age eligibility

```typescript
// scheduler.service.ts:9
const AGE_ORDER: Record<"small" | "medium" | "large", number> = { small: 0, medium: 1, large: 2 };

// scheduler.service.ts:70–74
const eligible = children.filter(
  (c) =>
    AGE_ORDER[c.age_category] >= AGE_ORDER[chore.age_category] &&
    remainingTime[c.id][dayKey] >= chore.min_time_to_complete,
);
```

A child is eligible only if their age ordinal is **≥** the chore's age ordinal. A `"small"` child
cannot be assigned to a `"medium"` or `"large"` chore; a `"large"` child can do any chore. The
check is symmetric with the time check (same `filter` call) — you cannot fail one without the
other also being applied.

#### Time budget enforcement

```typescript
// scheduler.service.ts:44–56 — initialization
remainingTime[child.id] = {
  mon: child.available_time.mon,
  // … tue–sun
};

// scheduler.service.ts:73 — check (inside filter above)
remainingTime[c.id][dayKey] >= chore.min_time_to_complete

// scheduler.service.ts:84 — decrement on assignment
remainingTime[selected.id][dayKey] -= chore.min_time_to_complete;
```

The budget is decremented after each assignment. A child can receive multiple chores on the same
day as long as their cumulative `min_time_to_complete` stays within `available_time[dayKey]`.

#### Silent day-skip + warning on unplaced chore

```typescript
// scheduler.service.ts:76 — per-day silent skip
if (eligible.length === 0) continue;

// scheduler.service.ts:98–100 — chore-level warning
if (slotsPlaced < needed) {
  warnings.push({ chore_id: chore.id, chore_name: chore.name, placed: slotsPlaced, needed });
}
```

A day is skipped silently when no child qualifies. If a chore cannot reach its `min_weekly_frequency`
across all 7 days, it appears in `warnings`. So "no eligible child" for an entire week produces
`warnings[0] = { placed: 0, needed: N }`, not a thrown error. The test plan requirement —
"algorithm must emit a warning or unplaced chore list" — is already met by the current code; the
tests need to **verify** it.

#### Fairness rule (secondary constraint, also testable)

```typescript
// scheduler.service.ts:78–79
const preferred = eligible.filter((c) => lastAssignedDayIndex[c.id] !== dayIndex - 1);
const pool = preferred.length > 0 ? preferred : eligible;
```

Children assigned the day before are deprioritized. This is an implicit constraint that affects
which child receives a chore on a given day.

#### `generateSchedule` output shape

```typescript
// assignments[] entries (omit id, user_id, created_at, updated_at)
{
  week_start_date: string;   // YYYY-MM-DD — always Monday
  assignment_date: string;   // YYYY-MM-DD — specific day Mon–Sun
  child_id: string;          // UUID
  chore_id: string;          // UUID
}

// warnings[] entries
{
  chore_id: string;
  chore_name: string;
  placed: number;            // slots actually assigned
  needed: number;            // min_weekly_frequency required
}
```

---

### 2. TodayView date handling — Risk #6

**File**: [`src/components/TodayView.tsx`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/components/TodayView.tsx)

#### Current state: fix applied, no pure function yet

```typescript
// TodayView.tsx:13 — CORRECT pattern (fix already applied)
const today = new Intl.DateTimeFormat("en-CA").format(new Date());
// TodayView.tsx:14 — used for filtering
const todayAssignments = assignments.filter((a) => a.assignment_date === today);
```

The fix is in place but the expression is inline inside the component. There is no exported pure
function. Phase 1 must **extract** it into `src/lib/date.ts` → `getTodayLocal(): string` before a
unit test can be written.

#### Old pattern (what the fix replaced) — lessons.md context

`new Date().toISOString().split("T")[0]` returns UTC date. At 00:30 local time in `UTC+2`
(= 22:30 UTC previous day), `.toISOString()` produces the **previous** UTC date string — so
TodayView would show yesterday's tasks as "today". The fix swaps UTC for locale-aware formatting:
`Intl.DateTimeFormat("en-CA")` uses the system's local timezone and produces `YYYY-MM-DD`.

#### Other components

| File | Line | Pattern | Status |
|---|---|---|---|
| `src/components/TodayView.tsx` | 13 | `Intl.DateTimeFormat("en-CA").format(new Date())` | ✅ Correct |
| `src/components/ChildDayView.tsx` | 10 | `Intl.DateTimeFormat("en-CA").format(new Date())` | ✅ Correct |
| `src/components/WeekView.tsx` | 7–10 | `Date.UTC(…).toISOString().split("T")[0]` | ✅ Safe for pure date arithmetic (no local-time comparison) |

`WeekView`'s `addDaysToDateStr` uses `Date.UTC` for arithmetic on already-parsed YYYY-MM-DD
strings — this is safe because it never compares to local "today". It is not the UTC-vs-local bug.

#### `toISODate()` in `scheduler.service.ts`

```typescript
// scheduler.service.ts:20–22
function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}
```

This is server-side only. Cloudflare Workers runs in UTC, so `getWeekStartDate()`'s
`setHours(0, 0, 0, 0)` sets UTC midnight — `toISODate()` returns the correct date. This function
is not in scope for Phase 1 testing, but it **is** a latent risk if `generateSchedule()` is ever
called from a browser context.

---

### 3. Test infrastructure baseline

**File**: `package.json`

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write ."
}
```

No `"test"` script. No test-related devDependencies exist. No `vitest.config.*`, no `.test.*` /
`.spec.*` files, no `__tests__/` directory.

**TypeScript** (`tsconfig.json`) extends `astro/tsconfigs/strict`:

- `"jsx": "react-jsx"` + `"jsxImportSource": "react"` — React 19 JSX transform
- `"moduleResolution": "Bundler"` — Vite-style resolution
- `"paths": { "@/*": ["./src/*"] }` — alias used throughout codebase

**Vitest bootstrap minimum for Phase 1 pure-function tests**:

```
devDependencies to add:
  vitest

package.json scripts to add:
  "test": "vitest",
  "test:run": "vitest run"

vitest.config.ts to create:
  environment: 'node'      (no DOM for pure functions)
  resolve.alias: { '@': './src' }   (matches tsconfig paths)
  globals: true            (describe/it/expect without imports)
```

No `astro:env/server` mocking is needed. The import chain from
`scheduler.service.ts → children.service.ts` does **not** reach `astro:env/server`:
`children.service.ts` takes a `SupabaseClient` parameter rather than constructing one. The only
file that imports `astro:env/server` is `src/lib/supabase.ts`, which is not in the
`generateSchedule()` call path.

---

### 4. Historical context — archived schedule-generation change

**Archive**: `context/archive/2026-06-12-schedule-generation/`

Key decisions recorded:

- TD-01 (deferred): non-atomic replace — `delete` runs before `insert` in
  `generateAndPersistSchedule()` (lines 184–200 in current file). Fails silently mid-batch leaving
  an empty week. Recorded as deferred to a v2. **Not relevant to Phase 1 pure function tests.**
- F2 (skipped): `toView()` at lines 120–135 accesses `row.children.name` without null guard.
  Accepted as MVP risk.
- UTC date fix: applied in TodayView as part of the S-06 / task-completion slice; recorded in
  `lessons.md`. ChildDayView received the same fix.

---

## Code References

| Reference | Description |
|---|---|
| [`scheduler.service.ts:9`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L9) | `AGE_ORDER` constant — `{ small: 0, medium: 1, large: 2 }` |
| [`scheduler.service.ts:11–18`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L11-L18) | `getWeekStartDate()` — exported pure function; returns Monday of ISO week |
| [`scheduler.service.ts:20–22`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L20-L22) | `toISODate()` — internal; uses UTC (`toISOString`) — safe server-side only |
| [`scheduler.service.ts:30–104`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L30-L104) | `generateSchedule()` — primary test target; exported pure function |
| [`scheduler.service.ts:70–74`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L70-L74) | Combined age + time eligibility filter |
| [`scheduler.service.ts:76`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L76) | `if (eligible.length === 0) continue` — per-day silent skip |
| [`scheduler.service.ts:78–79`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L78-L79) | Fairness rule — deprioritize yesterday's assignees |
| [`scheduler.service.ts:84`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L84) | Time budget decrement per assignment |
| [`scheduler.service.ts:98–100`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/lib/services/scheduler.service.ts#L98-L100) | Warning pushed when chore under-placed |
| [`TodayView.tsx:13`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/components/TodayView.tsx#L13) | Correct local-date expression — needs extraction to `src/lib/date.ts` |
| [`TodayView.tsx:14`](https://github.com/adampajak/ChildrenTasks/blob/31a62b921bd59f6cba46c83f02433e9e0fe80f86/src/components/TodayView.tsx#L14) | Filter using today — `assignments.filter((a) => a.assignment_date === today)` |
| `src/types.ts:1–47` | `Child`, `Chore`, `ScheduleAssignment`, `ScheduleAssignmentView`, `ScheduleWarning` |

---

## Architecture Insights

**`generateSchedule()` is already test-ready as-is.** No refactoring is needed to test
age/time constraints — the function is pure, exported, and its dependencies (`Child[]`, `Chore[]`)
are simple plain objects defined in `src/types.ts`. Test data construction requires no factories.

**`getTodayLocal()` does not exist yet.** The date expression in TodayView:13 is inline. Phase 1
must create `src/lib/date.ts` with an exported `getTodayLocal(): string`, update TodayView to
import it, then test it. This is a one-line extraction.

**No virtual-module mocking is needed.** The `astro:env/server` virtual module (which Vitest
cannot resolve without the Astro Vite plugin) is only used by `src/lib/supabase.ts`. Neither
`generateSchedule()` nor any function in its import chain reaches `supabase.ts`. The vitest config
can be minimal.

**Timezone testing strategy.** `Intl.DateTimeFormat("en-CA")` uses the Node.js process timezone
(from the `TZ` environment variable). Running `TZ=Europe/Warsaw vitest run` makes the test
environment behave as if the system is in UTC+2 summer. Mocking `Date` via `vi.setSystemTime()`
then simulates a specific point in time. No timezone library is needed.

---

## Historical Context

- `context/archive/2026-06-12-schedule-generation/plan.md` — original implementation plan for
  the scheduler; TD-01 (non-atomic replace) deferred; F2 (null guard in toView) accepted.
- `context/foundation/lessons.md` — UTC-vs-local rule established; `Intl.DateTimeFormat("en-CA")`
  named as the canonical local-date idiom; rule body is incomplete (placeholder text) —
  Phase 1 plan should complete it.
- `context/archive/2026-06-12-task-completion/` — S-06 slice where the TodayView fix was applied;
  ChildDayView received the same fix in the same slice.

---

## Open Questions

1. **`getWeekStartDate` in browser context**: The function uses `setHours(0, 0, 0, 0)` (local
   midnight), then `toISODate()` converts via UTC. In a Warsaw browser at 23:30, local midnight
   for the next day = 22:00 UTC current day → `toISODate()` would return the wrong date. The
   function is currently only called server-side (Cloudflare Workers = UTC), so this is not an
   active bug, but it is a latent risk. Phase 1 plan should note whether to add a test or leave
   a comment. This is NOT required to address in Phase 1.

2. **`lessons.md` rule body incomplete**: The rule text in `context/foundation/lessons.md:10`
   still contains the placeholder `[your rule here — ...]`. Phase 1 plan should include
   completing this as a sub-task (one line of text, not test code).

3. **`@vitest/coverage-v8` or skip**: Whether to add coverage reporting in Phase 1 is a plan
   decision. Not a blocker; can be deferred to Phase 4 (quality gates wiring).
