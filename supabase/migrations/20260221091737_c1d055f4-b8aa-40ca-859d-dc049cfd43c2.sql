
CREATE OR REPLACE FUNCTION public.get_low_stock_items()
RETURNS TABLE(
  id uuid,
  product_name text,
  product_category text,
  current_stock integer,
  reorder_point integer,
  safety_stock integer,
  last_alert_sent_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.product_name, i.product_category, i.current_stock, i.reorder_point, i.safety_stock, i.last_alert_sent_at
  FROM public.inventory i
  WHERE i.reorder_point > 0
    AND i.current_stock <= i.reorder_point;
$$;
