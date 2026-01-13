-- Add mobile and status fields to suppliers table
ALTER TABLE public.suppliers 
ADD COLUMN mobile text,
ADD COLUMN status text DEFAULT 'active';

-- Add comment for clarity
COMMENT ON COLUMN public.suppliers.mobile IS 'Mobile phone number for the supplier contact';
COMMENT ON COLUMN public.suppliers.status IS 'Current status of the supplier (active, inactive, blacklisted, etc.)';