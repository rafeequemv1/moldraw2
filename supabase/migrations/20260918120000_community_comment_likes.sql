-- Likes on discussion and feature-request comments.
-- Unique per (source, comment_id, user_id). Anyone can read; signed-in users
-- insert/delete only their own rows.

create table if not exists public.community_comment_likes (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = any (array[
    'community_comments'::text,
    'feature_request_comments'::text
  ])),
  comment_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  liker_name text,
  liker_avatar_key text,
  created_at timestamptz not null default now(),
  constraint community_comment_likes_unique unique (source, comment_id, user_id)
);

create index if not exists community_comment_likes_comment_idx
  on public.community_comment_likes (source, comment_id, created_at);

create index if not exists community_comment_likes_user_idx
  on public.community_comment_likes (user_id);

alter table public.community_comment_likes enable row level security;

grant select on public.community_comment_likes to anon, authenticated;
grant insert, delete on public.community_comment_likes to authenticated;

create or replace function private.fill_community_comment_like_profile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  profile_name text;
  profile_avatar text;
begin
  if new.user_id is null then
    new.user_id := (select auth.uid());
  end if;
  if new.user_id is null then
    raise exception 'Authentication required';
  end if;
  select u.name, u.avatar_key
    into profile_name, profile_avatar
  from public.users u
  where u.id = new.user_id;
  new.liker_name := coalesce(nullif(pg_catalog.btrim(profile_name), ''), new.liker_name);
  new.liker_avatar_key := coalesce(profile_avatar, new.liker_avatar_key);
  return new;
end;
$function$;

create or replace function private.enforce_community_comment_like_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.source = 'community_comments' then
    if not exists (
      select 1 from public.community_comments c where c.id = new.comment_id
    ) then
      raise exception 'Comment not found';
    end if;
  elsif new.source = 'feature_request_comments' then
    if not exists (
      select 1 from public.feature_request_comments c where c.id = new.comment_id
    ) then
      raise exception 'Comment not found';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.delete_community_comment_likes()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  delete from public.community_comment_likes
  where source = case tg_table_name
    when 'community_comments' then 'community_comments'
    else 'feature_request_comments'
  end
  and comment_id = old.id;
  return old;
end;
$function$;

drop trigger if exists fill_community_comment_like_profile on public.community_comment_likes;
create trigger fill_community_comment_like_profile
  before insert on public.community_comment_likes
  for each row
  execute function private.fill_community_comment_like_profile();

drop trigger if exists enforce_community_comment_like_target on public.community_comment_likes;
create trigger enforce_community_comment_like_target
  before insert on public.community_comment_likes
  for each row
  execute function private.enforce_community_comment_like_target();

drop trigger if exists delete_community_comment_likes on public.community_comments;
create trigger delete_community_comment_likes
  after delete on public.community_comments
  for each row
  execute function private.delete_community_comment_likes();

drop trigger if exists delete_feature_request_comment_likes on public.feature_request_comments;
create trigger delete_feature_request_comment_likes
  after delete on public.feature_request_comments
  for each row
  execute function private.delete_community_comment_likes();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_comment_likes'
      and policyname = 'Anyone can view comment likes'
  ) then
    create policy "Anyone can view comment likes"
      on public.community_comment_likes
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_comment_likes'
      and policyname = 'Signed in users can like comments'
  ) then
    create policy "Signed in users can like comments"
      on public.community_comment_likes
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_comment_likes'
      and policyname = 'Users can unlike their own comment likes'
  ) then
    create policy "Users can unlike their own comment likes"
      on public.community_comment_likes
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
