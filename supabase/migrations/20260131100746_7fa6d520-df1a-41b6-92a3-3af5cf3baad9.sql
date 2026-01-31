-- Add per-item discount fields to quote_items
ALTER TABLE public.quote_items
ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- Add per-item discount fields to invoice_items
ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- Add bank details, signature, and attachments to quotes
ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS include_bank_details BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS authorized_signatory TEXT,
ADD COLUMN IF NOT EXISTS attachment_urls TEXT[];

-- Add bank details, signature, internal notes, and attachments to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS include_bank_details BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS authorized_signatory TEXT,
ADD COLUMN IF NOT EXISTS internal_notes TEXT,
ADD COLUMN IF NOT EXISTS attachment_urls TEXT[];

-- Create storage bucket for quote/invoice attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('billing-attachments', 'billing-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to billing-attachments
CREATE POLICY "Authenticated users can upload billing attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'billing-attachments');

-- Allow authenticated users to view billing attachments
CREATE POLICY "Authenticated users can view billing attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'billing-attachments');

-- Allow authenticated users to delete their billing attachments
CREATE POLICY "Authenticated users can delete billing attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'billing-attachments');