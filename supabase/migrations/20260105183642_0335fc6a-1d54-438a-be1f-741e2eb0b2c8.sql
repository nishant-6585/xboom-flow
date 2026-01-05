-- Add refund tracking fields to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_refund_requested boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS refund_reason text,
ADD COLUMN IF NOT EXISTS refund_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS refund_requested_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS refund_requested_by uuid;