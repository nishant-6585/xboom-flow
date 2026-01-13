-- Add RTO and cancellation tracking columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_rto BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS rto_marked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rto_marked_by UUID,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancelled_by UUID;

-- Add comment for clarity
COMMENT ON COLUMN public.orders.is_rto IS 'Marks if the order was returned to origin';
COMMENT ON COLUMN public.orders.cancellation_reason IS 'Reason provided when order is cancelled - required for cancellation';