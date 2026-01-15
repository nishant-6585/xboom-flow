-- Create imports table for tracking import shipments and documents
CREATE TABLE public.imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_number TEXT UNIQUE,
  supplier_id UUID REFERENCES public.suppliers(id),
  supplier_name TEXT,
  product_name TEXT NOT NULL,
  product_category TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC,
  total_amount NUMERIC,
  currency TEXT DEFAULT 'USD',
  
  -- Shipment details
  origin_country TEXT,
  port_of_origin TEXT,
  port_of_destination TEXT,
  shipping_method TEXT, -- sea, air, land
  shipping_line TEXT,
  container_number TEXT,
  bl_number TEXT, -- Bill of Lading number
  
  -- Timeline
  order_date DATE,
  expected_arrival DATE,
  actual_arrival DATE,
  clearance_date DATE,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'in_transit', 'at_port', 'customs_clearance', 'cleared', 'delivered', 'cancelled')),
  
  -- Document URLs (stored in storage)
  po_document_url TEXT,
  payment_proof_url TEXT,
  courier_document_url TEXT,
  bill_of_entry_url TEXT,
  packing_list_url TEXT,
  commercial_invoice_url TEXT,
  other_documents_urls TEXT[],
  
  -- Payment details
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid')),
  payment_amount NUMERIC,
  payment_date DATE,
  
  -- Notes
  notes TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  created_by_name TEXT
);

-- Enable RLS
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view imports"
ON public.imports
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create imports"
ON public.imports
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update imports"
ON public.imports
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete imports"
ON public.imports
FOR DELETE
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_imports_updated_at
BEFORE UPDATE ON public.imports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for import documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('import-documents', 'import-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for import documents
CREATE POLICY "Authenticated users can upload import documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'import-documents');

CREATE POLICY "Authenticated users can view import documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'import-documents');

CREATE POLICY "Authenticated users can update import documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'import-documents');

CREATE POLICY "Authenticated users can delete import documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'import-documents');