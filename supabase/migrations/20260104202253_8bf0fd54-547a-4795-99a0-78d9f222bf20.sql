-- Add response notes field for supply chain team
ALTER TABLE public.enquiries
ADD COLUMN response_notes text;