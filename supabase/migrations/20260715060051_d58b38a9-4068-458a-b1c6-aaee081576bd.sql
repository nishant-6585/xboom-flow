-- Extend attribution request approvals + visibility + notifications to
-- supply_chain users granted via public.attribution_grants (e.g. Sanu Sabu).

-- 1) decide_attribution_request: gate via can_attribute_website_order()
CREATE OR REPLACE FUNCTION public.decide_attribution_request(p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_req public.sales_attribution_requests%ROWTYPE;
  v_order_number text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.can_attribute_website_order(v_actor) THEN
    RAISE EXCEPTION 'forbidden: admin, sales_manager, or granted users only';
  END IF;

  SELECT * INTO v_req FROM public.sales_attribution_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'request already decided'; END IF;

  SELECT COALESCE(name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;
  SELECT COALESCE(order_number, id::text) INTO v_order_number FROM public.orders WHERE id = v_req.order_id;

  IF p_approve THEN
    PERFORM public._attribute_website_order_core(
      v_req.order_id, v_req.requested_for_sales_person_id,
      v_req.reason, v_req.reason_custom,
      'approved_request', v_actor, v_actor_name
    );
  END IF;

  UPDATE public.sales_attribution_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = v_actor,
         decided_by_name = v_actor_name,
         decided_at = now(),
         decision_note = p_note
   WHERE id = p_request_id;

  INSERT INTO public.notifications (order_id, type, title, message, user_id)
  VALUES (
    v_req.order_id,
    'attribution_decision',
    CASE WHEN p_approve THEN 'Attribution approved' ELSE 'Attribution rejected' END,
    'Order ' || v_order_number || ' — ' ||
      CASE WHEN p_approve THEN 'your request was approved.' ELSE 'your request was rejected.' END ||
      COALESCE(' Note: ' || p_note, ''),
    v_req.requested_by
  );
END;
$function$;

-- 2) SELECT policy: also let attribution grant holders read pending requests
DROP POLICY IF EXISTS "Reps read their own attribution requests" ON public.sales_attribution_requests;
CREATE POLICY "Reps read their own attribution requests"
  ON public.sales_attribution_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR requested_for_sales_person_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.can_attribute_website_order(auth.uid())
  );

-- 3) request_website_order_attribution: also notify grant holders (Sanu, etc.)
CREATE OR REPLACE FUNCTION public.request_website_order_attribution(
  p_order_id uuid,
  p_reason text,
  p_reason_custom text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_locked boolean;
  v_order_number text;
  v_request_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (
    public.has_role(v_actor, 'sales')
    OR public.has_role(v_actor, 'sales_manager')
    OR public.has_role(v_actor, 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT sales_attribution_locked, COALESCE(order_number, id::text)
    INTO v_locked, v_order_number
    FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_locked THEN RAISE EXCEPTION 'order is already attributed'; END IF;

  IF EXISTS (SELECT 1 FROM public.sales_attribution_requests
              WHERE order_id = p_order_id AND status = 'pending') THEN
    RAISE EXCEPTION 'a pending request already exists for this order';
  END IF;

  SELECT COALESCE(name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;

  INSERT INTO public.sales_attribution_requests (
    order_id, requested_by, requested_by_name,
    requested_for_sales_person_id, requested_for_name,
    reason, reason_custom
  ) VALUES (
    p_order_id, v_actor, v_actor_name,
    v_actor, v_actor_name, p_reason, p_reason_custom
  ) RETURNING id INTO v_request_id;

  -- Notify every admin + sales_manager + attribution grant holder (e.g. Sanu Sabu)
  INSERT INTO public.notifications (order_id, type, title, message, user_id)
  SELECT p_order_id,
         'attribution_request',
         'Attribution request: ' || COALESCE(v_actor_name, 'a rep'),
         COALESCE(v_actor_name, 'A rep') || ' is requesting credit for order ' || v_order_number,
         u.user_id
    FROM (
      SELECT ur.user_id FROM public.user_roles ur
       WHERE ur.role IN ('admin', 'sales_manager')
      UNION
      SELECT ag.user_id FROM public.attribution_grants ag
    ) u
   WHERE u.user_id <> v_actor;

  RETURN v_request_id;
END;
$$;