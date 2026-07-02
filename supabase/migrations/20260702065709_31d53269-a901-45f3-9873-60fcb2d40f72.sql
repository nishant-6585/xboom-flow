-- 1) Zoho tokens: revoke direct client SELECT (service_role bypasses RLS and continues to work)
DROP POLICY IF EXISTS "Admins read zoho tokens metadata" ON public.zoho_tokens;

-- 2) Notifications: remove permissive insert; require service_role or controlled RPC
DROP POLICY IF EXISTS "System can create escalation notifications" ON public.notifications;

CREATE POLICY "Service role manages notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3) SECURITY DEFINER RPC for order escalation notifications
CREATE OR REPLACE FUNCTION public.create_order_escalation_notification(
  p_order_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_order record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only approved staff with a relevant role can create escalations
  IF NOT public.is_user_approved(v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT (
    public.has_role(v_caller, 'admin'::app_role)
    OR public.has_role(v_caller, 'sales'::app_role)
    OR public.has_role(v_caller, 'sales_manager'::app_role)
    OR public.has_role(v_caller, 'supply_chain'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to escalate orders';
  END IF;

  SELECT id, customer_name, customer_company, product_name
    INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.notifications (order_id, type, title, message, target_role)
  VALUES (
    p_order_id,
    'order_escalation',
    'Order Escalated - Priority 1',
    'Order for ' || COALESCE(v_order.customer_name, 'Unknown')
      || ' (' || COALESCE(v_order.customer_company, 'Unknown') || ') - '
      || COALESCE(v_order.product_name, 'Unknown')
      || ' has been escalated. Reason: ' || COALESCE(p_reason, ''),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_escalation_notification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_escalation_notification(uuid, text) TO authenticated;