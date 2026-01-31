-- Create invoice status type
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled');

-- Create invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  
  -- Customer details
  customer_name TEXT NOT NULL,
  customer_company TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_gst TEXT,
  customer_state TEXT,
  
  -- Shipping details
  shipping_name TEXT,
  shipping_company TEXT,
  shipping_address TEXT,
  shipping_state TEXT,
  shipping_phone TEXT,
  
  -- Financial
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total_gst NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  balance_due NUMERIC NOT NULL DEFAULT 0,
  
  -- Status and dates
  status invoice_status NOT NULL DEFAULT 'draft',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  
  -- Notes
  notes TEXT,
  terms_and_conditions TEXT,
  payment_terms TEXT,
  
  -- Source tracking (from quote/order)
  source_type TEXT,
  source_id UUID,
  quote_id UUID REFERENCES public.quotes(id),
  order_id UUID REFERENCES public.orders(id),
  
  -- Audit
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- Create function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for invoice number generation
CREATE TRIGGER set_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION generate_invoice_number();

-- Create invoice items table
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  product_name TEXT NOT NULL,
  product_code TEXT,
  product_category TEXT,
  hsn_sac_code TEXT,
  description TEXT,
  
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  gst_percent NUMERIC NOT NULL DEFAULT 18,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  price_includes_gst BOOLEAN NOT NULL DEFAULT false,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoice payments table
CREATE TABLE public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference_number TEXT,
  notes TEXT,
  
  recorded_by UUID NOT NULL,
  recorded_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for invoices
CREATE POLICY "Approved users can view invoices"
ON public.invoices FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can create invoices"
ON public.invoices FOR INSERT
TO authenticated
WITH CHECK (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update invoices"
ON public.invoices FOR UPDATE
TO authenticated
USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete invoices"
ON public.invoices FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for invoice_items
CREATE POLICY "Approved users can view invoice items"
ON public.invoice_items FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can manage invoice items"
ON public.invoice_items FOR ALL
TO authenticated
USING (is_user_approved(auth.uid()));

-- RLS Policies for invoice_payments
CREATE POLICY "Approved users can view invoice payments"
ON public.invoice_payments FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can manage invoice payments"
ON public.invoice_payments FOR ALL
TO authenticated
USING (is_user_approved(auth.uid()));