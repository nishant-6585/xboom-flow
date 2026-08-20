CREATE OR REPLACE FUNCTION public.update_attribution_request(
  p_request_id uuid,
  p_reason text,
  p_reason_custom text DEFAULT NULL,
  p_evidence jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.sales_attribution_requests;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_req FROM public.sales_attribution_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.requested_by <> v_actor THEN
    RAISE EXCEPTION 'forbidden: you can only edit your own request';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending requests can be edited';
  END IF;
  IF p_evidence IS NULL OR jsonb_array_length(p_evidence) = 0 THEN
    RAISE EXCEPTION 'evidence required: attach at least one proof item';
  END IF;

  UPDATE public.sales_attribution_requests
     SET reason = p_reason,
         reason_custom = p_reason_custom,
         evidence = p_evidence
   WHERE id = p_request_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_attribution_request(uuid, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_attribution_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.sales_attribution_requests;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_req FROM public.sales_attribution_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.requested_by <> v_actor THEN
    RAISE EXCEPTION 'forbidden: you can only withdraw your own request';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending requests can be withdrawn';
  END IF;

  DELETE FROM public.sales_attribution_requests WHERE id = p_request_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.withdraw_attribution_request(uuid) TO authenticated;