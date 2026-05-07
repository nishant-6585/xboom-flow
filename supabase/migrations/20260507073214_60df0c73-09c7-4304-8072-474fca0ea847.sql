
CREATE OR REPLACE FUNCTION public.has_outbound_access(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user, 'admin'::app_role)
      OR public.has_role(_user, 'sales_manager'::app_role)
      OR public.has_role(_user, 'supply_chain'::app_role);
$$;

-- outbound_review_queue
DROP POLICY IF EXISTS "Authenticated users can view review queue" ON public.outbound_review_queue;
DROP POLICY IF EXISTS "Authenticated users can insert review queue" ON public.outbound_review_queue;
DROP POLICY IF EXISTS "Authenticated users can update review queue" ON public.outbound_review_queue;
CREATE POLICY "Outbound staff can view review queue" ON public.outbound_review_queue FOR SELECT TO authenticated
  USING (public.has_outbound_access(auth.uid()));
CREATE POLICY "Outbound staff can insert review queue" ON public.outbound_review_queue FOR INSERT TO authenticated
  WITH CHECK (public.has_outbound_access(auth.uid()));
CREATE POLICY "Outbound staff can update review queue" ON public.outbound_review_queue FOR UPDATE TO authenticated
  USING (public.has_outbound_access(auth.uid())) WITH CHECK (public.has_outbound_access(auth.uid()));

-- outbound_upload_logs (uploaded_by is TEXT)
DROP POLICY IF EXISTS "Authenticated users can view upload logs" ON public.outbound_upload_logs;
DROP POLICY IF EXISTS "Authenticated users can insert upload logs" ON public.outbound_upload_logs;
CREATE POLICY "Outbound staff can view upload logs" ON public.outbound_upload_logs FOR SELECT TO authenticated
  USING (public.has_outbound_access(auth.uid()) OR uploaded_by = auth.uid()::text);
CREATE POLICY "Outbound staff can insert upload logs" ON public.outbound_upload_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_outbound_access(auth.uid()));

-- outbound_contacts (uploaded_by is TEXT)
DROP POLICY IF EXISTS "Authenticated users can view outbound contacts" ON public.outbound_contacts;
DROP POLICY IF EXISTS "Authenticated users can insert outbound contacts" ON public.outbound_contacts;
DROP POLICY IF EXISTS "Authenticated users can update outbound contacts" ON public.outbound_contacts;
CREATE POLICY "Outbound staff can view contacts" ON public.outbound_contacts FOR SELECT TO authenticated
  USING (public.has_outbound_access(auth.uid()) OR uploaded_by = auth.uid()::text);
CREATE POLICY "Outbound staff can insert contacts" ON public.outbound_contacts FOR INSERT TO authenticated
  WITH CHECK (public.has_outbound_access(auth.uid()));
CREATE POLICY "Outbound staff or owner can update contacts" ON public.outbound_contacts FOR UPDATE TO authenticated
  USING (public.has_outbound_access(auth.uid()) OR uploaded_by = auth.uid()::text)
  WITH CHECK (public.has_outbound_access(auth.uid()) OR uploaded_by = auth.uid()::text);

-- outbound_call_logs
DROP POLICY IF EXISTS "Authenticated users can view outbound call logs" ON public.outbound_call_logs;
CREATE POLICY "Outbound staff or caller can view call logs" ON public.outbound_call_logs FOR SELECT TO authenticated
  USING (public.has_outbound_access(auth.uid()) OR called_by = auth.uid());

-- attention_items
DROP POLICY IF EXISTS "Authenticated users can view attention items" ON public.attention_items;
DROP POLICY IF EXISTS "Authenticated users can insert attention items" ON public.attention_items;
DROP POLICY IF EXISTS "Authenticated users can update attention items" ON public.attention_items;
CREATE POLICY "Sales staff can view attention items" ON public.attention_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'sales_manager'::app_role)
      OR public.has_role(auth.uid(),'sales'::app_role) OR public.has_role(auth.uid(),'supply_chain'::app_role));
CREATE POLICY "Sales staff can insert attention items" ON public.attention_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'sales_manager'::app_role)
      OR public.has_role(auth.uid(),'sales'::app_role) OR public.has_role(auth.uid(),'supply_chain'::app_role));
CREATE POLICY "Sales staff can update attention items" ON public.attention_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'sales_manager'::app_role)
      OR public.has_role(auth.uid(),'sales'::app_role) OR public.has_role(auth.uid(),'supply_chain'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'sales_manager'::app_role)
      OR public.has_role(auth.uid(),'sales'::app_role) OR public.has_role(auth.uid(),'supply_chain'::app_role));

-- woocommerce_orders
DROP POLICY IF EXISTS "Authenticated users can view woocommerce orders" ON public.woocommerce_orders;
CREATE POLICY "Sales/Ops can view woocommerce orders" ON public.woocommerce_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'sales'::app_role)
      OR public.has_role(auth.uid(),'sales_manager'::app_role) OR public.has_role(auth.uid(),'supply_chain'::app_role)
      OR public.has_role(auth.uid(),'finance'::app_role));

-- daily_flow_entries
DROP POLICY IF EXISTS "Authenticated users can read entries" ON public.daily_flow_entries;
DROP POLICY IF EXISTS "Authenticated users can insert entries" ON public.daily_flow_entries;
DROP POLICY IF EXISTS "Authenticated users can update entries" ON public.daily_flow_entries;
DROP POLICY IF EXISTS "Authenticated users can delete entries" ON public.daily_flow_entries;
CREATE POLICY "Own or HR can view daily flow entries" ON public.daily_flow_entries FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_entries.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "Own or HR can insert daily flow entries" ON public.daily_flow_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_entries.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "Own or HR can update daily flow entries" ON public.daily_flow_entries FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_entries.employee_id AND e.user_id = auth.uid()))
  WITH CHECK (public.is_hr_or_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_entries.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "Own or HR can delete daily flow entries" ON public.daily_flow_entries FOR DELETE TO authenticated
  USING (public.is_hr_or_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_entries.employee_id AND e.user_id = auth.uid()));

-- daily_flow_templates
DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.daily_flow_templates;
DROP POLICY IF EXISTS "Authenticated users can insert templates" ON public.daily_flow_templates;
DROP POLICY IF EXISTS "Authenticated users can update templates" ON public.daily_flow_templates;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON public.daily_flow_templates;
CREATE POLICY "Own or HR can view daily flow templates" ON public.daily_flow_templates FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_templates.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "Own or HR can insert daily flow templates" ON public.daily_flow_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_templates.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "Own or HR can update daily flow templates" ON public.daily_flow_templates FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_templates.employee_id AND e.user_id = auth.uid()))
  WITH CHECK (public.is_hr_or_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_templates.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "Own or HR can delete daily flow templates" ON public.daily_flow_templates FOR DELETE TO authenticated
  USING (public.is_hr_or_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = daily_flow_templates.employee_id AND e.user_id = auth.uid()));

-- lead_tags
DROP POLICY IF EXISTS "Everyone can view active tags" ON public.lead_tags;
