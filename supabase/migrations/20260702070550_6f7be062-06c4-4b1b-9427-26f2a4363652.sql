
-- profiles: prevent self-approval on insert & update
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND COALESCE(is_approved, false) = false);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND is_approved = (SELECT p.is_approved FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- company_activities: restrict INSERT to approved CRM roles, enforce created_by
DROP POLICY IF EXISTS "Authenticated can create company activities" ON public.company_activities;
CREATE POLICY "CRM roles can create company activities" ON public.company_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())
    AND created_by = auth.uid()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

-- form_leads: restrict INSERT to approved privileged roles
DROP POLICY IF EXISTS "Authenticated users can insert form leads" ON public.form_leads;
CREATE POLICY "Privileged roles can insert form leads" ON public.form_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
    )
  );

-- meetings: require owner_id = auth.uid() (or admin/sales_manager creating for team)
DROP POLICY IF EXISTS "Authenticated users can create meetings" ON public.meetings;
CREATE POLICY "Users can create own meetings" ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())
    AND (
      owner_id = auth.uid()
      OR host_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
    )
  );
