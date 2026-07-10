INSERT INTO public.feature_flags (key, enabled, updated_at)
VALUES ('ai_kyc_aadhaar_enabled', false, now())
ON CONFLICT (key) DO NOTHING;