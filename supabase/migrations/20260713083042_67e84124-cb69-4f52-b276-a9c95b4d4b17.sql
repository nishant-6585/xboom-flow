
CREATE OR REPLACE FUNCTION public.list_sales_attribution_candidates()
RETURNS TABLE(user_id uuid, name text, email text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT ur.user_id,
           CASE
             WHEN bool_or(ur.role = 'sales_manager'::app_role) THEN 'sales_manager'
             WHEN bool_or(ur.role = 'sales'::app_role) THEN 'sales'
           END AS r
    FROM public.user_roles ur
    WHERE ur.role IN ('sales'::app_role, 'sales_manager'::app_role)
    GROUP BY ur.user_id
  )
  SELECT p.user_id,
         COALESCE(pr.name, pr.email, 'Unknown')::text AS name,
         pr.email::text,
         p.r::text AS role
  FROM picked p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE COALESCE(pr.is_approved, true) = true
  ORDER BY name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_sales_attribution_candidates() TO authenticated;
