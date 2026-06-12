-- Migration: Create chores table
-- Second domain table — replicates migration + RLS pattern from children table.

-- moddatetime extension already enabled by children migration

-- Create chores table
create table public.chores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age_category text not null check (age_category in ('small', 'medium', 'large')),
  min_weekly_frequency integer not null check (min_weekly_frequency between 1 and 7),
  min_time_to_complete integer not null check (min_time_to_complete between 5 and 480),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

-- Auto-update updated_at on every row change
create trigger handle_updated_at
  before update on public.chores
  for each row
  execute procedure extensions.moddatetime(updated_at);

-- Enable Row Level Security
alter table public.chores enable row level security;

-- RLS Policies: all scoped to auth.uid() = user_id

-- SELECT: only own rows, only non-deleted
create policy "Users can view their own chores"
  on public.chores for select
  using (auth.uid() = user_id and deleted_at is null);

-- INSERT: only own rows
create policy "Users can insert their own chores"
  on public.chores for insert
  with check (auth.uid() = user_id);

-- UPDATE: only own non-deleted rows
create policy "Users can update their own chores"
  on public.chores for update
  using (auth.uid() = user_id and deleted_at is null)
  with check (auth.uid() = user_id);

-- DELETE: only own rows (hard delete fallback, soft-delete is preferred at app level)
create policy "Users can delete their own chores"
  on public.chores for delete
  using (auth.uid() = user_id);

-- Index for fast user-scoped queries
create index idx_chores_user_id on public.chores(user_id);
