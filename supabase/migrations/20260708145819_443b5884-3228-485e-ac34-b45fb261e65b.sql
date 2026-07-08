UPDATE public.feature_flags SET enabled = true, updated_at = now() WHERE key = 'digilocker_kyc_enabled';

SELECT key, enabled, updated_at FROM public.feature_flags WHERE key = 'digilocker_kyc_enabled';