-- Profile avatar columns for public.users.
-- Paste this file as-is in the Supabase SQL editor.
-- Idempotent. Does not include likes or resolution-credit SQL
-- (those already live in supabase/migrations and supabase/sql/pending_community_paste.sql).

alter table public.users
  add column if not exists avatar_style text;

alter table public.users
  add column if not exists avatar_seed text;

alter table public.users
  drop constraint if exists users_avatar_style_check;

alter table public.users
  add constraint users_avatar_style_check
  check (
    avatar_style is null
    or avatar_style = 'face'
    or avatar_style = any (array[
      'lorelei'::text,
      'notionists'::text,
      'adventurer'::text,
      'fun-emoji'::text,
      'bottts'::text,
      'thumbs'::text,
      'shapes'::text,
      'initials'::text
    ])
  );

alter table public.users
  drop constraint if exists users_avatar_seed_check;

alter table public.users
  add constraint users_avatar_seed_check
  check (
    avatar_seed is null
    or (
      char_length(btrim(avatar_seed)) between 1 and 64
      and avatar_seed ~ '^[A-Za-z0-9 _.\\-]+$'
    )
  );

grant select (avatar_style, avatar_seed) on table public.users to anon, authenticated;
grant update (name, avatar_style, avatar_seed) on table public.users to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Users can update their own profile avatar'
  ) then
    create policy "Users can update their own profile avatar"
      on public.users
      for update
      to authenticated
      using (id = (select auth.uid()))
      with check (id = (select auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Users can read their own profile avatar'
  ) then
    create policy "Users can read their own profile avatar"
      on public.users
      for select
      to authenticated
      using (id = (select auth.uid()));
  end if;
end
$$;

create or replace function public.community_avatar_lookup(user_ids uuid[])
returns table (id uuid, avatar_style text, avatar_seed text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.avatar_style, u.avatar_seed
  from public.users u
  where u.id = any (coalesce(user_ids, '{}'::uuid[]))
    and u.avatar_style = 'face'
  limit 80;
$$;

revoke all on function public.community_avatar_lookup(uuid[]) from public;
grant execute on function public.community_avatar_lookup(uuid[]) to anon, authenticated;
