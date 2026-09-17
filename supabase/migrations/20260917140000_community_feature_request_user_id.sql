-- Expose feature-request author ids on the public community table so
-- implemented-feature crowns can be counted without reading private emails.

alter table public.community_feature_requests
  add column if not exists user_id uuid;

create index if not exists community_feature_requests_user_status_idx
  on public.community_feature_requests (user_id, status)
  where user_id is not null;

create index if not exists community_feature_requests_done_created_idx
  on public.community_feature_requests (created_at desc)
  where status = 'done';

update public.community_feature_requests as community
set user_id = request.user_id
from public.feature_requests as request
where community.id = request.id
  and community.user_id is distinct from request.user_id;

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
    id, user_id, name, title, description, image_urls, status, upvote_count, created_at
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
    new.created_at
  )
  on conflict (id) do update set
    user_id = excluded.user_id,
    name = excluded.name,
    title = excluded.title,
    description = excluded.description,
    image_urls = excluded.image_urls,
    status = excluded.status,
    upvote_count = excluded.upvote_count,
    created_at = excluded.created_at;
  return new;
end;
$function$;
