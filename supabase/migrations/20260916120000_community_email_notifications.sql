-- Production notify settings and HTTP webhooks are applied via Supabase MCP.
-- This file documents the in-repo schema for mention search and unsubscribe.
-- Do not put webhook secrets in git.

-- Existing tables: community_email_unsubscribes, community_comment_mentions,
-- community_notify_log, search_community_mention_users(q text).
-- Webhooks: AFTER INSERT on community_comments, feature_request_comments,
-- community_comment_mentions; AFTER UPDATE OF status on feature_requests.
-- POST https://www.moldraw.com/api/community-notify with x-moldraw-notify-secret
-- from public.community_notify_settings (service_role only).
