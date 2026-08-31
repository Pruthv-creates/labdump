-- LabDump security migration
--
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- It is idempotent: safe to run more than once.
--
-- Covers:
--   1. owner_sessions table (short-lived, hashed session tokens)
--   2. workspaces.recovery_key_hash (recovery key separated from the row UUID)
--   3. Row Level Security locking anon/authenticated out of every table
--   4. Atomic view-count increment
--   5. Shared, DB-backed rate limiting
--   6. Expiry cleanup

-- ---------------------------------------------------------------------------
-- 1. Owner sessions
-- ---------------------------------------------------------------------------

create table if not exists public.owner_sessions (
  token_hash   text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists owner_sessions_workspace_idx
  on public.owner_sessions (workspace_id);

create index if not exists owner_sessions_expires_idx
  on public.owner_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 2. Recovery keys
-- ---------------------------------------------------------------------------
-- The workspace UUID used to double as the recovery credential. It is now a
-- plain identifier, and recovery uses a separate secret stored only as a hash.

alter table public.workspaces
  add column if not exists recovery_key_hash text;

create unique index if not exists workspaces_recovery_key_hash_idx
  on public.workspaces (recovery_key_hash)
  where recovery_key_hash is not null;

-- Files may exist without a workspace (anonymous quick-share).
alter table public.files
  alter column workspace_id drop not null;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
-- Every read and write goes through the Next.js server using the service_role
-- key, which bypasses RLS. Enabling RLS with NO permissive policies therefore
-- changes nothing for the app, but means a leaked anon key grants nothing —
-- no reads, and critically no `delete from files`.

alter table public.files          enable row level security;
alter table public.workspaces     enable row level security;
alter table public.owner_sessions enable row level security;

-- Force RLS so even the table owner is subject to it.
alter table public.files          force row level security;
alter table public.workspaces     force row level security;
alter table public.owner_sessions force row level security;

-- Drop any permissive policies left over from development.
do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('files', 'workspaces', 'owner_sessions')
  loop
    execute format('drop policy if exists %I on %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Revoke direct table access from the public API roles.
revoke all on public.files          from public, anon, authenticated;
revoke all on public.workspaces     from public, anon, authenticated;
revoke all on public.owner_sessions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Atomic view counter
-- ---------------------------------------------------------------------------
-- Read-then-write from the render pass lost concurrent views.

create or replace function public.increment_view_count(p_file_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.files
     set view_count = coalesce(view_count, 0) + 1
   where id = p_file_id;
$$;

-- Revoke from PUBLIC, not just anon/authenticated: Postgres grants EXECUTE to
-- PUBLIC by default on CREATE FUNCTION, and anon inherits PUBLIC, so revoking
-- the role alone leaves the function callable with the public anon key.
revoke all on function public.increment_view_count(bigint) from public, anon, authenticated;
grant execute on function public.increment_view_count(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Rate limiting
-- ---------------------------------------------------------------------------
-- In-memory Maps reset on every serverless cold start and are per-instance.
-- This shares one counter across all instances.

create table if not exists public.rate_limits (
  key         text primary key,
  count       integer not null default 0,
  window_start timestamptz not null default now()
);

create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
revoke all on public.rate_limits from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_window_start timestamptz;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
    set count = case
                  when public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
                    then 1
                  else public.rate_limits.count + 1
                end,
        window_start = case
                  when public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
                    then v_now
                  else public.rate_limits.window_start
                end
  returning public.rate_limits.count, public.rate_limits.window_start
    into v_count, v_window_start;

  return query
    select
      v_count <= p_limit,
      greatest(
        0,
        p_window_seconds - extract(epoch from (v_now - v_window_start))::integer
      );
end $$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Cleanup
-- ---------------------------------------------------------------------------
-- Schedule with pg_cron, e.g.
--   select cron.schedule('labdump-cleanup', '0 * * * *',
--                        $$select public.cleanup_expired()$$);

create or replace function public.cleanup_expired()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.owner_sessions where expires_at < now();

  -- Abandoned reservations: pending for over 24h with nothing uploaded.
  delete from public.files
   where status = 'pending'
     and created_at < now() - interval '24 hours';

  update public.files
     set status = 'expired'
   where status = 'active'
     and expires_at < now();
$$;

-- This one DELETES rows, so a PUBLIC execute grant let anyone holding the
-- anon key trigger destructive cleanup at will.
revoke all on function public.cleanup_expired() from public, anon, authenticated;
grant execute on function public.cleanup_expired() to service_role;
