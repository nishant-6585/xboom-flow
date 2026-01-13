-- Add procurement_date column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS procurement_date date;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.procurement_date IS 'Date when procurement was planned by supply chain team';