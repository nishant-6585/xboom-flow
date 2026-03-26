CREATE OR REPLACE FUNCTION public.get_order_profits(p_order_ids uuid[])
RETURNS TABLE(order_id uuid, total_cost numeric, total_sales numeric, profit numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    oi.order_id,
    SUM(
      CASE 
        WHEN oi.procurement_price_includes_gst THEN 
          (COALESCE(oi.procurement_rate, 0) - COALESCE(oi.procurement_gst_amount, 0)) * oi.quantity
        ELSE 
          COALESCE(oi.procurement_rate, 0) * oi.quantity
      END
    ) as total_cost,
    SUM(
      CASE 
        WHEN oi.sales_price_includes_gst THEN 
          (COALESCE(oi.unit_price, 0) - COALESCE(oi.sales_gst_amount, 0)) * oi.quantity
        ELSE 
          COALESCE(oi.unit_price, 0) * oi.quantity
      END
    ) as total_sales,
    SUM(
      CASE 
        WHEN oi.sales_price_includes_gst THEN 
          (COALESCE(oi.unit_price, 0) - COALESCE(oi.sales_gst_amount, 0)) * oi.quantity
        ELSE 
          COALESCE(oi.unit_price, 0) * oi.quantity
      END
    ) - SUM(
      CASE 
        WHEN oi.procurement_price_includes_gst THEN 
          (COALESCE(oi.procurement_rate, 0) - COALESCE(oi.procurement_gst_amount, 0)) * oi.quantity
        ELSE 
          COALESCE(oi.procurement_rate, 0) * oi.quantity
      END
    ) as profit
  FROM order_items oi
  WHERE oi.order_id = ANY(p_order_ids)
    AND oi.procurement_rate IS NOT NULL
    AND oi.procurement_rate > 0
  GROUP BY oi.order_id
$$