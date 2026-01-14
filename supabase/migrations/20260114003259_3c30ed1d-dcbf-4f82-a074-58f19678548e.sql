-- Add lead_temperature column to enquiries table
ALTER TABLE public.enquiries 
ADD COLUMN lead_temperature TEXT DEFAULT 'warm' CHECK (lead_temperature IN ('hot', 'warm', 'cold'));

-- Add is_mega_deal column to enquiries table
ALTER TABLE public.enquiries 
ADD COLUMN is_mega_deal BOOLEAN DEFAULT false;

-- Add lead_temperature column to pipeline_orders table
ALTER TABLE public.pipeline_orders 
ADD COLUMN lead_temperature TEXT DEFAULT 'warm' CHECK (lead_temperature IN ('hot', 'warm', 'cold'));

-- Add is_mega_deal column to pipeline_orders table
ALTER TABLE public.pipeline_orders 
ADD COLUMN is_mega_deal BOOLEAN DEFAULT false;

-- Create index for filtering hot leads and mega deals
CREATE INDEX idx_enquiries_lead_temperature ON public.enquiries(lead_temperature);
CREATE INDEX idx_enquiries_is_mega_deal ON public.enquiries(is_mega_deal);
CREATE INDEX idx_pipeline_orders_lead_temperature ON public.pipeline_orders(lead_temperature);
CREATE INDEX idx_pipeline_orders_is_mega_deal ON public.pipeline_orders(is_mega_deal);