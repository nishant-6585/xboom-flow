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
  ASSERT public.is_drone_product('DJI Battery Charging Hub for Mavic 3', NULL) = true,
    'Explicit "mavic" model token beats charging-hub wording per policy';
  ASSERT public.is_drone_product(NULL, 'Batteries') = false,
    'Bare category "Batteries" is not a drone';
  ASSERT public.is_drone_product(NULL, 'Consumer Drones') = true,
    'Bare category "Consumer Drones" is a drone';
  ASSERT public.is_drone_product(NULL, 'Drone as a Service') = false,
    'Category "Drone as a Service" (contains "service") is not a drone';

  RAISE NOTICE 'drone_detection.test.sql: all assertions passed';
END $$;