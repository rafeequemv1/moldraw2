-- Webhooks were sending vault.community_notify_secret, but /api/community-notify
-- authorizes COMMUNITY_NOTIFY_SECRET and public.community_notify_settings.webhook_secret.
-- Those did not match, so every notify call returned 401.
-- Prefer the settings secret (same source the API reads from DB), then vault.

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
