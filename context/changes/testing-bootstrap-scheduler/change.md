---
change_id: testing-bootstrap-scheduler
title: Scheduler unit tests covering age/time constraints and UTC date correctness
status: implementing
created: 2026-06-17
updated: 2026-06-17
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md:
"Bootstrap + scheduler unit tests".
Risks covered: #3 (scheduler age/time constraint violations), #6 (UTC vs local date
bug in client components).
Test types planned: unit tests (pure functions, no DB needed).
Risk response intent:
- Risk #3: prove every generated assignment satisfies age eligibility AND time budget;
  prove the edge case "no eligible child" does not silently skip — algorithm must emit
  a warning or unplaced chore list.
- Risk #6: prove TodayView uses local calendar date, not UTC; test at simulated 23:00
  UTC+2 returns the correct local date, not the next day.
