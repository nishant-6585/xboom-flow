-- Verify anon/authenticated cannot read Gmail OAuth tokens, and that the
-- column grant matrix on public.gmail_integrations matches the hardened
-- expectation locked in by migration audit_gmail_integrations_grants().
--
-- pgTAP style — run with `supabase test db`.

BEGIN;
SELECT plan(7);

-- 1. anon has no table-level privilege whatsoever.
SELECT is(
  (SELECT COUNT(*)::int
     FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'gmail_integrations'
      AND grantee = 'anon'),
  0,
  'anon holds no table-level grants on gmail_integrations'
);

-- 2. anon has no column-level privilege on access_token / refresh_token.
SELECT is(
  (SELECT COUNT(*)::int
     FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'gmail_integrations'
      AND grantee = 'anon'
      AND column_name IN ('access_token', 'refresh_token')),
  0,
  'anon holds no column grants on access_token/refresh_token'
);

-- 3. authenticated must NOT have SELECT on access_token.
SELECT is(
  (SELECT COUNT(*)::int
     FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'gmail_integrations'
      AND grantee = 'authenticated'
      AND column_name = 'access_token'
      AND privilege_type = 'SELECT'),
  0,
  'authenticated cannot SELECT access_token'
);

-- 4. authenticated must NOT have SELECT on refresh_token.
SELECT is(
  (SELECT COUNT(*)::int
     FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'gmail_integrations'
      AND grantee = 'authenticated'
      AND column_name = 'refresh_token'
      AND privilege_type = 'SELECT'),
  0,
  'authenticated cannot SELECT refresh_token'
);

-- 5. authenticated may still SELECT the safe status column `email`.
SELECT is(
  (SELECT COUNT(*)::int
     FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'gmail_integrations'
      AND grantee = 'authenticated'
      AND column_name = 'email'
      AND privilege_type = 'SELECT'),
  1,
  'authenticated retains SELECT on gmail_integrations.email'
);

-- 6. Live RLS check: a signed-in user querying access_token gets a
-- permission error, not a row.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}';
SELECT throws_ok(
  $$SELECT access_token FROM public.gmail_integrations LIMIT 1$$,
  '42501',
  NULL,
  'authenticated SELECT access_token is denied by column ACL'
);
SELECT throws_ok(
  $$SELECT refresh_token FROM public.gmail_integrations LIMIT 1$$,
  '42501',
  NULL,
  'authenticated SELECT refresh_token is denied by column ACL'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
