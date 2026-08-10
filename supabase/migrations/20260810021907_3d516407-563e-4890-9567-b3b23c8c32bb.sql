ALTER TABLE public.slack_settings
  ADD COLUMN IF NOT EXISTS channel_prospect_pipeline text,
  ADD COLUMN IF NOT EXISTS enable_prospect_pipeline_report boolean NOT NULL DEFAULT false;