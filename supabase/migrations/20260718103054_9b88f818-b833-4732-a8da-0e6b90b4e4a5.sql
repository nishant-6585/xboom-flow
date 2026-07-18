-- Harden guard trigger to stamp attributed_by / attributed_by_name from auth.uid()
-- whenever a Woo-linked row is normalized to manual attribution, so the UI
-- never has to fall back to "system" for direct edits.

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

    BEGIN
      v_flag := current_setting('app.attribution_rpc', true);
    EXCEPTION WHEN OTHERS THEN
      v_flag := NULL;
    END;

    -- RPC path already sets these fields itself; do nothing extra.
    IF v_flag = 'on' THEN
      RETURN NEW;
    END IF;

    IF pg_trigger_depth() = 1
       AND NEW.sales_person_id IS NOT NULL
       AND NEW.sales_person_id <> 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid THEN
      NEW.source := 'manual';
      NEW.lead_source := COALESCE(NEW.lead_source, 'website');
      NEW.sales_attribution_locked := true;
      IF NEW.attributed_at IS NULL THEN
        NEW.attributed_at := now();
      END IF;

      -- Stamp WHO performed the attribution so the UI never shows "system"
      -- for direct row edits. auth.uid() is set for PostgREST/edge callers.
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

      -- Default reason for direct edits so downstream analytics never
      -- see a locked row with a NULL reason.
      IF NEW.sales_attribution_reason IS NULL THEN
        NEW.sales_attribution_reason := 'direct_admin_edit';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill the two known rows using edit_history as the source of truth
-- for who performed the write.
WITH picks AS (
  SELECT DISTINCT ON (eh.record_id)
    eh.record_id::uuid AS order_id,
    eh.edited_by       AS by_id,
    eh.edited_by_name  AS by_name,
    eh.edited_at       AS by_at
  FROM public.edit_history eh
  WHERE eh.table_name = 'orders'
    AND eh.field_name = 'sales_person_id'
    AND eh.record_id IN (
      '666d1064-7a2f-42ec-92a4-819426b6c55f',
      'c0520c8b-dc3d-4e68-b84a-1976c4463c0d'
    )
  ORDER BY eh.record_id, eh.edited_at DESC
)
UPDATE public.orders o
   SET attributed_by = COALESCE(o.attributed_by, p.by_id),
       attributed_by_name = COALESCE(o.attributed_by_name, p.by_name),
       attributed_at = COALESCE(o.attributed_at, p.by_at),
       sales_attribution_reason = COALESCE(o.sales_attribution_reason, 'direct_admin_edit')
  FROM picks p
 WHERE o.id = p.order_id;