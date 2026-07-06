-- Duplicate cleanup for order_invoices.
-- Root cause: the unique index on zoho_invoice_id treats NULLs as distinct, so the
-- Zoho poller/backfill upsert missed pre-existing manual rows for the same
-- (order_id, invoice_number) and inserted a second row. Poller + attach edge
-- functions have been patched to adopt existing NULL-zoho rows going forward.

-- Category A (13 rows): keep the Zoho-poller row (zoho_invoice_id set),
-- delete the manual/legacy row (zoho_invoice_id NULL).
DELETE FROM public.order_invoices WHERE id IN (
  '888a5b71-9a5d-4170-90cc-2d756121372e', -- 022d42cf.../XI-May26-0036
  'e33a2436-941f-4f7d-b9b6-32dff907dd36', -- 09dae159.../XI-Jun26-0088
  'ebf4b68c-7e0d-4ddd-95ca-57e4df3a32f5', -- 10931f65.../XI-May26-0028
  '9f4a92f5-486a-4918-80bf-707be3757fb7', -- 18addcdf.../XI-May26-0031
  '3c1d97f0-7ed2-4a1d-a0aa-5aa80f5f4435', -- 26ae6539.../XI-May26-0029
  '13a1ef81-0754-41b4-ba97-0d95f0975e83', -- 28375275.../XI-Jun26-0110
  '73f1b28a-2fb2-41e9-80ee-93cd94e08bec', -- 2899caad.../XI-Jun26-0089
  '6dac9d60-b8ba-4024-80da-6ad2c62dd15b', -- 2e19e55f.../XI-May26-0069
  '0c402cc1-2242-4350-9d2c-4df8b0282e85', -- 54da710a.../XI-May26-0071
  '1e601185-9eb1-4f6c-94b5-019f89f0eed2', -- 6c6aa100.../XI-May26-0070
  '70694a3d-08f8-48d2-adb2-00959c7261ee', -- 6e7278a5.../XI-May26-0032
  '9583bd3e-a87e-4db1-8c1e-6bb396a99340', -- 719b0a8b.../XI-May26-0073
  '3659e9c6-af6d-4de6-946c-ea754b3841b5', -- b3f70fab.../XI-May26-0035
  '330b6657-67a0-4cbe-8166-b74dd26339b3', -- bf8884b4.../XI-May26-0030
  '6c4ff69c-47bf-4616-be4c-3ee13d0b5d17'  -- e9b84820.../XI-May26-0027
);

-- Category B (both/all rows NULL zoho_invoice_id — accidental manual double-uploads).
-- Keep earliest row per (order_id, invoice_number), delete the extras.
DELETE FROM public.order_invoices WHERE id IN (
  'ab459ff3-851c-43fa-b4c6-46ce248d4e1a', -- 0612aa0d.../XI-Apr26-0007 (2nd upload)
  'b8ca43bb-3b3f-4ce1-a54b-1f306e8af6b0', -- 07787158.../XI-Arg26-0009 (2nd upload)
  '55d1c245-be76-498c-b59b-b757a3116246', -- 2a79f3ee.../INV-000454 (2nd upload)
  '5e77cea3-80be-4789-84c2-4f638e7c1852', -- 2a79f3ee.../INV-000454 (3rd upload)
  'dd30eaef-87a2-483c-993b-d9c39073727e', -- 6537325e.../INV-001231 (2nd upload)
  '32c022b9-c479-41f6-8a41-4896572ad6b1'  -- 6922edb1.../INV-001230 (2nd upload)
);
