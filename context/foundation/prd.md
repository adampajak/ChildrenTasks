---
project: "ChildrensTasks"
version: 1
status: draft
created: 2026-05-23
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget: # TODO: timeline_budget — see Open Questions
---

## Vision & Problem Statement

Managing recurring household chores for multiple children of different ages is a coordination problem: the parent must distribute tasks fairly while respecting each child's age-appropriate capabilities, available time (school, extracurriculars), and chore frequency requirements — all while ensuring chores actually get done (e.g., trash can't wait if the assigned child has activities that day).

Existing tools don't account for the interplay of age constraints, per-child time availability, chore frequency, AND fairness simultaneously. The real problem isn't tracking chores — it's generating a schedule that is both fair and executable given each child's actual calendar. Too much complexity in manual assignment leads to chores not getting done at all.

## User & Persona

### Primary persona

Parent of a specific multi-child household (building for own family first). Children range across age categories (małe <9, średnie 9-13, duże >14). The parent feels the pain daily when coordinating who does what, trying to be fair, and dealing with forgotten or impossible assignments.

## Success Criteria

### Primary
- A parent can define children and chores, generate a weekly schedule, and view today's tasks per child — proving the coordination problem is solved by automation.
- 75% of weekly chores are covered by the generated schedule.

### Secondary
- The generated schedule feels "fair" to the parent without needing manual override for most tasks.

### Guardrails
- Schedule never assigns a chore to a child below the chore's minimum age category.
- Schedule never exceeds a child's defined available time on any given day.

## User Stories

### US-01: Parent generates a fair weekly schedule

- **Given** a parent has defined 2+ children with ages and weekly availability, and 3+ chores with age categories and frequency
- **When** the parent triggers "Generate Schedule"
- **Then** the system produces a 7-day schedule where:
  - each chore appears at least its minimum frequency
  - no child is assigned a chore below their age category threshold
  - no child's daily tasks exceed their available time
  - chores are distributed across children with rough fairness (round-robin rotation)

#### Acceptance Criteria
- All constraints (age, time, frequency) are respected — zero violations
- Parent can see the full week or filter to today
- Parent can manually adjust any assignment after generation

## Functional Requirements

### Setup
- FR-001: Parent can create/edit/delete child profiles (name, age category, available time per weekday). Priority: must-have
  > Socrates: Counter-argument considered: "Age changes once a year — editable age adds UI complexity for rare changes." Resolution: kept; parent will update manually when needed, age category simplifies this.
- FR-002: Parent can create/edit/delete chores (name, age category [małe/średnie/duże], min weekly frequency, min time to complete). Priority: must-have
  > Socrates: Counter-argument considered: "Four fields per chore front-loads data entry." Resolution: changed numeric min age to age category (3 options) — simpler input.

### Schedule Generation
- FR-003: Parent can generate a weekly chore schedule based on children's constraints. Priority: must-have
  > Socrates: Counter-argument considered: "Auto-generation can feel like a black box." Resolution: kept with addition of FR-010 (manual correction after generation).
- FR-010: Parent can manually reassign or reschedule individual tasks after generation. Priority: must-have
  > Socrates: Counter-argument considered: "If parent routinely overrides, auto-generation loses value." Resolution: kept; manual correction makes it a tool, not a dictator.

### Views & Interaction
- FR-004: Parent can view today's tasks across all children (default), with option to see full weekly schedule. Priority: must-have
  > Socrates: Counter-argument considered: "Full-week view for 3+ children is overwhelming." Resolution: changed to today-first default, full week secondary.
- FR-006: Parent can switch to a child's view showing only that child's tasks for today. Priority: must-have
  > Socrates: Counter-argument considered: N/A — this replaced the dropped child-login FR.
- FR-007: Parent can mark a task as done (from any view). Priority: must-have
  > Socrates: Counter-argument considered: "Without child accounts, marking done has no integrity if child does it unsupervised." Resolution: changed to parent-only marking.

### Authentication
- FR-008: Parent can register/log in via email + password. Priority: must-have
  > Socrates: Counter-argument considered: "Building auth is infrastructure, not product value." Resolution: changed from magic link to simple email+password; password reset deferred.

## Non-Functional Requirements

- Data isolation: each family's data is strictly separated — no cross-family data leakage under any access path.
- Mobile-first UI: the interface renders well and is fully usable on mobile browsers (viewport ≥ 320px).

## Business Logic

The scheduler assigns each day's chores to age-eligible, time-available children while rotating assignments across days so no child carries consecutive-day workload.

**Inputs**: list of chores (each with age category, minimum weekly frequency, time required); list of children (each with age category, available time per weekday).

**Per-day assignment**: for each chore scheduled on a given day, filter eligible children (child's age category ≥ chore's age category AND child's remaining available time on that day ≥ chore's time requirement). Assign from the eligible pool.

**Cross-day fairness**: children who were assigned chores yesterday are deprioritized today. The algorithm rotates to avoid placing load on the same child on consecutive days.

**Output**: a 7-day schedule where each chore meets its minimum weekly frequency, no child is assigned beyond their daily time budget, and workload is spread across children with consecutive-day avoidance.

## Access Control

Login-based authentication via email + password. Single role model for MVP:

- **Parent**: full management — define children, define chores, generate schedules, view all perspectives, mark tasks as done, manually adjust assignments.
- **Child view**: read-only view of a single child's daily tasks, accessible via parent's session (parent switches to child perspective). No separate child accounts or credentials.

Unauthenticated access: redirect to login. No public routes.

## Non-Goals

- **No notifications or reminders** (push, email, SMS) — the parent checks the app manually; notification infrastructure is deferred.
- **No gamification / rewards / points system** — motivation comes from the schedule itself and parental oversight, not from in-app incentives.

## Open Questions

1. **What is the timeline budget (mvp_weeks, hard_deadline, after_hours_only)?** — TBD by user. Block: no (PRD is structurally complete without it, but downstream scheduling benefits from knowing).
