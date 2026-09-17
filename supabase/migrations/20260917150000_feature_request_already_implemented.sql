-- "Already implemented" means the request duplicates something already in MolDraw.
-- It is not a new implementation attributed to the requester, so it is excluded
-- from implemented-feature crown counts (those still use status = 'done' only).

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
