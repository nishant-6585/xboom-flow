ALTER TABLE public.slack_settings 
ADD COLUMN IF NOT EXISTS channel_sales_report text,
ADD COLUMN IF NOT EXISTS enable_daily_report boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_weekly_report boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_ai_insights boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_interactive_actions boolean DEFAULT true;