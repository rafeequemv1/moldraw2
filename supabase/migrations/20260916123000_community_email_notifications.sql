-- Community notification prefs, @mentions, mention search, webhooks, and send log.
-- Applied to production via Supabase MCP; kept here so the repo matches the database.

create table if not exists public.community_email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  constraint community_email_unsubscribes_email_key unique (email)
);

create unique index if not exists community_email_unsubscribes_user_id_key
  on public.community_email_unsubscribes (user_id)
  where user_id is not null;

alter table public.community_email_unsubscribes enable row level security;

create table if not exists public.community_comment_mentions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = any (array['community_comments'::text, 'feature_request_comments'::text])),
  comment_id uuid not null,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint community_comment_mentions_unique unique (source, comment_id, mentioned_user_id)
);

create index if not exists community_comment_mentions_comment_idx
  on public.community_comment_mentions (source, comment_id);
create index if not exists community_comment_mentions_user_idx
  on public.community_comment_mentions (mentioned_user_id);

alter table public.community_comment_mentions enable row level security;

create table if not exists public.community_notify_log (
  event_key text primary key,
  created_at timestamptz not null default now()
);
alter table public.community_notify_log enable row level security;

create or replace function public.search_community_mention_users(q text)
returns table (
  id uuid,
  name text,
  handle text,
  designation text,
  avatar_key text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cleaned text := btrim(coalesce(q, ''));
  needle text := lower(regexp_replace(cleaned, '[^a-zA-Z0-9]+', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if cleaned = '' then
    return query
    select u.id,
           u.name,
           case
             when length(lower(regexp_replace(btrim(u.name), '[^a-zA-Z0-9]+', '', 'g'))) >= 2
               then lower(regexp_replace(btrim(u.name), '[^a-zA-Z0-9]+', '', 'g'))
             else 'user' || substr(replace(u.id::text, '-', ''), 1, 8)
           end,
           u.designation,
           u.avatar_key
    from public.users u
    where exists (
      select 1 from public.community_posts p where p.user_id = u.id
      union all
      select 1 from public.community_comments c where c.user_id = u.id
      union all
      select 1 from public.feature_request_comments f where f.user_id = u.id
    )
    order by u.karma_score desc, u.name asc
    limit 8;
    return;
  end if;

  return query
  select u.id,
         u.name,
         case
           when length(lower(regexp_replace(btrim(u.name), '[^a-zA-Z0-9]+', '', 'g'))) >= 2
             then lower(regexp_replace(btrim(u.name), '[^a-zA-Z0-9]+', '', 'g'))
           else 'user' || substr(replace(u.id::text, '-', ''), 1, 8)
         end,
         u.designation,
         u.avatar_key
  from public.users u
  where u.name ilike '%' || cleaned || '%'
     or lower(regexp_replace(btrim(u.name), '[^a-zA-Z0-9]+', '', 'g')) like needle || '%'
  order by
    case when lower(u.name) like lower(cleaned) || '%' then 0 else 1 end,
    u.karma_score desc,
    u.name asc
  limit 8;
end;
$$;

revoke all on function public.search_community_mention_users(text) from public;
revoke all on function public.search_community_mention_users(text) from anon;
grant execute on function public.search_community_mention_users(text) to authenticated;
