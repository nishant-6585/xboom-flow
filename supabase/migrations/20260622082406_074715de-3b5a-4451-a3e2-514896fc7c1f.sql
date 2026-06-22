
-- 1. Audit log table for customer_phone changes
CREATE TABLE IF NOT EXISTS public.order_phone_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number text,
  old_phone text,
  new_phone text,
  changed_by uuid,
  changed_by_name text,
  changed_by_role text,
  source text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_phone_audit_log TO authenticated;
GRANT ALL ON public.order_phone_audit_log TO service_role;

ALTER TABLE public.order_phone_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and Finance can view phone audit log" ON public.order_phone_audit_log;
CREATE POLICY "Admin and Finance can view phone audit log"
ON public.order_phone_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'finance')
);

-- Block direct writes; only the trigger (SECURITY DEFINER) inserts.
DROP POLICY IF EXISTS "No direct inserts to phone audit log" ON public.order_phone_audit_log;
CREATE POLICY "No direct inserts to phone audit log"
ON public.order_phone_audit_log
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_order_phone_audit_order_id
  ON public.order_phone_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_order_phone_audit_created_at
  ON public.order_phone_audit_log(created_at DESC);

-- 2. Trigger function: server-side recording of every phone change
CREATE OR REPLACE FUNCTION public.log_order_phone_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
BEGIN
  -- Only log when phone actually changed
  IF NEW.customer_phone IS DISTINCT FROM OLD.customer_phone THEN
    -- Look up display name and primary role of actor (if any)
    SELECT name INTO v_actor_name
    FROM public.profiles
    WHERE user_id = v_actor
    LIMIT 1;

    SELECT role::text INTO v_actor_role
    FROM public.user_roles
    WHERE user_id = v_actor
    ORDER BY
      CASE role::text
        WHEN 'admin' THEN 1
        WHEN 'finance' THEN 2
        WHEN 'supply_chain' THEN 3
        WHEN 'sales_manager' THEN 4
        WHEN 'sales' THEN 5
        ELSE 99
      END
    LIMIT 1;

    INSERT INTO public.order_phone_audit_log (
      order_id,
      order_number,
      old_phone,
      new_phone,
      changed_by,
      changed_by_name,
      changed_by_role,
      source
    ) VALUES (
      NEW.id,
      NEW.order_number,
      OLD.customer_phone,
      NEW.customer_phone,
      v_actor,
      v_actor_name,
      COALESCE(v_actor_role, CASE WHEN v_actor IS NULL THEN 'system' ELSE 'unknown' END),
      CASE WHEN v_actor IS NULL THEN 'system' ELSE 'app' END
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_phone_change ON public.orders;
CREATE TRIGGER trg_log_order_phone_change
AFTER UPDATE OF customer_phone ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_phone_change();

-- 3. Ensure realtime emits full row data for orders so subscribers see phone updates
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- orders is already in supabase_realtime publication; add only if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;
END $$;
