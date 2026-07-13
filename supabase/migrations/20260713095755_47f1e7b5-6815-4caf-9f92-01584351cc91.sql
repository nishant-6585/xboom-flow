
-- 1. Replace guard: normalize instead of raise ------------------------------------
CREATE OR REPLACE FUNCTION public.guard_website_order_sales_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_flag text;
BEGIN
  -- Only care about Woo-linked rows still flagged as raw website feed.
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

    -- Only auto-normalize when this is the *top-level* statement (not a
    -- cascade from another trigger) and we're moving away from the system
    -- ingestion user to a real rep.
    IF pg_trigger_depth() = 1
       AND NEW.sales_person_id IS NOT NULL
       AND NEW.sales_person_id <> 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid THEN
      NEW.source := 'manual';
      NEW.lead_source := COALESCE(NEW.lead_source, 'website');
      NEW.sales_attribution_locked := true;
      IF NEW.attributed_at IS NULL THEN
        NEW.attributed_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Backfill pre-existing direct-edited website orders --------------------------
DO $$
DECLARE
  r record;
  v_actor uuid := 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid;
BEGIN
  FOR r IN
    SELECT id, order_number, sales_person_id, sales_person_name
      FROM public.orders
     WHERE external_id IS NOT NULL
       AND source = 'website'
       AND sales_person_id IS NOT NULL
       AND sales_person_id <> v_actor
  LOOP
    PERFORM public._attribute_website_order_core(
      r.id,
      r.sales_person_id,
      'direct',
      NULL,
      'reconcile',
      v_actor,
      'system-backfill'
    );
    RAISE NOTICE 'Backfilled attribution for order % -> %', r.order_number, r.sales_person_name;
  END LOOP;
END $$;
