-- 1. get_order_profits: treat system-owned rows same as website in the toggle
CREATE OR REPLACE FUNCTION public.get_order_profits(p_order_ids uuid[], p_include_website boolean DEFAULT false)
RETURNS TABLE(order_id uuid, total_cost numeric, total_sales numeric, profit numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    AND (
      p_include_website
      OR (
        COALESCE(o.source, 'manual') <> 'website'
        AND o.sales_person_id IS DISTINCT FROM 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
      )
    )
  GROUP BY oi.order_id
$function$;

-- 2. get_sales_team: hide system ingestion user from manager pickers/leaderboards
CREATE OR REPLACE FUNCTION public.get_sales_team()
RETURNS TABLE(user_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.is_approved = true
    AND ur.role = 'sales'::app_role
    AND p.user_id <> 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
    AND is_user_approved(auth.uid())
  ORDER BY p.name ASC;
$function$;

-- 3. get_sales_leaderboard: exclude system ingestion user from rankings.
--    Wrap the existing body in a filter on the final CTE. We rebuild the
--    function to add a NOT-EQUAL guard on user_stats.user_id.
DO $$
DECLARE
  existing_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO existing_def
  FROM pg_proc
  WHERE proname = 'get_sales_leaderboard'
    AND pg_get_function_identity_arguments(oid) = 'start_date date, end_date date';
  IF existing_def IS NULL THEN
    RAISE EXCEPTION 'get_sales_leaderboard(date,date) not found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_sales_leaderboard(start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
RETURNS TABLE(user_id uuid, user_name text, total_points integer, leads_handled integer, orders_won integer, pipeline_created integer, total_pipeline_value numeric, total_order_value numeric, rank integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH user_stats AS (
        SELECT
            p.user_id,
            MAX(p.name) as user_name,
            COALESCE((
                SELECT SUM(sp.points)::INTEGER FROM sales_points sp
                WHERE sp.user_id = p.user_id
                AND (start_date IS NULL OR sp.earned_at >= start_date)
                AND (end_date IS NULL OR sp.earned_at <= end_date)
            ), 0) as total_points,
            COALESCE((
                SELECT COUNT(*)::INTEGER FROM enquiries e
                WHERE e.sales_person_id = p.user_id
                AND (start_date IS NULL OR e.created_at::date >= start_date)
                AND (end_date IS NULL OR e.created_at::date <= end_date)
            ), 0) as leads_handled,
            COALESCE((
                SELECT COUNT(*)::INTEGER FROM orders o
                WHERE o.sales_person_id = p.user_id
                AND (start_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) >= start_date)
                AND (end_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) <= end_date)
            ), 0) as orders_won,
            COALESCE((
                SELECT COUNT(*)::INTEGER FROM pipeline_orders po
                WHERE po.sales_person_id = p.user_id
                AND (start_date IS NULL OR po.created_at::date >= start_date)
                AND (end_date IS NULL OR po.created_at::date <= end_date)
            ), 0) as pipeline_created,
            COALESCE((
                SELECT SUM(po.expected_price)::NUMERIC FROM pipeline_orders po
                WHERE po.sales_person_id = p.user_id
                AND (start_date IS NULL OR po.created_at::date >= start_date)
                AND (end_date IS NULL OR po.created_at::date <= end_date)
            ), 0) as total_pipeline_value,
            COALESCE((
                SELECT SUM(o.total_sales_amount)::NUMERIC FROM orders o
                WHERE o.sales_person_id = p.user_id
                AND (start_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) >= start_date)
                AND (end_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) <= end_date)
            ), 0) as total_order_value
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.user_id
        WHERE ur.role = 'sales'::app_role
          AND p.is_approved = true
          AND p.user_id <> 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
        GROUP BY p.user_id
    )
    SELECT
        us.user_id, us.user_name, us.total_points, us.leads_handled,
        us.orders_won, us.pipeline_created, us.total_pipeline_value, us.total_order_value,
        RANK() OVER (ORDER BY us.total_points DESC, us.total_order_value DESC)::INTEGER as rank
    FROM user_stats us
    ORDER BY rank;
END;
$function$;