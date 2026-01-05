-- Add order outcome tracking fields to enquiries table
ALTER TABLE public.enquiries 
ADD COLUMN order_outcome text CHECK (order_outcome IN ('pending', 'won', 'lost')) DEFAULT 'pending',
ADD COLUMN lost_reason text CHECK (lost_reason IN ('pricing', 'timeline', 'competition', 'budget', 'specifications', 'other') OR lost_reason IS NULL),
ADD COLUMN lost_reason_notes text,
ADD COLUMN outcome_updated_at timestamp with time zone,
ADD COLUMN outcome_updated_by uuid;