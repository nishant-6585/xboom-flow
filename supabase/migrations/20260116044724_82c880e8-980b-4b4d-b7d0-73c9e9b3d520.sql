-- Update slack_settings table to support multiple channels with a single bot token
ALTER TABLE public.slack_settings 
ADD COLUMN IF NOT EXISTS slack_bot_token TEXT,
ADD COLUMN IF NOT EXISTS channel_orders TEXT,
ADD COLUMN IF NOT EXISTS channel_enquiries TEXT,
ADD COLUMN IF NOT EXISTS channel_procurements TEXT,
ADD COLUMN IF NOT EXISTS channel_suppliers TEXT,
ADD COLUMN IF NOT EXISTS channel_pipeline TEXT,
ADD COLUMN IF NOT EXISTS notify_new_enquiries BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_new_procurements BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_new_suppliers BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_new_pipeline BOOLEAN DEFAULT true;