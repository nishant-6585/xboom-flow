
-- 1) Correct the pricelist for DJI Lito 1 Standard
UPDATE public.pricelist
   SET product_category = 'Consumer Drones'
 WHERE product_name ILIKE 'DJI Lito 1 Standard'
   AND product_category = 'Camera';

-- 2) Tighten is_drone_product: model bypass + brand-scoped generic
CREATE OR REPLACE FUNCTION public.is_drone_product(p_name text, p_category text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  n text := lower(coalesce(p_name, ''));
  is_model_match boolean;
  is_generic_match boolean;
  has_brand boolean;
  is_excluded boolean;
BEGIN
  -- Category authoritative when provided.
  IF p_category IS NOT NULL AND btrim(p_category) <> '' THEN
    RETURN public.is_drone_category(p_category);
  END IF;

  IF n = '' THEN RETURN false; END IF;

  -- Explicit drone-model tokens: always a drone, never defeated by
  -- component words ("DJI Mavic 3 Fly More Combo (with Smart Controller)").
  is_model_match := n ~ '(mavic|phantom|matrice|\mavata\M|autel\s*evo|\mskydio\M|parrot\s*anafi|swellpro|\mtello\M|\magras\M|dji\s*neo|\mlito\M)';
  IF is_model_match THEN
    RETURN true;
  END IF;

  -- Generic drone-adjacent tokens.
  is_generic_match := n ~ '(\mfpv\M|\minspire\M|\mair\s*[0-9]|\mmini\s*[0-9])';
  IF NOT is_generic_match THEN
    RETURN false;
  END IF;

  -- Require a drone-brand token so "iPad Air 5" / "Mac Mini 2" don't match.
  has_brand := n ~ '(\mdji\M|\mautel\M|\mskydio\M|\mparrot\M|\mswellpro\M|\mgeprc\M|\miflight\M|\mpotensic\M|\mxboom\M|\mzmr\M)';
  IF NOT has_brand THEN
    RETURN false;
  END IF;

  -- Component words defeat ONLY the generic branch.
  is_excluded := n ~ '(motor|\mesc\M|frame|stack|[0-9]+\s*kv|vtx|\marm\M|mount|receiver|transmitter|\mlens\M|landing\s*gear|prop\M|props\M|propeller|component|accessor|part|spare|batter|repair|service|payload|controller|charging|hub|gimbal|nd\s*filter|filter|cable|charger|remote|goggle|case|bag|strap|antenna|screen|guard|show|software|guide|parachute|buzzer|screw|standoff)';

  RETURN NOT is_excluded;
END;
$$;

-- 3) Re-flag orders wrongly cleared by the earlier weaker backfill.
--    Uses order_has_drone under the corrected rule.
WITH cleared AS (
  SELECT DISTINCT entity_id AS order_id
    FROM public.domain_events
   WHERE event_type = 'order.confirmation_flag_cleared_false_positive'
),
still_drone AS (
  SELECT c.order_id
    FROM cleared c
   WHERE public.order_has_drone(c.order_id)
),
upd AS (
  UPDATE public.orders o
     SET requires_confirmation = true,
         confirmation_status = 'pending'
    FROM still_drone s
   WHERE o.id = s.order_id
     AND o.confirmation_status <> 'confirmed'
  RETURNING o.id, o.order_number
)
INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
SELECT 'order.confirmation_flag_reflagged_true_positive',
       'order',
       u.id,
       jsonb_build_object(
         'order_number', u.order_number,
         'reason', 'Prior clear used weaker name-only test; 3-tier check with pricelist+item category fallback confirms drone item present. Also DJI Lito 1 Standard pricelist corrected to Consumer Drones.'
       )
  FROM upd u;

-- 4) pgTAP-style assertions (raise if any fail)
DO $$
BEGIN
  -- FPV MOTOR (component) → false
  IF public.is_drone_product('IFLIGHT-1404 4150KV FPV MOTOR', NULL) THEN
    RAISE EXCEPTION 'FAIL: FPV MOTOR flagged as drone';
  END IF;
  -- iPad Air 5 → false
  IF public.is_drone_product('Apple iPad Air 5', NULL) THEN
    RAISE EXCEPTION 'FAIL: iPad Air 5 flagged as drone';
  END IF;
  -- DJI Mini 5 Pro Fly More Combo → true (generic + brand, no exclusion)
  IF NOT public.is_drone_product('DJI Mini 5 Pro Fly More Combo', NULL) THEN
    RAISE EXCEPTION 'FAIL: DJI Mini 5 Pro missed';
  END IF;
  -- DJI Mavic 3 Fly More Combo (with Smart Controller) → true via NAME branch
  IF NOT public.is_drone_product('DJI Mavic 3 Fly More Combo (with Smart Controller)', NULL) THEN
    RAISE EXCEPTION 'FAIL: DJI Mavic 3 w/ Smart Controller missed (name branch)';
  END IF;
  -- DJI Lito 1 Standard → true via corrected pricelist category
  IF NOT public.is_drone_category('Consumer Drones') THEN
    RAISE EXCEPTION 'FAIL: Consumer Drones category not drone';
  END IF;
  -- Agriculture Drones category → true
  IF NOT public.is_drone_category('Agriculture Drones') THEN
    RAISE EXCEPTION 'FAIL: Agriculture Drones category not drone';
  END IF;
  -- Avata 2 Fly More Combo (Goggles 3) → true (explicit model bypasses "goggle")
  IF NOT public.is_drone_product('DJI Avata 2 Fly More Combo (Goggles 3)', NULL) THEN
    RAISE EXCEPTION 'FAIL: Avata 2 missed';
  END IF;
END $$;
