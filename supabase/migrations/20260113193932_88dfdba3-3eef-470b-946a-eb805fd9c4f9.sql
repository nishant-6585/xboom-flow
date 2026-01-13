-- Add enquiry_id column to pipeline_orders to track the source enquiry
ALTER TABLE public.pipeline_orders 
ADD COLUMN enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_pipeline_orders_enquiry_id ON public.pipeline_orders(enquiry_id);