DROP FUNCTION IF EXISTS public._attribute_website_order_core(uuid, uuid, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.decide_attribution_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
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
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.can_attribute_website_order(v_actor) THEN
    RAISE EXCEPTION 'forbidden: admin, sales_manager, or granted users only';
  END IF;

  SELECT *
    INTO v_req
    FROM public.sales_attribution_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided';
  END IF;

  SELECT COALESCE(name, email)
    INTO v_actor_name
    FROM public.profiles
   WHERE user_id = v_actor;

  SELECT COALESCE(order_number, id::text)
    INTO v_order_number
    FROM public.orders
   WHERE id = v_req.order_id;

  IF p_approve THEN
    PERFORM public._attribute_website_order_core(
      v_req.order_id,
      v_req.requested_for_sales_person_id,
      v_req.reason,
      v_req.reason_custom,
      'approved_request',
      v_actor,
      v_actor_name,
      COALESCE(v_req.evidence, '[]'::jsonb)
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

REVOKE ALL ON FUNCTION public.decide_attribution_request(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_attribution_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_attribution_request(uuid, boolean, text) TO service_role;