-- Add order_date field to orders table (separate from created_at which is system-generated)
ALTER TABLE public.orders ADD COLUMN order_date DATE DEFAULT CURRENT_DATE;

-- Update existing orders to use created_at date as their order_date
UPDATE public.orders SET order_date = created_at::date WHERE order_date IS NULL;