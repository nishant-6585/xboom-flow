-- pgTAP tests for Portal Customers last-login source of truth.
-- The admin/staff helper must resolve auth.users.last_sign_in_at even when a
-- legacy portal_contacts row is linked only by matching email.

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

set local role postgres;

\set admin_uid   '11111111-7777-4777-8777-111111111111'
\set portal_uid  '22222222-8888-4888-8888-222222222222'
\set account_uid '33333333-9999-4999-8999-333333333333'
\set contact_uid '44444444-aaaa-4aaa-8aaa-444444444444'

insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at) values
  (:'admin_uid'::uuid, 'portal-login-admin@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
  (:'portal_uid'::uuid, 'portal-email-only@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', timestamptz '2026-07-07 09:30:00+00')
on conflict (id) do update set last_sign_in_at = excluded.last_sign_in_at;

insert into public.user_roles (user_id, role) values
  (:'admin_uid'::uuid, 'admin')
on conflict (user_id, role) do nothing;

insert into public.portal_accounts (id, company_name, status, primary_contact_name) values
  (:'account_uid'::uuid, 'Portal Login Test Co', 'active', 'Email Only Contact')
on conflict (id) do nothing;

insert into public.portal_contacts
  (id, account_id, auth_user_id, full_name, email, role, is_active)
values
  (:'contact_uid'::uuid, :'account_uid'::uuid, null, 'Email Only Contact', 'portal-email-only@test.local', 'buyer', true)
on conflict (id) do update set
  auth_user_id = null,
  email = excluded.email,
  is_active = true;

create or replace function pg_temp.as_user(_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end$$;

select pg_temp.as_user(:'admin_uid'::uuid);

select is(
  (select last_login_at from public.get_portal_contacts_with_auth_login() where id = :'contact_uid'::uuid),
  timestamptz '2026-07-07 09:30:00+00',
  'email-only portal contact resolves auth.users.last_sign_in_at'
);

select is(
  (select auth_user_id from public.get_portal_contacts_with_auth_login() where id = :'contact_uid'::uuid),
  :'portal_uid'::uuid,
  'email-only portal contact exposes matched auth user id to prevent Never-login UI state'
);

select is(
  (select count(*)::int from public.get_my_portal_team_with_auth_login()),
  0,
  'staff-only helper does not leak customer team data without a portal admin caller'
);

select * from finish();

rollback;