
-- Access requests table
CREATE TABLE public.ai_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL,
  requester_name TEXT NOT NULL DEFAULT '',
  requested_data_type TEXT NOT NULL,
  target_entity_id TEXT,
  target_description TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID,
  approved_by_name TEXT,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_access_requests ENABLE ROW LEVEL SECURITY;

-- Admins can see all, HR can see HR requests, Finance can see finance requests
CREATE POLICY "Admins can manage all access requests"
  ON public.ai_access_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own access requests"
  ON public.ai_access_requests FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE POLICY "Users can create own access requests"
  ON public.ai_access_requests FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY "HR can manage HR access requests"
  ON public.ai_access_requests FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr')
    AND requested_data_type IN ('salary', 'bank_details', 'pan', 'attendance', 'leave', 'employee_personal')
  );

CREATE POLICY "Finance can manage finance access requests"
  ON public.ai_access_requests FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'finance')
    AND requested_data_type IN ('payment', 'expense', 'invoice', 'cashflow')
  );

-- Temporary permissions table
CREATE TABLE public.ai_temp_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  data_type TEXT NOT NULL,
  target_entity_id TEXT,
  granted_by UUID NOT NULL,
  granted_by_name TEXT NOT NULL DEFAULT '',
  access_request_id UUID REFERENCES public.ai_access_requests(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_temp_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage temp permissions"
  ON public.ai_temp_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own temp permissions"
  ON public.ai_temp_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "HR can manage HR temp permissions"
  ON public.ai_temp_permissions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr')
    AND data_type IN ('salary', 'bank_details', 'pan', 'attendance', 'leave', 'employee_personal')
  );

CREATE POLICY "Finance can manage finance temp permissions"
  ON public.ai_temp_permissions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'finance')
    AND data_type IN ('payment', 'expense', 'invoice', 'cashflow')
  );

-- Add approval_reference_id to ai_access_logs
ALTER TABLE public.ai_access_logs ADD COLUMN IF NOT EXISTS approval_reference_id UUID REFERENCES public.ai_access_requests(id);
