-- When an admin marks a thread Done from a comment/reply, credit that commenter
-- (crown). Header/dashboard Done does not invent a credited user.
-- Credit columns are cleared automatically when status leaves Done.

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
