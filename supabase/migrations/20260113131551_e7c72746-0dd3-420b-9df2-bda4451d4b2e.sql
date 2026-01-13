-- Add delivery_charges column to orders table
ALTER TABLE public.orders ADD COLUMN delivery_charges numeric DEFAULT 0;