# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use local date for day comparisons in client components

**Context**: `src/components/TodayView.tsx:9`

**Problem**: `new Date().toISOString().split("T")[0]` returns the UTC date. A parent in Poland (UTC+2 in summer) at 11 PM will see the next calendar day's tasks as "today".

**Rule**: [your rule here — e.g. "Always use Intl.DateTimeFormat('en-CA').format(new Date()) for local calendar date strings in client code; never toISOString().split('T')[0]"]

**Applies to**: [your scope here — e.g. "Any client component that compares a date string to 'today'"]
