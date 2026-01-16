-- Create enquiry_items table for multi-product enquiries with GST support
CREATE TABLE public.enquiry_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_code TEXT,
  product_category TEXT DEFAULT 'Consumer Drones',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  gst_percent NUMERIC DEFAULT 0,
  price_includes_gst BOOLEAN DEFAULT false,
  gst_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.enquiry_items ENABLE ROW LEVEL SECURITY;

-- Create policies for enquiry_items
CREATE POLICY "Users can view all enquiry items"
ON public.enquiry_items
FOR SELECT
USING (true);

CREATE POLICY "Users can create enquiry items"
ON public.enquiry_items
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update enquiry items"
ON public.enquiry_items
FOR UPDATE
USING (true);

CREATE POLICY "Users can delete enquiry items"
ON public.enquiry_items
FOR DELETE
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_enquiry_items_enquiry_id ON public.enquiry_items(enquiry_id);

-- Add comment
COMMENT ON TABLE public.enquiry_items IS 'Stores multiple product items for each enquiry with GST tracking';