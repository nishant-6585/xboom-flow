-- Integration test for public.clear_false_positive_confirmation_flags.
--
-- Verifies:
--   * Non-drone flagged orders are cleared and a domain_event is written.
--   * Drone flagged orders are NEVER cleared.
--   * Orders with no items are skipped (not cleared).
--   * The run row records cleared / skipped counts.
--
-- Run with:
--   psql "$PG_URL" -v ON_ERROR_STOP=1 -f supabase/tests/false_positive_prune.test.sql

BEGIN;

DO $$
DECLARE
  v_drone_order   uuid := gen_random_uuid();
  v_accessory_ord uuid := gen_random_uuid();
  v_empty_order   uuid := gen_random_uuid();
  v_run_id        uuid;
  v_run           record;
  v_evt_count     int;
  v_drone_flag    boolean;
  v_acc_flag      boolean;
  v_empty_flag    boolean;
  v_actor         uuid;
BEGIN
  SELECT id INTO v_actor FROM auth.users LIMIT 1;
  IF v_actor IS NULL THEN v_actor := gen_random_uuid(); END IF;

  -- Seed a drone order (Mavic 3 Pro combo)
  INSERT INTO public.orders (
    id, order_number, product_name, product_code, quantity, customer_name,
    sales_person_id, sales_person_name, created_by,
    requires_confirmation, confirmation_status, source, status, created_at
  ) VALUES (
    v_drone_order, 'FPT-DRONE-1', 'DJI Mavic 3 Pro Fly More Combo', 'FPT-DRONE-SKU', 1, 'Test Drone Cust',
    v_actor, 'Test Sales', v_actor,
    true, 'pending', 'website', 'po_received', now() - interval '2 days'
  );
  INSERT INTO public.order_items (order_id, product_name, product_category, quantity)
  VALUES (v_drone_order, 'DJI Mavic 3 Pro Fly More Combo', 'Consumer Drones', 1);

  -- Seed an accessory-only order (charging hub FOR Avata — false positive class)
  INSERT INTO public.orders (
    id, order_number, product_name, product_code, quantity, customer_name,
    sales_person_id, sales_person_name, created_by,
    requires_confirmation, confirmation_status, source, status, created_at
  ) VALUES (
    v_accessory_ord, 'FPT-ACC-1', 'DJI Battery Charging Hub for Avata', 'FPT-ACC-SKU', 1, 'Test Acc Cust',
    v_actor, 'Test Sales', v_actor,
    true, 'pending', 'website', 'po_received', now() - interval '2 days'
  );
  INSERT INTO public.order_items (order_id, product_name, product_category, quantity)
  VALUES (v_accessory_ord, 'DJI Battery Charging Hub for Avata', 'Xboom', 1);

  -- Seed an order with no items (should be skipped)
  INSERT INTO public.orders (
    id, order_number, product_name, product_code, quantity, customer_name,
    sales_person_id, sales_person_name, created_by,
    requires_confirmation, confirmation_status, source, status, created_at
  ) VALUES (
    v_empty_order, 'FPT-EMPTY-1', 'Unknown Product', 'FPT-EMPTY-SKU', 1, 'Test Empty Cust',
    v_actor, 'Test Sales', v_actor,
    true, 'pending', 'website', 'po_received', now() - interval '2 days'
  );

  -- Run the cleaner
  SELECT public.clear_false_positive_confirmation_flags('test_run') INTO v_run_id;

  -- Drone flag must remain true
  SELECT requires_confirmation INTO v_drone_flag FROM public.orders WHERE id = v_drone_order;
  ASSERT v_drone_flag = true, 'Drone order must NOT have its confirmation flag cleared';

  -- Accessory flag must be cleared
  SELECT requires_confirmation INTO v_acc_flag FROM public.orders WHERE id = v_accessory_ord;
  ASSERT v_acc_flag = false, 'Non-drone (accessory) order MUST have its confirmation flag cleared';

  -- Empty-item order must remain flagged (skipped, webhook race)
  SELECT requires_confirmation INTO v_empty_flag FROM public.orders WHERE id = v_empty_order;
  ASSERT v_empty_flag = true, 'Order with no items must be skipped, not cleared';

  -- Domain event only for the accessory order
  SELECT count(*) INTO v_evt_count
    FROM public.domain_events
   WHERE event_type = 'order.confirmation_flag_cleared_false_positive'
     AND entity_id = v_accessory_ord
     AND payload->>'run_id' = v_run_id::text;
  ASSERT v_evt_count = 1, 'Exactly one domain_event must be logged for the cleared accessory order';

  SELECT count(*) INTO v_evt_count
    FROM public.domain_events
   WHERE event_type = 'order.confirmation_flag_cleared_false_positive'
     AND entity_id = v_drone_order
     AND payload->>'run_id' = v_run_id::text;
  ASSERT v_evt_count = 0, 'No domain_event must be written for the drone order';

  -- Run row counts
  SELECT * INTO v_run FROM public.false_positive_clear_runs WHERE id = v_run_id;
  ASSERT v_run.cleared_count >= 1, 'Run must record at least one cleared order';
  ASSERT v_run.skipped_count >= 2, 'Run must record the drone + empty orders as skipped';
  ASSERT v_run.finished_at IS NOT NULL, 'Run must be marked finished';
  ASSERT v_run.triggered_by = 'test_run', 'Run triggered_by must reflect the caller label';

  RAISE NOTICE 'false_positive_prune.test.sql: all assertions passed (run %)', v_run_id;
END $$;

ROLLBACK;