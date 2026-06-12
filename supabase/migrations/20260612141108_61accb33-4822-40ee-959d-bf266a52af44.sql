DROP TRIGGER IF EXISTS trg_sync_order_amount_paid ON public.payment_records;

CREATE TRIGGER trg_sync_order_amount_paid
AFTER INSERT OR UPDATE OR DELETE ON public.payment_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_amount_paid();

WITH approved_totals AS (
  SELECT order_id, COALESCE(SUM(amount), 0)::numeric AS total_approved
  FROM public.payment_records
  WHERE status = 'approved'
  GROUP BY order_id
)
UPDATE public.orders o
SET amount_paid = COALESCE(at.total_approved, 0),
    payment_status = CASE
      WHEN COALESCE(at.total_approved, 0) <= 0 THEN 'pending'
      WHEN COALESCE(o.total_sales_amount, 0) > 0
        AND at.total_approved >= o.total_sales_amount THEN 'full'
      ELSE 'partial'
    END,
    updated_at = now()
FROM approved_totals at
WHERE o.id = at.order_id
  AND (
    o.amount_paid IS DISTINCT FROM COALESCE(at.total_approved, 0)
    OR o.payment_status IS DISTINCT FROM CASE
      WHEN COALESCE(at.total_approved, 0) <= 0 THEN 'pending'
      WHEN COALESCE(o.total_sales_amount, 0) > 0
        AND at.total_approved >= o.total_sales_amount THEN 'full'
      ELSE 'partial'
    END
  );