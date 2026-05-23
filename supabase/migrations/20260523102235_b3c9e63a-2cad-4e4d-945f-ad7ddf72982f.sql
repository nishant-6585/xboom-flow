INSERT INTO public.order_invoices (order_id, storage_path, file_name, created_at, updated_at)
VALUES
  ('f6688848-1652-488c-8e85-415cd47658d4',
   '0b1e03a8-5bec-4c97-811a-b9dbd679ee93/f6688848-1652-488c-8e85-415cd47658d4-1779524349650.pdf',
   'invoice.pdf',
   '2026-05-23 08:19:11.50718+00',
   '2026-05-23 08:19:11.50718+00'),
  ('f6688848-1652-488c-8e85-415cd47658d4',
   '0b1e03a8-5bec-4c97-811a-b9dbd679ee93/f6688848-1652-488c-8e85-415cd47658d4-1779524381971.pdf',
   'invoice.pdf',
   '2026-05-23 08:19:43.87708+00',
   '2026-05-23 08:19:43.87708+00')
ON CONFLICT DO NOTHING;

-- Generic backfill: pick up any invoice files in storage that aren't linked in order_invoices
INSERT INTO public.order_invoices (order_id, storage_path, file_name, created_at, updated_at)
SELECT
  o.id,
  obj.name,
  regexp_replace(obj.name, '^.*/', ''),
  obj.created_at,
  obj.created_at
FROM storage.objects obj
JOIN public.orders o
  ON obj.name ~ ('-' || replace(o.id::text, '-', '') || '-')
  OR obj.name LIKE '%/' || o.id::text || '-%'
WHERE obj.bucket_id = 'invoices'
  AND NOT EXISTS (
    SELECT 1 FROM public.order_invoices oi
    WHERE oi.storage_path = obj.name
  );