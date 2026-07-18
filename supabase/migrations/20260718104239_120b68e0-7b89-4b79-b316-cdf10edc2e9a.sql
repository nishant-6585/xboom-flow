
-- 1) Audit table for attribution field changes
CREATE TABLE IF NOT EXISTS public.attribution_field_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  field_name text NOT NULL CHECK (field_name IN ('sales_person_id','attributed_by','attributed_at')),
  old_value text,
  new_value text,
  actor_id uuid,
  actor_name text,
  source_path text NOT NULL CHECK (source_path IN ('rpc','direct_edit','woo_sync','reconcile','system','trigger_normalize')),
  db_session_user text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.attribution_field_audit TO authenticated;
GRANT ALL ON public.attribution_field_audit TO service_role;

ALTER TABLE public.attribution_field_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM roles read attribution field audit" ON public.attribution_field_audit;
CREATE POLICY "CRM roles read attribution field audit"
  ON public.attribution_field_audit
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_attribution_field_audit_order ON public.attribution_field_audit(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_field_audit_created ON public.attribution_field_audit(created_at DESC);

-- 2) Trigger function: log any change to the three attribution fields.
CREATE OR REPLACE FUNCTION public.log_attribution_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_rpc_flag text;
  v_source_flag text;
  v_source text;
  v_session_user text := session_user;
BEGIN
  BEGIN v_rpc_flag := current_setting('app.attribution_rpc', true); EXCEPTION WHEN OTHERS THEN v_rpc_flag := NULL; END;
  BEGIN v_source_flag := current_setting('app.attribution_source', true); EXCEPTION WHEN OTHERS THEN v_source_flag := NULL; END;

  IF v_source_flag IS NOT NULL AND v_source_flag <> '' THEN
    v_source := v_source_flag;
  ELSIF v_rpc_flag = 'on' THEN
    v_source := 'rpc';
  ELSIF v_uid IS NOT NULL THEN
    v_source := 'direct_edit';
  ELSE
    v_source := 'system';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(p.full_name, p.name, e.name)
      INTO v_name
      FROM public.profiles p
      LEFT JOIN public.employees e ON e.profile_id = p.id
     WHERE p.id = v_uid
     LIMIT 1;
  END IF;

  IF NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id THEN
    INSERT INTO public.attribution_field_audit(order_id, field_name, old_value, new_value, actor_id, actor_name, source_path, db_session_user)
    VALUES (NEW.id, 'sales_person_id', OLD.sales_person_id::text, NEW.sales_person_id::text, v_uid, v_name, v_source, v_session_user);
  END IF;
  IF NEW.attributed_by IS DISTINCT FROM OLD.attributed_by THEN
    INSERT INTO public.attribution_field_audit(order_id, field_name, old_value, new_value, actor_id, actor_name, source_path, db_session_user)
    VALUES (NEW.id, 'attributed_by', OLD.attributed_by::text, NEW.attributed_by::text, v_uid, v_name, v_source, v_session_user);
  END IF;
  IF NEW.attributed_at IS DISTINCT FROM OLD.attributed_at THEN
    INSERT INTO public.attribution_field_audit(order_id, field_name, old_value, new_value, actor_id, actor_name, source_path, db_session_user)
    VALUES (NEW.id, 'attributed_at', OLD.attributed_at::text, NEW.attributed_at::text, v_uid, v_name, v_source, v_session_user);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_attribution_field_audit ON public.orders;
CREATE TRIGGER trg_orders_attribution_field_audit
AFTER UPDATE OF sales_person_id, attributed_by, attributed_at ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_attribution_field_changes();

-- 3) Constraint: when locked, attributed_by / attributed_by_name must be set.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_attribution_lock_requires_attributor;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_attribution_lock_requires_attributor
  CHECK (
    sales_attribution_locked IS NOT TRUE
    OR (attributed_by IS NOT NULL AND attributed_by_name IS NOT NULL)
  ) NOT VALID;
-- Existing rows already comply (verified: 0 violations); validate to enforce.
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_attribution_lock_requires_attributor;

-- 4) Reporting view: attribution integrity violations.
--    Locked orders where attributor is missing or not in an approved reviewer role.
CREATE OR REPLACE VIEW public.attribution_integrity_violations
WITH (security_invoker = on)
AS
SELECT
  o.id                             AS order_id,
  o.order_number,
  o.sales_person_id,
  o.sales_person_name,
  o.attributed_by,
  o.attributed_by_name,
  o.attributed_at,
  o.sales_attribution_reason,
  o.source,
  o.external_id,
  CASE
    WHEN o.attributed_by IS NULL OR o.attributed_by_name IS NULL THEN 'missing_attributor'
    WHEN NOT (
      has_role(o.attributed_by, 'admin'::app_role)
      OR has_role(o.attributed_by, 'sales_manager'::app_role)
    ) THEN 'attributor_not_authorized_reviewer'
    ELSE 'ok'
  END AS issue,
  o.updated_at
FROM public.orders o
WHERE o.sales_attribution_locked IS TRUE
  AND (
    o.attributed_by IS NULL
    OR o.attributed_by_name IS NULL
    OR NOT (
      has_role(o.attributed_by, 'admin'::app_role)
      OR has_role(o.attributed_by, 'sales_manager'::app_role)
    )
  );

GRANT SELECT ON public.attribution_integrity_violations TO authenticated;

-- 5) Update guard trigger to tag source_path via GUC so audit rows record 'trigger_normalize'.
CREATE OR REPLACE FUNCTION public.guard_website_order_sales_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_flag text;
  v_uid uuid;
  v_name text;
BEGIN
  IF NEW.external_id IS NULL OR OLD.source <> 'website' THEN
    RETURN NEW;
  END IF;

  IF NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
     OR NEW.sales_person_name IS DISTINCT FROM OLD.sales_person_name THEN

    BEGIN v_flag := current_setting('app.attribution_rpc', true); EXCEPTION WHEN OTHERS THEN v_flag := NULL; END;
    IF v_flag = 'on' THEN
      RETURN NEW;
    END IF;

    IF pg_trigger_depth() = 1
       AND NEW.sales_person_id IS NOT NULL
       AND NEW.sales_person_id <> 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid THEN
      -- Mark the source path so downstream audit trigger tags rows correctly.
      PERFORM set_config('app.attribution_source', 'trigger_normalize', true);
      NEW.source := 'manual';
      NEW.lead_source := COALESCE(NEW.lead_source, 'website');
      NEW.sales_attribution_locked := true;
      IF NEW.attributed_at IS NULL THEN
        NEW.attributed_at := now();
      END IF;
      v_uid := auth.uid();
      IF v_uid IS NOT NULL THEN
        IF NEW.attributed_by IS NULL THEN
          NEW.attributed_by := v_uid;
        END IF;
        IF NEW.attributed_by_name IS NULL THEN
          SELECT COALESCE(p.full_name, p.name, e.name)
            INTO v_name
            FROM public.profiles p
            LEFT JOIN public.employees e ON e.profile_id = p.id
           WHERE p.id = v_uid
           LIMIT 1;
          NEW.attributed_by_name := v_name;
        END IF;
      END IF;
      IF NEW.sales_attribution_reason IS NULL THEN
        NEW.sales_attribution_reason := 'direct_admin_edit';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
