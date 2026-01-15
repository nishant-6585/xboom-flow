-- Add new order status values to the enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'to_ship';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'in_transit';