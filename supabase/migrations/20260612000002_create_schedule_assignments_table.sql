-- Migration: Create schedule_assignments table
-- Persists generated weekly chore schedules. One row per chore-per-day-per-child assignment.
-- No soft-delete — re-generation deletes and recreates rows for the current week.

-- moddatetime extension already enabled by children migration

-- Create schedule_assignments table
create table public.schedule_assignments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  assignment_date date not null,
  child_id        uuid not null references public.children(id) on delete cascade,
  chore_id        uuid not null references public.chores(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create trigger handle_updated_at
  before update on public.schedule_assignments
  for each row
  execute procedure extensions.moddatetime(updated_at);

-- Enable Row Level Security
alter table public.schedule_assignments enable row level security;

-- RLS Policies: all scoped to auth.uid() = user_id

-- SELECT: only own rows
create policy "Users can view their own schedule assignments"
  on public.schedule_assignments for select
  using (auth.uid() = user_id);

-- INSERT: only own rows
create policy "Users can insert their own schedule assignments"
  on public.schedule_assignments for insert
  with check (auth.uid() = user_id);

-- UPDATE: only own rows
create policy "Users can update their own schedule assignments"
  on public.schedule_assignments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: only own rows (used during re-generation to clear the current week)
create policy "Users can delete their own schedule assignments"
  on public.schedule_assignments for delete
  using (auth.uid() = user_id);

-- Index for fast weekly schedule fetches
create index idx_schedule_assignments_user_week
  on public.schedule_assignments(user_id, week_start_date);
