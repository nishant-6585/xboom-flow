-- Add p_include_website param to get_order_profits (default false = exclude website)
CREATE OR REPLACE FUNCTION public.get_order_profits(
  p_order_ids uuid[],
  p_include_website boolean DEFAULT false
)
RETURNS TABLE(order_id uuid, total_cost numeric, total_sales numeric, profit numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.order_id = ANY(p_order_ids)
    AND oi.procurement_rate IS NOT NULL
    AND oi.procurement_rate > 0
    AND (p_include_website OR COALESCE(o.source, 'manual') <> 'website')
  GROUP BY oi.order_id
$function$;

-- Update get_sales_leaderboard to accept p_include_website
CREATE OR REPLACE FUNCTION public.get_sales_leaderboard(
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  p_include_website boolean DEFAULT false
)
RETURNS TABLE(user_id uuid, user_name text, total_points integer, leads_handled integer, orders_won integer, pipeline_created integer, total_pipeline_value numeric, total_order_value numeric, rank integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH user_stats AS (
        SELECT 
            p.user_id,
            MAX(p.name) as user_name,
            COALESCE((
                SELECT SUM(sp.points)::INTEGER 
                FROM sales_points sp 
                WHERE sp.user_id = p.user_id
                AND (start_date IS NULL OR sp.earned_at >= start_date)
                AND (end_date IS NULL OR sp.earned_at <= end_date)
            ), 0) as total_points,
            COALESCE((
                SELECT COUNT(*)::INTEGER 
                FROM enquiries e 
                WHERE e.sales_person_id = p.user_id
                AND (start_date IS NULL OR e.created_at::date >= start_date)
                AND (end_date IS NULL OR e.created_at::date <= end_date)
            ), 0) as leads_handled,
            COALESCE((
                SELECT COUNT(*)::INTEGER 
                FROM orders o 
                WHERE o.sales_person_id = p.user_id
                AND (p_include_website OR COALESCE(o.source, 'manual') <> 'website')
                AND (start_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) >= start_date)
                AND (end_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) <= end_date)
            ), 0) as orders_won,
            COALESCE((
                SELECT COUNT(*)::INTEGER 
                FROM pipeline_orders po 
                WHERE po.sales_person_id = p.user_id
                AND (start_date IS NULL OR po.created_at::date >= start_date)
                AND (end_date IS NULL OR po.created_at::date <= end_date)
            ), 0) as pipeline_created,
            COALESCE((
                SELECT SUM(COALESCE(po.expected_price, 0)) 
                FROM pipeline_orders po 
                WHERE po.sales_person_id = p.user_id
                AND po.status NOT IN ('won', 'lost')
                AND (start_date IS NULL OR po.created_at::date >= start_date)
                AND (end_date IS NULL OR po.created_at::date <= end_date)
            ), 0) as total_pipeline_value,
            COALESCE((
                SELECT SUM(COALESCE(o.total_sales_amount, 0))
                FROM orders o 
                WHERE o.sales_person_id = p.user_id
                AND (p_include_website OR COALESCE(o.source, 'manual') <> 'website')
                AND (start_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) >= start_date)
                AND (end_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) <= end_date)
            ), 0) as total_order_value
        FROM profiles p
        INNER JOIN user_roles ur ON p.user_id = ur.user_id AND ur.role = 'sales'
        WHERE p.is_approved = true
        GROUP BY p.user_id
    )
    SELECT 
        us.user_id,
        us.user_name,
        us.total_points,
        us.leads_handled,
        us.orders_won,
        us.pipeline_created,
        us.total_pipeline_value,
        us.total_order_value,
        ROW_NUMBER() OVER (ORDER BY us.total_points DESC, us.orders_won DESC)::INTEGER as rank
    FROM user_stats us
    ORDER BY rank;
END;
$function$;