CREATE OR REPLACE FUNCTION public.get_sales_leaderboard(start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date, p_include_website boolean DEFAULT false)
RETURNS TABLE(user_id uuid, user_name text, total_points integer, leads_handled integer, orders_won integer, pipeline_created integer, total_pipeline_value numeric, total_order_value numeric, rank integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT
      p.user_id,
      MAX(p.name) AS user_name,
      COALESCE((
        SELECT SUM(sp.points)::int FROM sales_points sp
        WHERE sp.user_id = p.user_id
          AND (start_date IS NULL OR sp.earned_at >= start_date)
          AND (end_date IS NULL OR sp.earned_at <= end_date)
          AND (
            p_include_website
            OR sp.reference_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM orders o2
              WHERE o2.id = sp.reference_id
                AND COALESCE(o2.source,'manual') = 'website'
                AND COALESCE(o2.sales_attribution_locked, false) = false
            )
          )
      ), 0) AS total_points,
      COALESCE((
        SELECT COUNT(*)::int FROM enquiries e
        WHERE e.sales_person_id = p.user_id
          AND (start_date IS NULL OR e.created_at::date >= start_date)
          AND (end_date IS NULL OR e.created_at::date <= end_date)
      ), 0) AS leads_handled,
      COALESCE((
        SELECT COUNT(*)::int FROM orders o
        WHERE o.sales_person_id = p.user_id
          AND (
            p_include_website
            OR COALESCE(o.source,'manual') <> 'website'
            OR COALESCE(o.sales_attribution_locked, false) = true
          )
          AND (start_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) >= start_date)
          AND (end_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) <= end_date)
      ), 0) AS orders_won,
      COALESCE((
        SELECT COUNT(*)::int FROM pipeline_orders po
        WHERE po.sales_person_id = p.user_id
          AND (start_date IS NULL OR po.created_at::date >= start_date)
          AND (end_date IS NULL OR po.created_at::date <= end_date)
      ), 0) AS pipeline_created,
      COALESCE((
        SELECT SUM(COALESCE(po.expected_price, 0)) FROM pipeline_orders po
        WHERE po.sales_person_id = p.user_id
          AND po.status NOT IN ('won','lost')
          AND (start_date IS NULL OR po.created_at::date >= start_date)
          AND (end_date IS NULL OR po.created_at::date <= end_date)
      ), 0) AS total_pipeline_value,
      COALESCE((
        SELECT SUM(COALESCE(o.total_sales_amount, 0)) FROM orders o
        WHERE o.sales_person_id = p.user_id
          AND (
            p_include_website
            OR COALESCE(o.source,'manual') <> 'website'
            OR COALESCE(o.sales_attribution_locked, false) = true
          )
          AND (start_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) >= start_date)
          AND (end_date IS NULL OR COALESCE(o.order_date::date, o.created_at::date) <= end_date)
      ), 0) AS total_order_value
    FROM profiles p
    INNER JOIN user_roles ur ON p.user_id = ur.user_id AND ur.role = 'sales'
    WHERE p.is_approved = true
      -- Exclude the system ingestion user (Vishal / WooCommerce pool) from
      -- rep-performance groupings. It's a pool, not a rep. Any order still
      -- owned by this user is treated as unattributed for analytics.
      AND p.user_id <> 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
    GROUP BY p.user_id
  )
  SELECT us.user_id, us.user_name, us.total_points, us.leads_handled, us.orders_won,
         us.pipeline_created, us.total_pipeline_value, us.total_order_value,
         ROW_NUMBER() OVER (ORDER BY us.total_points DESC, us.orders_won DESC)::int AS rank
    FROM user_stats us
   WHERE p_include_website
      OR us.total_points > 0
      OR us.leads_handled > 0
      OR us.orders_won > 0
      OR us.pipeline_created > 0
   ORDER BY rank;
END;
$function$;