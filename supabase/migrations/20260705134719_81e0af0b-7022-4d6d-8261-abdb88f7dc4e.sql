WITH targets AS (
  SELECT id, order_number FROM public.orders
  WHERE order_number IN ('ORD2600050','ORD2600103','ORD2600259')
    AND requires_confirmation = true
),
upd AS (
  UPDATE public.orders o
  SET requires_confirmation = false,
      confirmation_status = 'not_required',
      updated_at = now()
  FROM targets t
  WHERE o.id = t.id
  RETURNING o.id, o.order_number
)
INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
SELECT 'order.confirmation_flag_cleared_false_positive',
       'order',
       id,
       jsonb_build_object(
         'order_number', order_number,
         'reason', 'Admin-approved false positive under corrected drone detection rule',
         'previous_confirmation_status', 'pending',
         'cleared_by', 'system_backfill_turn_f'
       )
FROM upd;