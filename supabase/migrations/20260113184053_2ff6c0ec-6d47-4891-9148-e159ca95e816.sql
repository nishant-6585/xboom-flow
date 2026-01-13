-- Add website_price and dealer_price columns to pricelist table
ALTER TABLE public.pricelist 
ADD COLUMN website_price numeric NULL,
ADD COLUMN dealer_price numeric NULL;