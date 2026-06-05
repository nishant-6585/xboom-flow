
DELETE FROM auth.mfa_challenges WHERE factor_id IN (
  SELECT id FROM auth.mfa_factors WHERE user_id = 'b87d4c2a-2687-4ea5-befb-3d216bb2d845'
);
DELETE FROM auth.mfa_factors WHERE user_id = 'b87d4c2a-2687-4ea5-befb-3d216bb2d845';

UPDATE public.trusted_devices SET is_revoked = true
WHERE user_id = 'b87d4c2a-2687-4ea5-befb-3d216bb2d845' AND is_revoked = false;
