-- Drop and recreate the leaderboard function to count actual orders
CREATE OR REPLACE FUNCTION public.get_sales_leaderboard(start_date DATE DEFAULT NULL, end_date DATE DEFAULT NULL)
RETURNS TABLE (
    user_id UUID,
    user_name TEXT,
    total_points INTEGER,
    leads_handled INTEGER,
    orders_won INTEGER,
    pipeline_created INTEGER,
    total_pipeline_value NUMERIC,
    rank INTEGER
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH user_stats AS (
        SELECT 
            p.user_id,
            MAX(p.name) as user_name,
            -- Points from sales_points table
            COALESCE((
                SELECT SUM(sp.points)::INTEGER 
                FROM sales_points sp 
                WHERE sp.user_id = p.user_id
                AND (start_date IS NULL OR sp.earned_at >= start_date)
                AND (end_date IS NULL OR sp.earned_at <= end_date)
            ), 0) as total_points,
            -- Leads from enquiries table (enquiries handled by user)
            COALESCE((
                SELECT COUNT(*)::INTEGER 
                FROM enquiries e 
                WHERE e.sales_person_id = p.user_id
                AND (start_date IS NULL OR e.created_at::date >= start_date)
                AND (end_date IS NULL OR e.created_at::date <= end_date)
            ), 0) as leads_handled,
            -- Orders won from orders table (actual orders created by user)
            COALESCE((
                SELECT COUNT(*)::INTEGER 
                FROM orders o 
                WHERE o.sales_person_id = p.user_id
                AND (start_date IS NULL OR o.created_at::date >= start_date)
                AND (end_date IS NULL OR o.created_at::date <= end_date)
            ), 0) as orders_won,
            -- Pipeline created from pipeline_orders table
            COALESCE((
                SELECT COUNT(*)::INTEGER 
                FROM pipeline_orders po 
                WHERE po.sales_person_id = p.user_id
                AND (start_date IS NULL OR po.created_at::date >= start_date)
                AND (end_date IS NULL OR po.created_at::date <= end_date)
            ), 0) as pipeline_created,
            -- Total pipeline value
            COALESCE((
                SELECT SUM(COALESCE(po.expected_price, 0)) 
                FROM pipeline_orders po 
                WHERE po.sales_person_id = p.user_id
                AND po.status NOT IN ('won', 'lost')
                AND (start_date IS NULL OR po.created_at::date >= start_date)
                AND (end_date IS NULL OR po.created_at::date <= end_date)
            ), 0) as total_pipeline_value
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
        ROW_NUMBER() OVER (ORDER BY us.total_points DESC, us.orders_won DESC)::INTEGER as rank
    FROM user_stats us
    ORDER BY rank;
END;
$$;