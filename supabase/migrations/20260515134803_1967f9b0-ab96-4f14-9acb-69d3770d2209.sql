-- Finance: read order_items so Tally / finance views can compute cost & profit
CREATE POLICY "Finance can view order items"
ON public.order_items
FOR SELECT
USING (
  public.is_user_approved(auth.uid())
  AND public.has_role(auth.uid(), 'finance'::app_role)
);

-- Finance: read order_procurement_links so inventory-fulfilled orders show cost
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_procurement_links'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_procurement_links'
      AND policyname = 'Finance can view order procurement links'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Finance can view order procurement links"
      ON public.order_procurement_links
      FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND public.has_role(auth.uid(), 'finance'::app_role)
      )
    $p$;
  END IF;
END $$;