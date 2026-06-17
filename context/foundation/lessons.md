# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use local date for day comparisons in client components

**Context**: `src/components/TodayView.tsx:9`

**Problem**: `new Date().toISOString().split("T")[0]` returns the UTC date. A parent in Poland (UTC+2 in summer) at 11 PM will see the next calendar day's tasks as "today".

**Rule**: Always use `getTodayLocal()` from `@/lib/date` (`Intl.DateTimeFormat("en-CA").format(new Date())`) for local calendar date strings in client code; never `toISOString().split("T")[0]`. The same pattern applies to server-side date helpers that set local midnight via `setHours(0,0,0,0)` before serialising — use `Intl.DateTimeFormat("en-CA").format(date)` there too.

**Applies to**: Any component or service that compares a date string to "today" or stores a date derived from local midnight. The `toISOString()` approach is only safe when the runtime is guaranteed UTC (e.g. Cloudflare Workers in production) — local dev machines in non-UTC zones will produce off-by-one dates.
