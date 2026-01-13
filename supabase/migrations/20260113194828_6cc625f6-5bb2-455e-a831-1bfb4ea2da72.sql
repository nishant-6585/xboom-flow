-- Drop the existing status check constraint
ALTER TABLE public.enquiries DROP CONSTRAINT enquiries_status_check;

-- Add new constraint with all status values
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'in_review'::text, 'confirmed'::text, 'rejected'::text, 'on_hold'::text, 'moved_to_pipeline'::text, 'order_won'::text, 'order_lost'::text]));