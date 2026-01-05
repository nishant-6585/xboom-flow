-- Add invoice_url column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_url TEXT;

-- Create storage bucket for invoices
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for invoice storage
CREATE POLICY "Anyone can view invoices" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'invoices');

CREATE POLICY "Authenticated users can upload invoices" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update invoices" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete invoices" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');