
-- 1) Tighten portal-attachments storage policy: sales/sales_manager only on assigned accounts
DROP POLICY IF EXISTS "portal-attachments: internal full" ON storage.objects;

CREATE POLICY "portal-attachments: admin internal full"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'portal-attachments'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'support'::public.app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'portal-attachments'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'support'::public.app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
  )
);

CREATE POLICY "portal-attachments: sales assigned accounts"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'portal-attachments'
  AND (
    public.has_role(auth.uid(), 'sales'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
  )
  AND EXISTS (
    SELECT 1 FROM public.portal_orders o
    WHERE o.assigned_rep_id = auth.uid()
      AND o.account_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'portal-attachments'
  AND (
    public.has_role(auth.uid(), 'sales'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
  )
  AND EXISTS (
    SELECT 1 FROM public.portal_orders o
    WHERE o.assigned_rep_id = auth.uid()
      AND o.account_id::text = (storage.foldername(name))[1]
  )
);

-- 2) Lock down search_path on app function
ALTER FUNCTION public.is_valid_repair_stage_transition(public.repair_stage, public.repair_stage)
  SET search_path = public;
