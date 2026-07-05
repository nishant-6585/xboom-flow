
-- 1) Tighten the NAME branch of is_drone_product to exclude obvious components.
CREATE OR REPLACE FUNCTION public.is_drone_product(p_name text, p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_drone_category(p_category)
    OR (
      p_name IS NOT NULL
      AND lower(p_name) ~ '(mavic|mini\s*[0-9]|mini\s*pro|phantom|matrice|avata|inspire|fpv|autel\s*evo|skydio|parrot\s*anafi|swellpro|tello|air\s*[0-9]|neo\s*fly|dji\s*neo|agras)'
      AND lower(p_name) !~ '(motor|\mesc\M|frame|stack|[0-9]+\s*kv|vtx|component|accessor|part|spare|batter|propeller|repair|service|payload|controller|charging|hub|gimbal|nd\s*filter|filter|cable|charger|remote|goggle|case|bag|strap|antenna|screen|guard|show|software|guide|parachute|buzzer|screw|standoff|mount)'
    );
$function$;

-- 2) Log affected orders to domain_events, then clear the flag.
WITH affected AS (
  SELECT o.id, o.order_number, o.product_name, o.product_category
  FROM public.orders o
  WHERE o.requires_confirmation = true
    AND coalesce(o.confirmation_status, 'pending') <> 'confirmed'
    AND NOT public.is_drone_product(o.product_name, o.product_category)
),
logged AS (
  INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
  SELECT
    'order.confirmation_flag_cleared_false_positive',
    'order',
    a.id,
    jsonb_build_object(
      'order_number', a.order_number,
      'product_name', a.product_name,
      'product_category', a.product_category,
      'reason', 'is_drone_product name-branch tightened to exclude components (motor/esc/frame/stack/kv/vtx/propeller/battery/etc.)'
    )
  FROM affected a
  RETURNING entity_id
)
UPDATE public.orders o
SET requires_confirmation = false,
    confirmation_status = 'not_required'
FROM logged
WHERE o.id = logged.entity_id;
