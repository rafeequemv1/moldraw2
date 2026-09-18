-- Admin reply on TOPHERKIRKPR's text-tool follow-up
-- Thread: Revert back to old model
-- https://www.moldraw.com/community/f/da2b8cf0-e49b-47cf-b287-b6a086fe4f30/revert-back-old-model
-- Parent comment: f7f1ad35-32f5-4684-b9d6-ded3bc6436c1
-- Posted as the same admin user as the earlier select/erase reply.

insert into public.feature_request_comments (
  feature_request_id,
  parent_comment_id,
  user_id,
  body
)
select
  'da2b8cf0-e49b-47cf-b287-b6a086fe4f30'::uuid,
  'f7f1ad35-32f5-4684-b9d6-ded3bc6436c1'::uuid,
  c.user_id,
  $reply$Thanks for the follow-up — glad today's update feels better.

On the text tool: text no longer picks up the molecule Color. Space works while you type, and overflow wraps or grows the box instead of stacking on itself. Text styling is in the left panel now, the Style button opens the Text dock, and superscript/subscript apply only to the selected text.

Appreciate you flagging it.$reply$
from public.feature_request_comments c
where c.id = '6735a33c-9781-4e72-9f55-81ef2b0b5e01'
  and not exists (
    select 1
    from public.feature_request_comments x
    where x.parent_comment_id = 'f7f1ad35-32f5-4684-b9d6-ded3bc6436c1'
      and x.body ilike '%text no longer picks up the molecule Color%'
  )
returning id, created_at;
