-- First, update invoice_status enum to include new states
-- We need to add 'pending_signature' and 'signed' to the enum
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'pending_signature';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'signed';

-- Create admin_signatures table for storing admin signature images
CREATE TABLE public.admin_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL UNIQUE,
  signature_url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on admin_signatures
ALTER TABLE public.admin_signatures ENABLE ROW LEVEL SECURITY;

-- Only admins can view signatures
CREATE POLICY "Admins can view signatures"
ON public.admin_signatures
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Only admin owner can manage their signature
CREATE POLICY "Admin can manage own signature"
ON public.admin_signatures
FOR ALL
TO authenticated
USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

-- Create invoice_audit_logs table (read-only audit trail)
CREATE TABLE public.invoice_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  invoice_version INTEGER NOT NULL DEFAULT 1,
  action TEXT NOT NULL,
  signed_by UUID,
  signed_by_name TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  invoice_hash TEXT,
  pdf_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.invoice_audit_logs ENABLE ROW LEVEL SECURITY;

-- Everyone can view audit logs (read-only)
CREATE POLICY "Authenticated users can view invoice audit logs"
ON public.invoice_audit_logs
FOR SELECT
TO authenticated
USING (public.is_user_approved(auth.uid()));

-- Only system can insert audit logs (via trigger or edge function)
-- No update or delete allowed

-- Add signature-related columns to invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS signed_by UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS signed_by_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_hash TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS submitted_for_signature_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS submitted_by UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS submitted_by_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Create storage bucket for admin signatures (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('admin-signatures', 'admin-signatures', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for admin-signatures bucket
CREATE POLICY "Admins can upload their signature"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'admin-signatures' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view signatures"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'admin-signatures' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update their signature"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'admin-signatures' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'admin-signatures' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete their signature"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'admin-signatures' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for signed invoice PDFs (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('signed-invoices', 'signed-invoices', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for signed-invoices bucket
CREATE POLICY "Authenticated users can view signed invoices"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'signed-invoices' AND public.is_user_approved(auth.uid()));

CREATE POLICY "Admins can upload signed invoices"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'signed-invoices' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Create function to prevent editing signed invoices
CREATE OR REPLACE FUNCTION public.prevent_signed_invoice_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'signed' AND NEW.status != 'signed' THEN
    RAISE EXCEPTION 'Cannot modify a signed invoice';
  END IF;
  
  IF OLD.status = 'signed' AND (
    NEW.customer_name != OLD.customer_name OR
    NEW.customer_company IS DISTINCT FROM OLD.customer_company OR
    NEW.total_amount != OLD.total_amount OR
    NEW.subtotal != OLD.subtotal OR
    NEW.total_gst != OLD.total_gst
  ) THEN
    RAISE EXCEPTION 'Cannot modify a signed invoice';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to prevent signed invoice edits
DROP TRIGGER IF EXISTS prevent_signed_invoice_edit_trigger ON public.invoices;
CREATE TRIGGER prevent_signed_invoice_edit_trigger
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.prevent_signed_invoice_edit();

-- Create function to prevent signed invoice deletion (only archive allowed)
CREATE OR REPLACE FUNCTION public.prevent_signed_invoice_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Cannot delete a signed invoice. Use archive instead.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to prevent signed invoice deletion
DROP TRIGGER IF EXISTS prevent_signed_invoice_delete_trigger ON public.invoices;
CREATE TRIGGER prevent_signed_invoice_delete_trigger
BEFORE DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.prevent_signed_invoice_delete();

-- Create function to log invoice signing
CREATE OR REPLACE FUNCTION public.log_invoice_signing()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS NULL OR OLD.status != 'signed') THEN
    INSERT INTO public.invoice_audit_logs (
      invoice_id,
      invoice_number,
      invoice_version,
      action,
      signed_by,
      signed_by_name,
      signed_at,
      invoice_hash,
      pdf_url,
      metadata
    ) VALUES (
      NEW.id,
      NEW.invoice_number,
      NEW.version,
      'signed',
      NEW.signed_by,
      NEW.signed_by_name,
      NEW.signed_at,
      NEW.invoice_hash,
      NEW.pdf_url,
      jsonb_build_object(
        'total_amount', NEW.total_amount,
        'customer_name', NEW.customer_name,
        'customer_company', NEW.customer_company
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS log_invoice_signing_trigger ON public.invoices;
CREATE TRIGGER log_invoice_signing_trigger
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.log_invoice_signing();