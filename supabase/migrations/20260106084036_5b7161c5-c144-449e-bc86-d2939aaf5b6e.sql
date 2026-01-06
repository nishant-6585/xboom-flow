-- Add column to store responder name for supply chain responses
ALTER TABLE public.enquiries 
ADD COLUMN IF NOT EXISTS responded_by_name TEXT;

-- Add columns for admin escalation response (when admin responds to escalated enquiries)
ALTER TABLE public.enquiries 
ADD COLUMN IF NOT EXISTS admin_response TEXT,
ADD COLUMN IF NOT EXISTS admin_response_by TEXT,
ADD COLUMN IF NOT EXISTS admin_response_by_name TEXT,
ADD COLUMN IF NOT EXISTS admin_response_at TIMESTAMP WITH TIME ZONE;

-- Add column to store who escalated by name
ALTER TABLE public.enquiries 
ADD COLUMN IF NOT EXISTS escalated_by_name TEXT;