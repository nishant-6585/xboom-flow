-- Add slack_user_id to profiles for direct messaging
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS slack_user_id TEXT;

-- Add ticket notification settings to slack_settings
ALTER TABLE public.slack_settings 
ADD COLUMN IF NOT EXISTS notify_ticket_assigned BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_ticket_status_change BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS channel_tickets TEXT;

-- Add comment explaining the slack_user_id field
COMMENT ON COLUMN public.profiles.slack_user_id IS 'Slack member ID for direct messaging (e.g., U1234567890)';