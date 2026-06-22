
-- 1) Extend orders with attribution fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sales_attribution_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_attribution_reason text,
  ADD COLUMN IF NOT EXISTS sales_attribution_reason_custom text,
  ADD COLUMN IF NOT EXISTS attributed_by uuid,
  ADD COLUMN IF NOT EXISTS attributed_by_name text,
  ADD COLUMN IF NOT EXISTS attributed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_sales_attribution_locked
  ON public.orders (sales_attribution_locked) WHERE sales_attribution_locked = true;

-- 2) sales_attribution_log
CREATE TABLE IF NOT EXISTS public.sales_attribution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_sales_person_id uuid,
  to_sales_person_id uuid NOT NULL,
  to_sales_person_name text NOT NULL,
  reason text,
  reason_custom text,
  changed_by uuid,
  changed_by_name text,
  source text NOT NULL CHECK (source IN ('direct', 'approved_request')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_attribution_log TO authenticated;
GRANT ALL ON public.sales_attribution_log TO service_role;
ALTER TABLE public.sales_attribution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read attribution log"
  ON public.sales_attribution_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage attribution log"
  ON public.sales_attribution_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));
CREATE INDEX IF NOT EXISTS idx_sales_attribution_log_order ON public.sales_attribution_log(order_id);

-- 3) sales_attribution_requests
CREATE TABLE IF NOT EXISTS public.sales_attribution_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requested_by_name text,
  requested_for_sales_person_id uuid NOT NULL,
  requested_for_name text,
  reason text,
  reason_custom text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_attribution_requests TO authenticated;
GRANT ALL ON public.sales_attribution_requests TO service_role;
ALTER TABLE public.sales_attribution_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reps create their own attribution requests"
  ON public.sales_attribution_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND requested_for_sales_person_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'sales')
      OR public.has_role(auth.uid(), 'sales_manager')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Reps read their own attribution requests"
  ON public.sales_attribution_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR requested_for_sales_person_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

-- (status is only flipped through the decide RPC; no direct UPDATE policy by clients)

CREATE INDEX IF NOT EXISTS idx_sar_status ON public.sales_attribution_requests(status);
CREATE INDEX IF NOT EXISTS idx_sar_order ON public.sales_attribution_requests(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sar_pending_per_order
  ON public.sales_attribution_requests(order_id) WHERE status = 'pending';

-- 4) Core helper: do the attribution work in one place
CREATE OR REPLACE FUNCTION public._attribute_website_order_core(
  p_order_id uuid,
  p_sales_person_id uuid,
  p_reason text,
  p_reason_custom text,
  p_source text,
  p_actor_id uuid,
  p_actor_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_id uuid;
  v_rep_name text;
  v_order_number text;
  v_total numeric;
BEGIN
  IF p_source NOT IN ('direct','approved_request') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

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
         updated_at = now()
   WHERE id = p_order_id;

  -- Reset points for this order to avoid double-counting (idempotent)
  DELETE FROM public.sales_points
   WHERE reference_id = p_order_id
     AND category IN ('order_created','order_value');

  INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
  VALUES (p_sales_person_id, 10, 'order_created',
          'Points for creating order ' || v_order_number, p_order_id);

  IF v_total > 0 THEN
    INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
    VALUES (p_sales_person_id,
            GREATEST(1, FLOOR(v_total / 10000))::int,
            'order_value',
            'Value bonus for order ' || v_order_number || ' (₹' || v_total::text || ')',
            p_order_id);
  END IF;

  INSERT INTO public.sales_attribution_log (
    order_id, from_sales_person_id, to_sales_person_id, to_sales_person_name,
    reason, reason_custom, changed_by, changed_by_name, source
  ) VALUES (
    p_order_id, v_from_id, p_sales_person_id, COALESCE(v_rep_name, 'Unknown'),
    p_reason, p_reason_custom, p_actor_id, p_actor_name, p_source
  );

  -- Best-effort mirror to woocommerce_orders
  UPDATE public.woocommerce_orders
     SET assigned_to = p_sales_person_id,
         assigned_to_name = COALESCE(v_rep_name, assigned_to_name)
   WHERE id IN (
     SELECT w.id FROM public.woocommerce_orders w
      JOIN public.orders o ON o.external_id = w.woo_order_id
     WHERE o.id = p_order_id
   );
END;
$$;

-- 5) attribute_website_order (admin / sales_manager only)
CREATE OR REPLACE FUNCTION public.attribute_website_order(
  p_order_id uuid,
  p_sales_person_id uuid,
  p_reason text,
  p_reason_custom text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'sales_manager')) THEN
    RAISE EXCEPTION 'forbidden: admin or sales_manager only';
  END IF;
  SELECT COALESCE(name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;
  PERFORM public._attribute_website_order_core(
    p_order_id, p_sales_person_id, p_reason, p_reason_custom,
    'direct', v_actor, v_actor_name
  );
END;
$$;

-- 6) request_website_order_attribution (sales / sales_manager / admin)
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

  -- Notify every admin + sales_manager
  INSERT INTO public.notifications (order_id, type, title, message, user_id)
  SELECT p_order_id,
         'attribution_request',
         'Attribution request: ' || COALESCE(v_actor_name, 'a rep'),
         COALESCE(v_actor_name, 'A rep') || ' is requesting credit for order ' || v_order_number,
         ur.user_id
    FROM public.user_roles ur
   WHERE ur.role IN ('admin', 'sales_manager');

  RETURN v_request_id;
END;
$$;

-- 7) decide_attribution_request (admin / sales_manager only)
CREATE OR REPLACE FUNCTION public.decide_attribution_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_req public.sales_attribution_requests%ROWTYPE;
  v_order_number text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'sales_manager')) THEN
    RAISE EXCEPTION 'forbidden';
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
    CASE WHEN p_approve
         THEN 'Attribution approved'
         ELSE 'Attribution rejected' END,
    'Order ' || v_order_number || ' — ' ||
      CASE WHEN p_approve THEN 'your request was approved.'
           ELSE 'your request was rejected.' END ||
      COALESCE(' Note: ' || p_note, ''),
    v_req.requested_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.attribute_website_order(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_website_order_attribution(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_attribution_request(uuid, boolean, text) TO authenticated;

-- 8) Leaderboard: locked-attributed website orders count even when website is excluded
CREATE OR REPLACE FUNCTION public.get_sales_leaderboard(
  start_date date DEFAULT NULL::date,
  end_date date DEFAULT NULL::date,
  p_include_website boolean DEFAULT false
) RETURNS TABLE(user_id uuid, user_name text, total_points integer, leads_handled integer,
                orders_won integer, pipeline_created integer, total_pipeline_value numeric,
                total_order_value numeric, rank integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
