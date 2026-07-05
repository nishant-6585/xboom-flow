
-- 1) is_drone_category unchanged in behavior; keep for reference.
--    (no-op replace to lock the definition)
CREATE OR REPLACE FUNCTION public.is_drone_category(cat text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN cat IS NULL THEN false
    WHEN lower(cat) !~ 'drone' THEN false
    WHEN lower(cat) ~ '(component|accessor|part|spare|batter|propeller|repair|service|show|payload|software|guide|parachute|filter|cable|controller|charging|hub|dock|gimbal|nd\s*filter)' THEN false
    ELSE true
  END;
$function$;

-- 2) is_drone_product: category-authoritative when present, otherwise a
--    strict name rule. Explicit drone models bypass component exclusions;
--    generic keywords (fpv / air N / mini N / mini pro) require a brand
--    token AND must not name a component part.
CREATE OR REPLACE FUNCTION public.is_drone_product(p_name text, p_category text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  n text := lower(coalesce(p_name, ''));
  has_explicit_model boolean;
  has_generic_hit boolean;
  has_component_word boolean;
BEGIN
  -- Category is authoritative when we have one.
  IF p_category IS NOT NULL AND btrim(p_category) <> '' THEN
    RETURN public.is_drone_category(p_category);
  END IF;

  IF n = '' THEN
    RETURN false;
  END IF;

  -- Explicit drone-model tokens. These identify a drone by name and
  -- bypass component exclusions ("Avata 2 Fly More Combo (Goggles 3)"
  -- still counts as a drone).
  has_explicit_model :=
    n ~ '(mavic|phantom|matrice|avata|inspire|autel\s*evo|skydio|parrot\s*anafi|swellpro|tello|agras|dji\s*neo|neo\s*fly)';
  IF has_explicit_model THEN
    RETURN true;
  END IF;

  -- Generic drone-adjacent keywords. Require a drone brand token so
  -- "iPad Air 5" / "Mac Mini 2" don't match, and defeat with component
  -- words like motor/esc/frame/vtx/etc.
  has_generic_hit :=
    n ~ '\mfpv\M'
    OR n ~ '(dji|autel|swellpro|parrot|skydio|xboom)\s+(air|mini)\s*[0-9]'
    OR n ~ '(dji|autel|swellpro|parrot|skydio|xboom)\s+mini\s*pro';
  IF NOT has_generic_hit THEN
    RETURN false;
  END IF;

  has_component_word :=
    n ~ '(motor|\mesc\M|frame|stack|[0-9]+\s*kv|vtx|\marm\M|mount|receiver|transmitter|\mlens\M|landing\s*gear|prop\M|props\M|propeller|component|accessor|part|spare|batter|repair|service|payload|controller|charging|hub|gimbal|nd\s*filter|filter|cable|charger|remote|goggle|case|bag|strap|antenna|screen|guard|show|software|guide|parachute|buzzer|screw|standoff)';

  RETURN NOT has_component_word;
END;
$$;

-- 3) Shared per-order helper used by both the trigger and the KYC edge
--    function so the two paths cannot drift apart.
CREATE OR REPLACE FUNCTION public.order_has_drone(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_cat text;
BEGIN
  FOR r IN
    SELECT id, product_name, product_code, product_category
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    v_cat := NULL;

    -- (a) pricelist by product_code → woo_sku
    IF r.product_code IS NOT NULL AND btrim(r.product_code) <> '' THEN
      SELECT p.product_category INTO v_cat
      FROM public.pricelist p
      WHERE lower(p.woo_sku) = lower(r.product_code)
      LIMIT 1;
    END IF;

    -- (b) pricelist by exact name
    IF v_cat IS NULL THEN
      SELECT p.product_category INTO v_cat
      FROM public.pricelist p
      WHERE lower(p.product_name) = lower(r.product_name)
      LIMIT 1;
    END IF;

    -- (c) fall back to the item's own category
    IF v_cat IS NULL OR btrim(v_cat) = '' THEN
      v_cat := NULLIF(btrim(r.product_category), '');
    END IF;

    IF v_cat IS NOT NULL THEN
      IF public.is_drone_category(v_cat) THEN
        RETURN true;
      END IF;
    ELSE
      IF public.is_drone_product(r.product_name, NULL) THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.order_has_drone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_has_drone(uuid) TO authenticated, service_role;

-- 4) Trigger: pricelist-first category resolution, name regex only as
--    the last resort. Dead CASE removed.
CREATE OR REPLACE FUNCTION public.mark_order_requires_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cat text := NULL;
  v_is_drone boolean := false;
BEGIN
  -- (a) pricelist by product_code
  IF NEW.product_code IS NOT NULL AND btrim(NEW.product_code) <> '' THEN
    SELECT p.product_category INTO v_cat
    FROM public.pricelist p
    WHERE lower(p.woo_sku) = lower(NEW.product_code)
    LIMIT 1;
  END IF;

  -- (b) pricelist by exact name
  IF v_cat IS NULL THEN
    SELECT p.product_category INTO v_cat
    FROM public.pricelist p
    WHERE lower(p.product_name) = lower(NEW.product_name)
    LIMIT 1;
  END IF;

  -- (c) item's own category
  IF v_cat IS NULL OR btrim(v_cat) = '' THEN
    v_cat := NULLIF(btrim(NEW.product_category), '');
  END IF;

  IF v_cat IS NOT NULL THEN
    v_is_drone := public.is_drone_category(v_cat);
  ELSE
    v_is_drone := public.is_drone_product(NEW.product_name, NULL);
  END IF;

  IF v_is_drone THEN
    UPDATE public.orders o
       SET requires_confirmation = true,
           confirmation_status = 'pending'
     WHERE o.id = NEW.order_id
       AND o.confirmation_status <> 'confirmed'
       AND (o.requires_confirmation = false OR o.confirmation_status = 'not_required');
  END IF;

  RETURN NEW;
END;
$$;
