-- Add requested timeline field to enquiries table
ALTER TABLE public.enquiries
ADD COLUMN requested_timeline text;