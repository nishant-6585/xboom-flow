CREATE OR REPLACE FUNCTION public.sync_order_product_from_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_first RECORD;
  v_count INT;
  v_label TEXT;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT product_name, product_category, quantity
    INTO v_first
    FROM public.order_items
   WHERE order_id = v_order_id
   ORDER BY created_at ASC, id ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.order_items WHERE order_id = v_order_id;

  v_label := v_first.product_name;
  IF v_count > 1 THEN
    v_label := v_first.product_name || ' (+' || (v_count - 1) || ' more)';
  END IF;

  UPDATE public.orders
     SET product_name     = v_label,
         product_category = COALESCE(v_first.product_category, product_category),
         quantity         = COALESCE(v_first.quantity, quantity)
   WHERE id = v_order_id
     AND (
       product_name IS DISTINCT FROM v_label
       OR product_category IS DISTINCT FROM COALESCE(v_first.product_category, product_category)
       OR quantity IS DISTINCT FROM COALESCE(v_first.quantity, quantity)
     );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_product_from_items ON public.order_items;
CREATE TRIGGER trg_sync_order_product_from_items
AFTER INSERT OR UPDATE OF product_name, product_category, quantity OR DELETE
ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_product_from_items();

WITH primary_item AS (
  SELECT DISTINCT ON (oi.order_id)
    oi.order_id,
    oi.product_name,
    oi.product_category,
    oi.quantity
  FROM public.order_items oi
  ORDER BY oi.order_id, oi.created_at ASC, oi.id ASC
),
counts AS (
  SELECT order_id, COUNT(*) AS c FROM public.order_items GROUP BY order_id
)
UPDATE public.orders o
   SET product_name = CASE WHEN c.c > 1
                        THEN p.product_name || ' (+' || (c.c - 1) || ' more)'
                        ELSE p.product_name
                      END,
       product_category = COALESCE(p.product_category, o.product_category),
       quantity = COALESCE(p.quantity, o.quantity)
  FROM primary_item p
  JOIN counts c ON c.order_id = p.order_id
 WHERE o.id = p.order_id
   AND o.product_name IS DISTINCT FROM CASE WHEN c.c > 1
                        THEN p.product_name || ' (+' || (c.c - 1) || ' more)'
                        ELSE p.product_name
                      END;