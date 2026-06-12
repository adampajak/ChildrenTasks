<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Schedule Generation

- **Plan**: `context/changes/schedule-generation/plan.md`
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Non-atomic schedule replace (delete then insert)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/scheduler.service.ts:154–180`
- **Detail**: `generateAndPersistSchedule` deletes all current-week assignments then inserts new rows as two separate Supabase calls with no transaction. If the insert fails (network hiccup, constraint violation), the delete has already committed — the user ends up with an empty schedule and no error visible in the UI beyond a generic 500.
- **Fix A ⭐ Recommended**: Insert-then-delete swap — reorder to insert first; if insert succeeds, delete old rows. A partial failure leaves old data in place rather than nothing.
  - Strength: Zero new infrastructure; 4-line reorder. Old data is always a safe fallback.
  - Tradeoff: Brief window where old + new rows coexist — acceptable since GET /api/schedule re-fetches after generate() resolves.
  - Confidence: HIGH — trivial reorder, no API contract change.
  - Blind spot: Insert could still fail after partial batch write; for this data volume negligible.
- **Fix B**: Wrap in a Postgres RPC function — move delete+insert into a server-side SQL function called via `supabase.rpc()` for true atomicity.
  - Strength: True transaction — either everything succeeds or nothing changes.
  - Tradeoff: Requires a new migration + RPC function; disproportionate to MVP risk level.
  - Confidence: MEDIUM — correct but over-engineered for household scale.
  - Blind spot: RPC would need its own RLS or security definer grant.
- **Decision**: DEFERRED — add to roadmap (schedule-generation-v2)

### F2 — toView() has no null guard on joined child/chore

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/scheduler.service.ts:112–125`
- **Detail**: `toView()` accesses `row.children.name` and `row.chores.name` without null checks. In normal operation RLS prevents soft-deleted records from appearing — but if a join returns null for any reason, the function throws a null-dereference, producing a 500 on `GET /api/schedule` with no diagnostic.
- **Fix**: Add fallback strings: `child_name: row.children?.name ?? "(deleted)"`, `chore_name: row.chores?.name ?? "(deleted)"`, `chore_time: row.chores?.min_time_to_complete ?? 0`.
- **Decision**: SKIPPED

### F3 — TodayView "today" uses UTC, not local date

- **Severity**: 👀 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/TodayView.tsx:9`
- **Detail**: `new Date().toISOString().split("T")[0]` returns the UTC date. Both server and client use UTC so assignments are internally consistent, but a parent in Poland (UTC+2 in summer) at 11 PM will see the next calendar day's tasks as "today".
- **Fix**: Replace with `new Intl.DateTimeFormat('en-CA').format(new Date())` which returns the local calendar date in YYYY-MM-DD format. Only the client-side filter changes; stored dates are unaffected.
- **Decision**: FIXED + ACCEPTED-AS-RULE — use Intl.DateTimeFormat("en-CA").format(new Date()) for local calendar dates in client components

### F4 — Algorithm front-loads chores to start of week

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/scheduler.service.ts:65–95`
- **Detail**: The day-scan loop always starts at index 0 (Monday), so chores are preferentially placed Mon/Tue/Wed before Thu–Sun. A 3×/week chore always lands Mon/Tue/Wed rather than distributing across the week. Consistent with the PRD's greedy approach, but could feel unbalanced in practice.
- **Fix**: No fix required unless distribution across days becomes a user-facing complaint. Could be addressed in a future `schedule-generation-v2` change.
- **Decision**: DEFERRED — add to roadmap (schedule-generation-v2)
