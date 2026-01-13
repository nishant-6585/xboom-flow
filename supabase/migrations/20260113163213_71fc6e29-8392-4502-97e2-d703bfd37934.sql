-- Add probability column to pipeline_orders table
ALTER TABLE public.pipeline_orders 
ADD COLUMN probability integer DEFAULT 50 CHECK (probability >= 0 AND probability <= 100);