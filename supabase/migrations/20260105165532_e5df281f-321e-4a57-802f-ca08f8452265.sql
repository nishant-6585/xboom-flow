-- Add customer_email column to orders table
ALTER TABLE public.orders 
ADD COLUMN customer_email text;