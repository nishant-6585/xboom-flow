-- Add procurement_date and status columns to order_items
ALTER TABLE public.order_items 
ADD COLUMN procurement_date date,
ADD COLUMN status text NOT NULL DEFAULT 'pending';

-- Add comment for status field values
COMMENT ON COLUMN public.order_items.status IS 'Item procurement status: pending, ordered, in_transit, received, cancelled';