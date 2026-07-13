
-- Fix is_drone_product: the model-token bypass over-matches ACCESSORIES
-- named after the drone they fit (e.g. "DJI Battery Charging Hub for Avata",
-- "ND Filter for Mavic 3", "Landing gear for Matrice 350"). The model bypass
-- must NOT fire when the item name contains a component/accessory word AND
-- the model token appears after the word "for". Combos are unaffected because
-- their model token is the SUBJECT (appears before any component word / not
-- after "for"): "DJI Avata 2 Fly More Combo", "DJI Mavic 3 Fly More Combo
-- (with Smart Controller)".
CREATE OR REPLACE FUNCTION public.is_drone_product(p_name text, p_category text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  n text := lower(coalesce(p_name, ''));
  model_regex text := '(mavic|phantom|matrice|\mavata\M|autel\s*evo|\mskydio\M|parrot\s*anafi|swellpro|\mtello\M|\magras\M|dji\s*neo|\mlito\M)';
  component_regex text := '(motor|\mesc\M|frame|stack|[0-9]+\s*kv|vtx|\marm\M|mount|receiver|transmitter|\mlens\M|landing\s*gear|prop\M|props\M|propeller|component|accessor|part|spare|batter|repair|service|payload|controller|charging|hub|gimbal|nd\s*filter|filter|cable|charger|remote|goggle|case|bag|strap|antenna|screen|guard|show|software|guide|parachute|buzzer|screw|standoff)';
  is_model_match boolean;
  is_accessory_for_model boolean;
  is_generic_match boolean;
  has_brand boolean;
  is_excluded boolean;
BEGIN
  -- Category authoritative when provided.
  IF p_category IS NOT NULL AND btrim(p_category) <> '' THEN
    RETURN public.is_drone_category(p_category);
  END IF;

  IF n = '' THEN RETURN false; END IF;

  is_model_match := n ~ model_regex;

  -- Accessory-FOR-model guard: the model bypass is suppressed when the name
  -- contains an accessory/component word AND the model token appears after
  -- the word "for" (component IS FOR a drone → accessory, not a drone).
  is_accessory_for_model :=
        is_model_match
    AND n ~ component_regex
    AND n ~ ('\mfor\s+[^,]*?' || model_regex);

  IF is_model_match AND NOT is_accessory_for_model THEN
    RETURN true;
  END IF;

  -- Generic drone-adjacent tokens.
  is_generic_match := n ~ '(\mfpv\M|\minspire\M|\mair\s*[0-9]|\mmini\s*[0-9])';

  -- Fall-through path: accessory-for-model OR no generic match → let the
  -- normal component-exclusion logic decide against the generic branch.
  IF NOT is_generic_match AND NOT is_accessory_for_model THEN
    RETURN false;
  END IF;

  -- When only the accessory-for-model path brought us here, we already know
  -- it's an accessory FOR a drone → not a drone product.
  IF is_accessory_for_model AND NOT is_generic_match THEN
    RETURN false;
  END IF;

  -- Require a drone-brand token so "iPad Air 5" / "Mac Mini 2" don't match.
  has_brand := n ~ '(\mdji\M|\mautel\M|\mskydio\M|\mparrot\M|\mswellpro\M|\mgeprc\M|\miflight\M|\mpotensic\M|\mxboom\M|\mzmr\M)';
  IF NOT has_brand THEN
    RETURN false;
  END IF;

  -- Component words defeat ONLY the generic branch.
  is_excluded := n ~ component_regex;

  RETURN NOT is_excluded;
END;
$function$;
