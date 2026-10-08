-- Owner policies for tables that had RLS enabled and no policies.
-- Public SELECT on stations, readings, forecasts, advisories is unchanged.
-- Authenticated users may read and write only their own rows.

drop policy if exists users_select_own on public.users;
drop policy if exists users_update_own on public.users;
create policy users_select_own on public.users
  for select to authenticated using (id = auth.uid());
create policy users_update_own on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_all_own on public.user_profiles;
create policy profiles_all_own on public.user_profiles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_sessions_own on public.chat_sessions;
create policy chat_sessions_own on public.chat_sessions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_messages_own on public.chat_messages;
create policy chat_messages_own on public.chat_messages
  for all to authenticated
  using (
    session_id in (select id from public.chat_sessions where user_id = auth.uid())
  )
  with check (
    session_id in (select id from public.chat_sessions where user_id = auth.uid())
  );

drop policy if exists email_log_own on public.email_log;
create policy email_log_own on public.email_log
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists email_quota_own on public.email_quota;
create policy email_quota_own on public.email_quota
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists advisory_views_own on public.advisory_views;
create policy advisory_views_own on public.advisory_views
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
