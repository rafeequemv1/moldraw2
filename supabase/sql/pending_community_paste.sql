-- Pending community schema (paste in Supabase SQL editor).
-- Concatenated, chronological, idempotent where possible.
--
-- Included:
--   supabase/migrations/20260917143000_community_post_request_status.sql
--   supabase/migrations/20260917150000_feature_request_already_implemented.sql
--   supabase/migrations/20260917160000_community_notify_webhook_use_settings_secret.sql
--   supabase/migrations/20260917170000_community_post_status_notify.sql
--   supabase/migrations/20260918120000_community_comment_likes.sql
--   supabase/migrations/20260918140000_community_resolution_credit.sql
--
-- Excluded (data, not schema):
--   supabase/sql/20260918_reply_text_tool_comment.sql

-- =============================================================================
-- 20260917143000_community_post_request_status.sql
-- Admins can mark discussion posts as implemented without hiding published threads.
-- request_status is independent of the publication `status` column.
-- =============================================================================

alter table public.community_posts
  add column if not exists request_status text;

alter table public.community_posts
  drop constraint if exists community_posts_request_status_check;

alter table public.community_posts
  add constraint community_posts_request_status_check
  check (
    request_status is null
    or request_status = any (array['new'::text, 'under_review'::text, 'under_progress'::text, 'done'::text])
  );

create index if not exists community_posts_request_status_done_idx
  on public.community_posts (created_at desc)
  where request_status = 'done' and status = 'published';

create or replace function private.protect_community_post_request_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private.is_admin((select auth.uid())) then
    new.request_status := old.request_status;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_community_post_request_status on public.community_posts;
create trigger protect_community_post_request_status
  before update on public.community_posts
  for each row
  execute function private.protect_community_post_request_status();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_posts'
      and policyname = 'Admins can update community posts'
  ) then
    create policy "Admins can update community posts"
      on public.community_posts
      for update
      to authenticated
      using (private.is_admin((select auth.uid())))
      with check (
        private.is_admin((select auth.uid()))
        and status = 'published'
      );
  end if;
end
$$;

-- =============================================================================
-- 20260917150000_feature_request_already_implemented.sql
-- "Already implemented" means the request duplicates something already in MolDraw.
-- It is not a new implementation attributed to the requester, so it is excluded
-- from implemented-feature crown counts (those still use status = 'done' only).
-- =============================================================================

alter table public.feature_requests
  drop constraint if exists feature_requests_status_check;

alter table public.feature_requests
  add constraint feature_requests_status_check
  check (
    status = any (
      array[
        'new'::text,
        'under_review'::text,
        'under_progress'::text,
        'done'::text,
        'already_implemented'::text
      ]
    )
  );

alter table public.community_feature_requests
  drop constraint if exists community_feature_requests_status_check;

alter table public.community_feature_requests
  add constraint community_feature_requests_status_check
  check (
    status = any (
      array[
        'new'::text,
        'under_review'::text,
        'under_progress'::text,
        'done'::text,
        'already_implemented'::text
      ]
    )
  );

-- =============================================================================
-- 20260917160000_community_notify_webhook_use_settings_secret.sql
-- Webhooks were sending vault.community_notify_secret, but /api/community-notify
-- authorizes COMMUNITY_NOTIFY_SECRET and public.community_notify_settings.webhook_secret.
-- Those did not match, so every notify call returned 401.
-- Prefer the settings secret (same source the API reads from DB), then vault.
-- =============================================================================

create or replace function private.community_notify_webhook()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'net', 'vault'
as $function$
declare
  secret text;
  payload jsonb;
  headers jsonb;
begin
  select coalesce(
    (select s.webhook_secret from public.community_notify_settings s where s.id = 1),
    (
      select ds.decrypted_secret
      from vault.decrypted_secrets ds
      where ds.name = 'community_notify_secret'
      limit 1
    )
  )
    into secret;

  payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-moldraw-notify-secret', coalesce(secret, '')
  );

  perform net.http_post(
    url := 'https://www.moldraw.com/api/community-notify',
    body := payload,
    headers := headers,
    timeout_milliseconds := 20000
  );

  return coalesce(new, old);
end;
$function$;

-- =============================================================================
-- 20260917170000_community_post_status_notify.sql
-- Email the discussion author when an admin sets request_status (e.g. done).
-- Reuses private.community_notify_webhook() → POST /api/community-notify.
-- =============================================================================

drop trigger if exists community_posts_request_status_notify on public.community_posts;

create trigger community_posts_request_status_notify
  after update of request_status on public.community_posts
  for each row
  when (old.request_status is distinct from new.request_status)
  execute function private.community_notify_webhook();

-- =============================================================================
-- 20260918120000_community_comment_likes.sql
-- Likes on discussion and feature-request comments.
-- Unique per (source, comment_id, user_id). Anyone can read; signed-in users
-- insert/delete only their own rows.
-- =============================================================================

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

-- =============================================================================
-- 20260918140000_community_resolution_credit.sql
-- When an admin marks a thread Done from a comment/reply, credit that commenter
-- (crown). Header/dashboard Done does not invent a credited user.
-- Credit columns are cleared automatically when status leaves Done.
-- Replaces protect_community_post_request_status with apply_post_resolution_credit.
-- =============================================================================

alter table public.community_posts
  add column if not exists resolved_by_user_id uuid,
  add column if not exists credited_comment_id uuid,
  add column if not exists resolved_by_name text;

alter table public.feature_requests
  add column if not exists resolved_by_user_id uuid,
  add column if not exists credited_comment_id uuid,
  add column if not exists resolved_by_name text;

alter table public.community_feature_requests
  add column if not exists resolved_by_user_id uuid,
  add column if not exists credited_comment_id uuid,
  add column if not exists resolved_by_name text;

create index if not exists community_posts_resolved_by_done_idx
  on public.community_posts (resolved_by_user_id)
  where request_status = 'done' and resolved_by_user_id is not null;

create index if not exists community_feature_requests_resolved_by_done_idx
  on public.community_feature_requests (resolved_by_user_id)
  where status = 'done' and resolved_by_user_id is not null;

create or replace function private.apply_post_resolution_credit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  comment_user uuid;
  comment_name text;
  comment_parent uuid;
begin
  if not private.is_admin((select auth.uid())) then
    new.request_status := old.request_status;
    new.resolved_by_user_id := old.resolved_by_user_id;
    new.credited_comment_id := old.credited_comment_id;
    new.resolved_by_name := old.resolved_by_name;
    return new;
  end if;

  if new.request_status is distinct from 'done' then
    new.resolved_by_user_id := null;
    new.credited_comment_id := null;
    new.resolved_by_name := null;
    return new;
  end if;

  if new.credited_comment_id is null then
    return new;
  end if;

  select c.user_id, c.author_name, c.post_id
    into comment_user, comment_name, comment_parent
  from public.community_comments c
  where c.id = new.credited_comment_id;

  if comment_parent is distinct from new.id then
    new.credited_comment_id := old.credited_comment_id;
    new.resolved_by_user_id := old.resolved_by_user_id;
    new.resolved_by_name := old.resolved_by_name;
    return new;
  end if;

  new.resolved_by_user_id := comment_user;
  new.resolved_by_name := coalesce(nullif(pg_catalog.btrim(comment_name), ''), new.resolved_by_name);
  return new;
end;
$function$;

create or replace function private.apply_feature_resolution_credit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  comment_user uuid;
  comment_name text;
  comment_parent uuid;
begin
  if not private.is_admin((select auth.uid())) then
    new.resolved_by_user_id := old.resolved_by_user_id;
    new.credited_comment_id := old.credited_comment_id;
    new.resolved_by_name := old.resolved_by_name;
    return new;
  end if;

  if new.status is distinct from 'done' then
    new.resolved_by_user_id := null;
    new.credited_comment_id := null;
    new.resolved_by_name := null;
    return new;
  end if;

  if new.credited_comment_id is null then
    return new;
  end if;

  select c.user_id, c.author_name, c.feature_request_id
    into comment_user, comment_name, comment_parent
  from public.feature_request_comments c
  where c.id = new.credited_comment_id;

  if comment_parent is distinct from new.id then
    new.credited_comment_id := old.credited_comment_id;
    new.resolved_by_user_id := old.resolved_by_user_id;
    new.resolved_by_name := old.resolved_by_name;
    return new;
  end if;

  new.resolved_by_user_id := comment_user;
  new.resolved_by_name := coalesce(nullif(pg_catalog.btrim(comment_name), ''), new.resolved_by_name);
  return new;
end;
$function$;

drop trigger if exists protect_community_post_request_status on public.community_posts;
drop function if exists private.protect_community_post_request_status();
create trigger protect_community_post_request_status
  before update on public.community_posts
  for each row
  execute function private.apply_post_resolution_credit();

drop trigger if exists protect_feature_request_resolution_credit on public.feature_requests;
create trigger protect_feature_request_resolution_credit
  before update on public.feature_requests
  for each row
  execute function private.apply_feature_resolution_credit();

create or replace function public.sync_community_feature_request()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.community_feature_requests where id = old.id;
    return old;
  end if;

  insert into public.community_feature_requests (
    id, user_id, name, title, description, image_urls, status, upvote_count, created_at,
    resolved_by_user_id, credited_comment_id, resolved_by_name
  )
  values (
    new.id,
    new.user_id,
    new.name,
    new.title,
    new.description,
    coalesce(new.image_urls, '{}'),
    new.status,
    coalesce(new.upvote_count, 0),
    new.created_at,
    new.resolved_by_user_id,
    new.credited_comment_id,
    new.resolved_by_name
  )
  on conflict (id) do update set
    user_id = excluded.user_id,
    name = excluded.name,
    title = excluded.title,
    description = excluded.description,
    image_urls = excluded.image_urls,
    status = excluded.status,
    upvote_count = excluded.upvote_count,
    created_at = excluded.created_at,
    resolved_by_user_id = excluded.resolved_by_user_id,
    credited_comment_id = excluded.credited_comment_id,
    resolved_by_name = excluded.resolved_by_name;
  return new;
end;
$function$;
