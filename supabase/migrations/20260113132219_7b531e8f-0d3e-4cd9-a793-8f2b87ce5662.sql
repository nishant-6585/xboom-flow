-- Add order_outcome column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_outcome text DEFAULT 'pending';

-- Add lost_reason and lost_reason_notes columns for tracking lost order reasons
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS lost_reason_notes text;

-- Add outcome tracking columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS outcome_updated_at timestamp with time zone;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS outcome_updated_by uuid;