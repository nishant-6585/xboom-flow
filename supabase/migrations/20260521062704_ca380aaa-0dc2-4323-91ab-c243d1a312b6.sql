
DROP POLICY IF EXISTS "Authenticated users can view form leads" ON public.form_leads;
DROP POLICY IF EXISTS "Authenticated users can update form leads" ON public.form_leads;
CREATE POLICY "Privileged roles and assigned user can view form leads" ON public.form_leads FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'sales_manager'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role) OR (has_role(auth.uid(),'sales'::app_role) AND (assigned_to=auth.uid() OR sales_person_id=auth.uid())));
CREATE POLICY "Privileged roles and assigned user can update form leads" ON public.form_leads FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'sales_manager'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role) OR assigned_to=auth.uid() OR sales_person_id=auth.uid());

DROP POLICY IF EXISTS "Authenticated users can view activities" ON public.crm_contact_activities;
CREATE POLICY "Privileged roles can view CRM activities" ON public.crm_contact_activities FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'sales'::app_role) OR has_role(auth.uid(),'sales_manager'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read cache" ON public.ai_resolution_cache;
CREATE POLICY "Privileged roles can read AI resolution cache" ON public.ai_resolution_cache FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'it'::app_role));

DROP POLICY IF EXISTS "Authenticated users can update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON storage.objects;
CREATE POLICY "Privileged roles or uploader can update invoices" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='invoices' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role) OR (storage.foldername(name))[1]=auth.uid()::text));
CREATE POLICY "Privileged roles or uploader can delete invoices" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='invoices' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role) OR (storage.foldername(name))[1]=auth.uid()::text));

DROP POLICY IF EXISTS "Authenticated users can view purchase orders" ON storage.objects;
CREATE POLICY "Privileged roles can view purchase orders" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='purchase-orders' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role) OR (has_role(auth.uid(),'sales'::app_role) AND (storage.foldername(name))[1]=auth.uid()::text)));

DROP POLICY IF EXISTS "Authenticated users can view supplier payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload supplier payment screenshots" ON storage.objects;
CREATE POLICY "Privileged roles can view supplier payment screenshots" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='supplier-payment-screenshots' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role)));
CREATE POLICY "Privileged roles can upload supplier payment screenshots" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='supplier-payment-screenshots' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'finance'::app_role) OR has_role(auth.uid(),'supply_chain'::app_role)));

DROP POLICY IF EXISTS "Allow authenticated uploads to training-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from training-uploads" ON storage.objects;
