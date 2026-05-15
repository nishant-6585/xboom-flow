-- Cleanup: nishant.mca2010@gmail.com is a portal customer only.
-- Remove stale employee roles and MFA factor inherited from prior employee usage.
DELETE FROM public.user_roles
WHERE user_id = '35fc31ac-1d31-4d77-87df-8aec61ee9934'
  AND role IN ('hr','it');

DELETE FROM auth.mfa_factors
WHERE user_id = '35fc31ac-1d31-4d77-87df-8aec61ee9934';

DELETE FROM public.user_sessions
WHERE user_id = '35fc31ac-1d31-4d77-87df-8aec61ee9934';