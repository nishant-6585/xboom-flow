-- Create supplier_ratings table for tracking performance
CREATE TABLE public.supplier_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  inventory_procurement_id UUID REFERENCES public.inventory_procurements(id) ON DELETE SET NULL,
  
  -- Rating metrics (1-5 scale)
  delivery_rating INTEGER CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  pricing_rating INTEGER CHECK (pricing_rating >= 1 AND pricing_rating <= 5),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  
  -- Additional context
  delivery_days_promised INTEGER,
  delivery_days_actual INTEGER,
  notes TEXT,
  
  -- Audit fields
  rated_by UUID,
  rated_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.supplier_ratings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admin can manage supplier ratings"
ON public.supplier_ratings FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can manage supplier ratings"
ON public.supplier_ratings FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Finance can view supplier ratings"
ON public.supplier_ratings FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Create indexes
CREATE INDEX idx_supplier_ratings_supplier_id ON public.supplier_ratings(supplier_id);
CREATE INDEX idx_supplier_ratings_order_id ON public.supplier_ratings(order_id);

-- Create a function to calculate supplier score
CREATE OR REPLACE FUNCTION public.get_supplier_score(p_supplier_id UUID)
RETURNS TABLE (
  total_ratings BIGINT,
  avg_delivery NUMERIC,
  avg_quality NUMERIC,
  avg_pricing NUMERIC,
  avg_communication NUMERIC,
  overall_score NUMERIC,
  on_time_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_ratings,
    ROUND(AVG(delivery_rating)::NUMERIC, 1) as avg_delivery,
    ROUND(AVG(quality_rating)::NUMERIC, 1) as avg_quality,
    ROUND(AVG(pricing_rating)::NUMERIC, 1) as avg_pricing,
    ROUND(AVG(communication_rating)::NUMERIC, 1) as avg_communication,
    ROUND(
      (COALESCE(AVG(delivery_rating), 0) + 
       COALESCE(AVG(quality_rating), 0) + 
       COALESCE(AVG(pricing_rating), 0) + 
       COALESCE(AVG(communication_rating), 0)) / 4.0::NUMERIC, 
      1
    ) as overall_score,
    ROUND(
      CASE 
        WHEN COUNT(*) FILTER (WHERE delivery_days_promised IS NOT NULL AND delivery_days_actual IS NOT NULL) > 0 
        THEN (COUNT(*) FILTER (WHERE delivery_days_actual <= delivery_days_promised)::NUMERIC / 
              NULLIF(COUNT(*) FILTER (WHERE delivery_days_promised IS NOT NULL AND delivery_days_actual IS NOT NULL), 0)::NUMERIC) * 100
        ELSE NULL
      END::NUMERIC, 
      0
    ) as on_time_percentage
  FROM public.supplier_ratings
  WHERE supplier_id = p_supplier_id;
END;
$$;