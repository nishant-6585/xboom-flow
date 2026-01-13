-- First, create a new enum type with all the values we want
CREATE TYPE public.order_status_new AS ENUM (
  'po_received',
  'payment_received',
  'partial_payment_received',
  'procurement_to_plan',
  'procurement_in_process',
  'procurement_done',
  'delivery_done',
  'cancelled'
);

-- Update the column to use text temporarily
ALTER TABLE public.orders 
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE text USING status::text;

-- Map old values to new values
UPDATE public.orders SET status = 'po_received' WHERE status = 'pending';
UPDATE public.orders SET status = 'procurement_in_process' WHERE status = 'confirmed';
UPDATE public.orders SET status = 'procurement_in_process' WHERE status = 'procuring';
UPDATE public.orders SET status = 'delivery_done' WHERE status = 'in_transit';
UPDATE public.orders SET status = 'delivery_done' WHERE status = 'customs';
UPDATE public.orders SET status = 'delivery_done' WHERE status = 'delivered';

-- Convert to new enum
ALTER TABLE public.orders 
  ALTER COLUMN status TYPE order_status_new USING status::order_status_new,
  ALTER COLUMN status SET DEFAULT 'po_received'::order_status_new;

-- Drop the old enum type
DROP TYPE public.order_status;

-- Rename new enum to the original name
ALTER TYPE public.order_status_new RENAME TO order_status;