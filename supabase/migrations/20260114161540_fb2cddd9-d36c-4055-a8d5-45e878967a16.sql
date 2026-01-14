-- Add host fields and meeting outcome status to meetings table
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS host_name TEXT;

-- Update participants to store user IDs (already array, but ensure it's consistent)
COMMENT ON COLUMN public.meetings.participants IS 'Array of user IDs who are participants';

-- Add meeting_outcome for deal tracking (pursued, closed, lost)
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS meeting_outcome TEXT CHECK (meeting_outcome IN ('pursued', 'deal_closed', 'deal_lost'));