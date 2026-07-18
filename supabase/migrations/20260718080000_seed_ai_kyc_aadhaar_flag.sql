-- Seed the Aadhaar AI-review feature flag (defined in ai-kyc-review).
-- Default OFF: enabling sends Aadhaar document images to the external
-- vision provider, which is a data-localization/compliance decision the
-- business makes explicitly by flipping this flag:
--   UPDATE feature_flags SET enabled = true WHERE key = 'ai_kyc_aadhaar_enabled';
INSERT INTO public.feature_flags (key, enabled)
VALUES ('ai_kyc_aadhaar_enabled', false)
ON CONFLICT (key) DO NOTHING;
