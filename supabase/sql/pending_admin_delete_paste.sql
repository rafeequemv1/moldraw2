drop policy if exists "Admins can update community posts" on public.community_posts;
create policy "Admins can update community posts"
  on public.community_posts
  for update
  to authenticated
  using (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  )
  with check (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  );

drop policy if exists "Admins can delete community posts" on public.community_posts;
create policy "Admins can delete community posts"
  on public.community_posts
  for delete
  to authenticated
  using (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  );

drop policy if exists "Admins can update community comments" on public.community_comments;
create policy "Admins can update community comments"
  on public.community_comments
  for update
  to authenticated
  using (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  )
  with check (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  );

drop policy if exists "Admins can delete community comments" on public.community_comments;
create policy "Admins can delete community comments"
  on public.community_comments
  for delete
  to authenticated
  using (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  );

drop policy if exists "Admins can delete feature request comments" on public.feature_request_comments;
create policy "Admins can delete feature request comments"
  on public.feature_request_comments
  for delete
  to authenticated
  using (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  );

drop policy if exists "Admins can delete community post votes" on public.community_post_votes;
create policy "Admins can delete community post votes"
  on public.community_post_votes
  for delete
  to authenticated
  using (
    private.is_admin((select auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and (u.is_admin is true or u.role = 'admin')
    )
  );
