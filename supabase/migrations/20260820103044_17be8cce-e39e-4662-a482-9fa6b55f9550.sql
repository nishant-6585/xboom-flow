CREATE OR REPLACE VIEW public.orders_missing_phone
WITH (security_invoker = on) AS
SELECT id, order_number, customer_name, customer_company, customer_email, status,
       order_date, created_at, sales_person_id, sales_person_name, total_sales_amount
FROM orders o
WHERE o.deleted_at IS NULL
  AND (COALESCE(o.status::text, '') <> ALL (ARRAY['cancelled','delivery_done','rto']))
  AND COALESCE(o.source, 'manual') <> 'website'
  AND length(regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g')) < 10;