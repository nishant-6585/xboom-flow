-- 1. Schema
ALTER TABLE public.woocommerce_orders
  ADD COLUMN IF NOT EXISTS assigned_to uuid NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_name text NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_assigned_to
  ON public.woocommerce_orders (assigned_to)
  WHERE is_lost_lead = false;

-- 2. Round-robin auto-assignment for currently unassigned active leads
CREATE OR REPLACE FUNCTION public.auto_assign_woo_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
  salespeople uuid[];
  sales_names text[];
  n integer;
BEGIN
  -- Collect approved sales / sales_manager users (deterministic order).
  SELECT array_agg(p.user_id ORDER BY p.name),
         array_agg(COALESCE(p.name, p.email, 'Salesperson') ORDER BY p.name)
    INTO salespeople, sales_names
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE ur.role IN ('sales','sales_manager')
     AND p.is_approved = true;

  n := COALESCE(array_length(salespeople, 1), 0);
  IF n = 0 THEN
    RETURN 0;
  END IF;

  WITH targets AS (
    SELECT id,
           row_number() OVER (ORDER BY woo_created_at NULLS LAST, id) AS rn
      FROM public.woocommerce_orders
     WHERE assigned_to IS NULL
       AND is_lost_lead = false
       AND lower(COALESCE(order_status,'')) NOT IN ('processing','completed','delivered')
  )
  UPDATE public.woocommerce_orders o
     SET assigned_to      = salespeople[((t.rn - 1) % n) + 1],
         assigned_to_name = sales_names[((t.rn - 1) % n) + 1],
         assigned_at      = now()
    FROM targets t
   WHERE o.id = t.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 3. Manual reassignment RPC, callable from the UI.
CREATE OR REPLACE FUNCTION public.assign_woo_lead(
  p_order_id uuid,
  p_assignee uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  assignee_name text;
  prev_id uuid;
  prev_name text;
  caller_name text;
  woo_id text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = caller
       AND role IN ('admin','sales','sales_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign leads';
  END IF;

  -- Resolve assignee profile (must be approved sales / sales_manager / admin).
  SELECT COALESCE(p.name, p.email, 'Salesperson')
    INTO assignee_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE p.user_id = p_assignee
     AND p.is_approved = true
     AND ur.role IN ('admin','sales','sales_manager')
   LIMIT 1;

  IF assignee_name IS NULL THEN
    RAISE EXCEPTION 'Assignee is not an approved sales user';
  END IF;

  SELECT assigned_to, assigned_to_name, woo_order_id
    INTO prev_id, prev_name, woo_id
    FROM public.woocommerce_orders
   WHERE id = p_order_id;

  UPDATE public.woocommerce_orders
     SET assigned_to      = p_assignee,
         assigned_to_name = assignee_name,
         assigned_at      = now()
   WHERE id = p_order_id;

  -- Best-effort activity log entry; ignore if table missing.
  BEGIN
    SELECT COALESCE(name, email, 'User') INTO caller_name
      FROM public.profiles WHERE user_id = caller;

    INSERT INTO public.woo_lead_activities (
      woo_order_id, activity_type, description,
      performed_by, performed_by_name
    )
    VALUES (
      woo_id,
      'assignment',
      CASE
        WHEN prev_id IS NULL THEN 'Lead assigned to ' || assignee_name || '.'
        ELSE 'Lead reassigned from ' || COALESCE(prev_name,'unassigned') || ' to ' || assignee_name || '.'
      END,
      caller,
      caller_name
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_woo_lead(uuid, uuid) TO authenticated;

-- 4. Backfill now.
SELECT public.auto_assign_woo_leads();