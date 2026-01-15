-- Create import_items table for multiple products per import
CREATE TABLE public.import_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_category TEXT,
  product_code TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC,
  total_amount NUMERIC,
  hsn_code TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view import items"
ON public.import_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create import items"
ON public.import_items
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update import items"
ON public.import_items
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete import items"
ON public.import_items
FOR DELETE
TO authenticated
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_import_items_import_id ON public.import_items(import_id);