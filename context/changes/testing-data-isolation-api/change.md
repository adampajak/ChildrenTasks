---
change_id: testing-data-isolation-api
title: Phase 2 integration tests — data isolation and API auth
status: implementing
created: 2026-06-17
updated: 2026-06-17
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md:
"Data isolation + API auth".
Risks covered: #1 (RLS cross-family data isolation), #2 (non-atomic schedule replace), #4 (API endpoints unauthenticated access).
Test types planned: integration tests (real local Supabase instance, real HTTP requests).
Risk response intent:
- Risk #1: prove Parent A cannot GET or mutate Parent B's children, chores, or schedule
  via any API endpoint even with a valid auth session; challenge "RLS is enabled" —
  the policy may still allow SELECT without a user_id filter.
- Risk #2: prove a parent with valid children + chores always gets a non-empty schedule
  after Generate; a simulated DB insert failure mid-batch does not leave an empty week;
  challenge "Generate works in manual testing" — manual tests never trigger a DB failure
  mid-replace.
- Risk #4: prove HTTP requests to /api/children, /api/chores, and /api/schedule without
  a valid auth cookie return 401 or 403 — not data; challenge "middleware handles auth
  for all routes" — middleware may redirect page routes but leave /api/* unguarded.
