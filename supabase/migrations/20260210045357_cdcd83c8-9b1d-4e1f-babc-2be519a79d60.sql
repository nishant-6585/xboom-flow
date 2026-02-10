
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view all enquiry items" ON public.enquiry_items;
DROP POLICY IF EXISTS "Users can create enquiry items" ON public.enquiry_items;
DROP POLICY IF EXISTS "Users can update enquiry items" ON public.enquiry_items;
DROP POLICY IF EXISTS "Users can delete enquiry items" ON public.enquiry_items;

-- SELECT: Mirror parent enquiries access — admin, supply_chain see all; sales sees own enquiry items
CREATE POLICY "Approved users can view accessible enquiry items"
ON public.enquiry_items
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.enquiries e
      WHERE e.id = enquiry_items.enquiry_id
      AND e.sales_person_id = auth.uid()
    )
  )
);

-- INSERT: Sales and admin can create enquiry items (matches enquiry creation permissions)
CREATE POLICY "Sales and admin can create enquiry items"
ON public.enquiry_items
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
  ) AND EXISTS (
    SELECT 1 FROM public.enquiries e
    WHERE e.id = enquiry_items.enquiry_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR e.sales_person_id = auth.uid()
    )
  )
);

-- UPDATE: Supply chain and admin can update (matches enquiry update permissions)
CREATE POLICY "Supply chain and admin can update enquiry items"
ON public.enquiry_items
FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
);

-- DELETE: Admin can delete directly; CASCADE from enquiries handles the rest
CREATE POLICY "Admin can delete enquiry items"
ON public.enquiry_items
FOR DELETE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)
);
