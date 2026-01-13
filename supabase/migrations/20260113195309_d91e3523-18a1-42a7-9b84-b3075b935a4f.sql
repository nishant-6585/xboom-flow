-- First drop any existing status check constraint
ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check;

-- Update old status values to match new status values
UPDATE public.enquiries SET status = 'responded' WHERE status = 'confirmed';
UPDATE public.enquiries SET status = 'pending' WHERE status = 'in_review';
UPDATE public.enquiries SET status = 'order_lost' WHERE status = 'rejected';

-- Add new constraint with valid status values
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'responded'::text, 'on_hold'::text, 'moved_to_pipeline'::text, 'order_won'::text, 'order_lost'::text]));