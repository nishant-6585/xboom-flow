-- Repair backfill: rename system-user Woo orders to 'Vishal (Website)' so they never
-- look identical to real Vishal-attributed orders. Also update the system profile name.
UPDATE public.orders
SET sales_person_name = 'Vishal (Website)'
WHERE sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'
  AND sales_person_name IN ('Vishal','Website (Auto)');

UPDATE public.profiles
SET name = 'Vishal (Website)'
WHERE id = 'a8050cc3-7d17-44ac-a083-d8023d505331'
  AND name IN ('Vishal','Website (Auto)');