-- Add product_category column to enquiries table
ALTER TABLE public.enquiries
ADD COLUMN product_category text NOT NULL DEFAULT 'Consumer Drones';