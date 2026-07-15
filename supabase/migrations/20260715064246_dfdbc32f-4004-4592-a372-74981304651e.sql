-- Attribution evidence: approvers asked for proof that a rep actually closed a
-- website order before crediting it. This adds structured evidence to BOTH paths:
--   * rep-raised requests (sales_attribution_requests.evidence) — REQUIRED (>=1 item)
--   * direct changes by admin/sales_manager/granted users like Sanu Sabu
--     (sales_attribution_log.evidence) — captured from the Assign dialog; not
--     hard-required server-side so bulk-reassign/reconcile flows keep working.
--
-- Evidence item shapes (jsonb array):
--   {"type":"call_log","call_log_id":uuid,"caller_number":text,"called_at":ts,
--    "duration":int,"call_type":text,"recording_url":text}
--   {"type":"file","path":text,"name":text,"size":int,"mime":text}
-- Call-log items are the strong proof: the picker only offers calls whose number
-- matches the order's customer phone, so approvers can verify date < order date.

-- 1) Columns ------------------------------------------------------------------
ALTER TABLE public.sales_attribution_requests
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.sales_attribution_log
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Private bucket for uploaded evidence files (WhatsApp exports, emails…) ----
INSERT INTO storage.buckets (id, name, public)
VALUES ('attribution-evidence', 'attribution-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Files live under <uploader auth.uid()>/<order_id>/<ts>-<name>.
DROP POLICY IF EXISTS "attribution-evidence: staff upload own" ON storage.objects;
CREATE POLICY "attribution-evidence: staff upload own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attribution-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.can_attribute_website_order(auth.uid())
  )
);

-- Read: the uploader, plus anyone who can decide (admin / sales_manager /
-- attribution grant holders — e.g. Sanu Sabu).
DROP POLICY IF EXISTS "attribution-evidence: owner or approver read" ON storage.objects;
CREATE POLICY "attribution-evidence: owner or approver read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attribution-evidence'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.can_attribute_website_order(auth.uid())
  )
);

-- Uploader may delete their own file (e.g. removing an item before submitting).
DROP POLICY IF EXISTS "attribution-evidence: owner delete" ON storage.objects;
CREATE POLICY "attribution-evidence: owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attribution-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) Core RPC: carry evidence into the attribution log -------------------------
-- Postgres overloads by arg count, so adding a DEFAULT param would leave the old
-- signature in place and make 7-arg calls ambiguous — DROP it first.
DROP FUNCTION IF EXISTS public._attribute_website_order_core(uuid, uuid, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public._attribute_website_order_core(
  p_order_id uuid,
  p_sales_person_id uuid,
  p_reason text,
  p_reason_custom text,
  p_source text,
  p_actor_id uuid,
  p_actor_name text,
  p_evidence jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_id uuid;
  v_rep_name text;
  v_order_number text;
  v_total numeric;
BEGIN
  IF p_source NOT IN ('direct','approved_request','reconcile') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

  PERFORM set_config('app.attribution_rpc', 'on', true);

  SELECT sales_person_id, COALESCE(order_number, id::text), COALESCE(total_sales_amount, 0)
    INTO v_from_id, v_order_number, v_total
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  SELECT COALESCE(name, email, 'Unknown') INTO v_rep_name
    FROM public.profiles WHERE user_id = p_sales_person_id;

  UPDATE public.orders
     SET sales_person_id = p_sales_person_id,
         sales_person_name = COALESCE(v_rep_name, sales_person_name),
         sales_attribution_locked = true,
         sales_attribution_reason = p_reason,
         sales_attribution_reason_custom = p_reason_custom,
         attributed_by = p_actor_id,
         attributed_by_name = p_actor_name,
         attributed_at = now(),
         source = 'manual',
         lead_source = COALESCE(lead_source, 'website'),
         updated_at = now()
   WHERE id = p_order_id;

  DELETE FROM public.sales_points
   WHERE reference_id = p_order_id
     AND category IN ('order_created','order_value');

  INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
  VALUES (p_sales_person_id, 10, 'order_created',
          'Points for creating order ' || v_order_number, p_order_id);

  IF v_total > 0 THEN
    INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
    VALUES (p_sales_person_id, LEAST(500, GREATEST(1, floor(v_total / 1000)::int)),
            'order_value',
            'Points for order value ' || v_total, p_order_id);
  END IF;

  INSERT INTO public.sales_attribution_log (
    order_id, from_sales_person_id, to_sales_person_id, to_sales_person_name,
    changed_by, changed_by_name, source, reason, reason_custom, evidence
  ) VALUES (
    p_order_id, v_from_id, p_sales_person_id, v_rep_name,
    p_actor_id, p_actor_name, p_source, p_reason, p_reason_custom,
    COALESCE(p_evidence, '[]'::jsonb)
  );
END;
$function$;

-- 4) Direct change (admin / sales_manager / granted — e.g. Sanu Sabu) ----------
DROP FUNCTION IF EXISTS public.attribute_website_order(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.attribute_website_order(
  p_order_id uuid,
  p_sales_person_id uuid,
  p_reason text,
  p_reason_custom text DEFAULT NULL::text,
  p_evidence jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.can_attribute_website_order(v_actor) THEN
    RAISE EXCEPTION 'forbidden: admin, sales_manager, or granted users only';
  END IF;
  SELECT COALESCE(name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;
  PERFORM public._attribute_website_order_core(
    p_order_id, p_sales_person_id, p_reason, p_reason_custom,
    'direct', v_actor, v_actor_name, COALESCE(p_evidence, '[]'::jsonb)
  );
END;
$function$;

-- 5) Rep request: evidence REQUIRED (>=1 item) ---------------------------------
DROP FUNCTION IF EXISTS public.request_website_order_attribution(uuid, text, text);

CREATE OR REPLACE FUNCTION public.request_website_order_attribution(
  p_order_id uuid,
  p_reason text,
  p_reason_custom text DEFAULT NULL,
  p_evidence jsonb DEFAULT '[]'::jsonb
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

  -- Approvers require proof the rep closed the deal (call log matched to the
  -- customer's number, WhatsApp/email export, pre-dated lead, quote…).
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array'
     OR jsonb_array_length(p_evidence) = 0 THEN
    RAISE EXCEPTION 'evidence required: attach at least one proof item (call log, chat, email, or document)';
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
    reason, reason_custom, evidence
  ) VALUES (
    p_order_id, v_actor, v_actor_name,
    v_actor, v_actor_name, p_reason, p_reason_custom, p_evidence
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

-- 6) decide: copy the request's evidence into the attribution log on approval --
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
      'approved_request', v_actor, v_actor_name,
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
