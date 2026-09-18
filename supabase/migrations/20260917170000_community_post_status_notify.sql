-- Email the discussion author when an admin sets request_status (e.g. done).
-- Reuses private.community_notify_webhook() → POST /api/community-notify.

drop trigger if exists community_posts_request_status_notify on public.community_posts;

create trigger community_posts_request_status_notify
  after update of request_status on public.community_posts
  for each row
  when (old.request_status is distinct from new.request_status)
  execute function private.community_notify_webhook();
