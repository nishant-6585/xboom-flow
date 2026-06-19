CREATE OR REPLACE FUNCTION public.get_orders_kyc_status(p_order_ids uuid[])
RETURNS TABLE(order_id uuid, kyc_status text, has_portal_account boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id AS order_id,
    pa.kyc_status::text AS kyc_status,
    (pa.id IS NOT NULL) AS has_portal_account
  FROM public.orders o
  LEFT JOIN public.portal_contacts pc
    ON pc.email IS NOT NULL
   AND lower(pc.email) = lower(o.customer_email)
  LEFT JOIN public.portal_accounts pa
    ON pa.id = pc.account_id
  WHERE o.id = ANY(p_order_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_orders_kyc_status(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_kyc_status(uuid[]) TO authenticated;