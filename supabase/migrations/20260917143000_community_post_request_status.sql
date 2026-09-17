-- Admins can mark discussion posts as implemented without hiding published threads.
-- request_status is independent of the publication `status` column.

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
