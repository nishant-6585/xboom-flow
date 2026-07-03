
-- 1) Replace the trigger function: category-based instead of weight-based.
CREATE OR REPLACE FUNCTION public.mark_order_requires_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_category IS NOT NULL
     AND lower(NEW.product_category) IN ('consumer drones','enterprise drones','agriculture drones')
  THEN
    UPDATE public.orders o
       SET requires_confirmation = true,
           confirmation_status = CASE WHEN o.confirmation_status = 'confirmed' THEN 'confirmed' ELSE 'pending' END
     WHERE o.id = NEW.order_id
       AND (o.requires_confirmation = false OR o.confirmation_status = 'not_required');
  END IF;
  RETURN NEW;
END; $$;

-- Re-bind trigger to fire on product_category changes instead of weight_grams.
DROP TRIGGER IF EXISTS trg_mark_order_requires_confirmation ON public.order_items;
CREATE TRIGGER trg_mark_order_requires_confirmation
  AFTER INSERT OR UPDATE OF product_category ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.mark_order_requires_confirmation();

-- 2) Backfill/cleanup: reset 'pending' orders that have NO drone-category item.
UPDATE public.orders o
   SET requires_confirmation = false,
       confirmation_status = 'not_required'
 WHERE o.confirmation_status = 'pending'
   AND NOT EXISTS (
     SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = o.id
        AND oi.product_category IS NOT NULL
        AND lower(oi.product_category) IN ('consumer drones','enterprise drones','agriculture drones')
   );
