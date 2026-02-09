
-- Remove plaintext credential columns from slack_settings
ALTER TABLE public.slack_settings DROP COLUMN IF EXISTS slack_bot_token;
ALTER TABLE public.slack_settings DROP COLUMN IF EXISTS webhook_url;
