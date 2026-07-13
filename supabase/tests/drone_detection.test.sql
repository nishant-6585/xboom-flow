-- Drone-detection assertion tests. Run with:
--   psql "$PG_URL" -v ON_ERROR_STOP=1 -f supabase/tests/drone_detection.test.sql
--
-- pgTAP is not installed on this project; these use plain PL/pgSQL ASSERTs.
-- Any failure raises an ERROR and stops the script.

DO $$
BEGIN
  -- Required cases from the ticket
  ASSERT public.is_drone_product('IFLIGHT-1404 4150KV FPV MOTOR', NULL) = false,
    'FPV MOTOR must be classified as NOT a drone';
  ASSERT public.is_drone_product('iPad Air 5', NULL) = false,
    'iPad Air 5 must be classified as NOT a drone';
  ASSERT public.is_drone_product('DJI Mini 5 Pro Fly More Combo', NULL) = true,
    'DJI Mini 5 Pro Fly More Combo must be classified as a drone';
  ASSERT public.is_drone_product('Avata 2 Fly More Combo (Goggles 3)', NULL) = true,
    'Avata 2 Fly More Combo (Goggles 3) must be classified as a drone';
  ASSERT public.is_drone_product(NULL, 'Agriculture Drones') = true,
    'Bare category "Agriculture Drones" must be classified as a drone';

  -- Extra regression cases
  ASSERT public.is_drone_product('Mac Mini 2', NULL) = false,
    'Mac Mini 2 must not match on generic "mini N"';
  ASSERT public.is_drone_product('DJI Mavic 4 Pro (DJI RC 2)', NULL) = true,
    'DJI Mavic 4 Pro must be a drone (explicit model wins over RC/controller wording)';
  ASSERT public.is_drone_product('DJI Air 3S Fly More Combo (DJI RC 2)', NULL) = true,
    'DJI Air 3S must match brand-scoped "air N"';
  ASSERT public.is_drone_product('GEPRC SPEEDX2 0802 Brushless Motor 17000KV', NULL) = false,
    'FPV motor part must not be a drone';
  -- Accessory-FOR-model false-positive class (bug fixed 2026-07-13):
  -- when a component/accessory word is present AND the model token appears
  -- after "for", the model-bypass is suppressed and the item is NOT a drone.
  ASSERT public.is_drone_product('DJI Battery Charging Hub for Avata', NULL) = false,
    'Charging hub FOR Avata is an accessory, not a drone';
  ASSERT public.is_drone_product('DJI Battery Charging Hub for Mavic 3', NULL) = false,
    'Charging hub FOR Mavic 3 is an accessory, not a drone';
  ASSERT public.is_drone_product('ND Filter for Mavic 3', NULL) = false,
    'ND filter FOR Mavic 3 is an accessory, not a drone';
  ASSERT public.is_drone_product('Landing gear for Matrice 350', NULL) = false,
    'Landing gear FOR Matrice 350 is an accessory, not a drone';
  -- Combos: model token is the SUBJECT (not after "for") → still a drone.
  ASSERT public.is_drone_product('DJI Avata 2 Fly More Combo', NULL) = true,
    'DJI Avata 2 Fly More Combo is a drone (model is subject, not after "for")';
  ASSERT public.is_drone_product('DJI Mavic 3 Fly More Combo (with Smart Controller)', NULL) = true,
    'DJI Mavic 3 Fly More Combo remains a drone despite "Controller" component word';
  ASSERT public.is_drone_product(NULL, 'Batteries') = false,
    'Bare category "Batteries" is not a drone';
  ASSERT public.is_drone_product(NULL, 'Consumer Drones') = true,
    'Bare category "Consumer Drones" is a drone';
  ASSERT public.is_drone_product(NULL, 'Drone as a Service') = false,
    'Category "Drone as a Service" (contains "service") is not a drone';

  RAISE NOTICE 'drone_detection.test.sql: all assertions passed';
END $$;