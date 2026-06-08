-- Migration: Create children table
-- First domain table — establishes migration + RLS pattern for subsequent slices.

-- Enable moddatetime extension for auto-updating updated_at
create extension if not exists moddatetime with schema extensions;

-- Create children table
create table public.children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age_category text not null check (age_category in ('small', 'medium', 'large')),
  available_time jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

-- Auto-update updated_at on every row change
create trigger handle_updated_at
  before update on public.children
  for each row
  execute procedure extensions.moddatetime(updated_at);

-- Enable Row Level Security
alter table public.children enable row level security;

-- RLS Policies: all scoped to auth.uid() = user_id

-- SELECT: only own rows, only non-deleted
create policy "Users can view their own children"
  on public.children for select
  using (auth.uid() = user_id and deleted_at is null);

-- INSERT: only own rows
create policy "Users can insert their own children"
  on public.children for insert
  with check (auth.uid() = user_id);

-- UPDATE: only own non-deleted rows
create policy "Users can update their own children"
  on public.children for update
  using (auth.uid() = user_id and deleted_at is null)
  with check (auth.uid() = user_id);

-- DELETE: only own rows (hard delete fallback, soft-delete is preferred at app level)
create policy "Users can delete their own children"
  on public.children for delete
  using (auth.uid() = user_id);

-- Index for fast user-scoped queries
create index idx_children_user_id on public.children(user_id);
