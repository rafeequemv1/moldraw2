-- Mentions on community posts plus @handle resolution from saved bodies.

alter table public.community_comment_mentions
  drop constraint if exists community_comment_mentions_source_check;

alter table public.community_comment_mentions
  add constraint community_comment_mentions_source_check
  check (source = any (array[
    'community_comments'::text,
    'feature_request_comments'::text,
    'community_posts'::text
  ]));

create or replace function public.resolve_community_mention_handles(handles text[])
returns table (
  id uuid,
  name text,
  handle text,
  designation text,
  avatar_key text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with wanted as (
    select distinct lower(btrim(h)) as handle
    from unnest(coalesce(handles, array[]::text[])) as h
    where length(btrim(h)) between 2 and 40
  )
  select
    u.id,
    u.name,
    case
      when length(regexp_replace(lower(btrim(u.name)), '[^a-z0-9]+', '', 'g')) >= 2
        then regexp_replace(lower(btrim(u.name)), '[^a-z0-9]+', '', 'g')
      else 'user' || left(replace(u.id::text, '-', ''), 8)
    end as handle,
    u.designation,
    u.avatar_key
  from public.users u
  join wanted w
    on w.handle = case
      when length(regexp_replace(lower(btrim(u.name)), '[^a-z0-9]+', '', 'g')) >= 2
        then regexp_replace(lower(btrim(u.name)), '[^a-z0-9]+', '', 'g')
      else 'user' || left(replace(u.id::text, '-', ''), 8)
    end
  limit 20;
$$;

revoke all on function public.resolve_community_mention_handles(text[]) from public;
revoke all on function public.resolve_community_mention_handles(text[]) from anon;
grant execute on function public.resolve_community_mention_handles(text[]) to authenticated;
grant execute on function public.resolve_community_mention_handles(text[]) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_comment_mentions'
      and policyname = 'Anyone can view comment mentions'
  ) then
    create policy "Anyone can view comment mentions"
      on public.community_comment_mentions
      for select
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_comment_mentions'
      and policyname = 'Signed in users can create mentions'
  ) then
    create policy "Signed in users can create mentions"
      on public.community_comment_mentions
      for insert
      to authenticated
      with check (
        (select auth.uid()) = created_by
        and mentioned_user_id <> (select auth.uid())
      );
  end if;
end $$;
