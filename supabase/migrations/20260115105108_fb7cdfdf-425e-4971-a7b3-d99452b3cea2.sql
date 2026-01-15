-- Add payment request status columns to supplier_payments table
ALTER TABLE public.supplier_payments 
ADD COLUMN IF NOT EXISTS payment_request_status text DEFAULT 'pending' CHECK (payment_request_status IN ('pending', 'requested', 'approved', 'done')),
ADD COLUMN IF NOT EXISTS requested_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS requested_by uuid,
ADD COLUMN IF NOT EXISTS requested_by_name text,
ADD COLUMN IF NOT EXISTS request_notes text,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS approved_by_name text,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS completed_by uuid,
ADD COLUMN IF NOT EXISTS completed_by_name text;

-- Update existing records to have 'done' status since they are already recorded payments
UPDATE public.supplier_payments 
SET payment_request_status = 'done', 
    completed_at = created_at, 
    completed_by = created_by
WHERE payment_request_status = 'pending' OR payment_request_status IS NULL;