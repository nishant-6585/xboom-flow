DROP POLICY IF EXISTS "Authenticated users can view template library" ON public.flow_template_library;
CREATE POLICY "Internal approved users can view template library"
ON public.flow_template_library
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
);

DROP POLICY IF EXISTS "Authenticated users can view template library items" ON public.flow_template_library_items;
CREATE POLICY "Internal approved users can view template library items"
ON public.flow_template_library_items
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
);