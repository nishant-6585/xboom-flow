-- Create employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'General',
  role TEXT,
  manager_id UUID,
  work_location TEXT DEFAULT 'Office' CHECK (work_location IN ('Office', 'Remote', 'Field')),
  shift_type TEXT DEFAULT 'Fixed' CHECK (shift_type IN ('Fixed', 'Flexible')),
  shift_start_time TIME DEFAULT '09:00:00',
  shift_end_time TIME DEFAULT '18:00:00',
  weekly_hours_target NUMERIC DEFAULT 48,
  monthly_attendance_target NUMERIC DEFAULT 95,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create attendance_logs table
CREATE TABLE public.attendance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_time TIMESTAMP WITH TIME ZONE,
  check_out_time TIMESTAMP WITH TIME ZONE,
  working_hours NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN check_in_time IS NOT NULL AND check_out_time IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 3600
      ELSE NULL
    END
  ) STORED,
  status TEXT DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'on_leave', 'weekend', 'holiday')),
  location TEXT,
  notes TEXT,
  checkout_missing BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Create leave_requests table
CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('casual', 'sick', 'paid', 'unpaid', 'half_day')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  reason TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  approver_id UUID,
  approver_name TEXT,
  approved_rejected_at TIMESTAMP WITH TIME ZONE,
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Employees policies (all approved users can view, admins can manage)
CREATE POLICY "Approved users can view employees"
  ON public.employees FOR SELECT
  USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins can manage employees"
  ON public.employees FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update their own employee record"
  ON public.employees FOR UPDATE
  USING (user_id = auth.uid() AND is_user_approved(auth.uid()));

-- Attendance logs policies
CREATE POLICY "Approved users can view attendance"
  ON public.attendance_logs FOR SELECT
  USING (is_user_approved(auth.uid()));

CREATE POLICY "Users can manage their own attendance"
  ON public.attendance_logs FOR ALL
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND is_user_approved(auth.uid())
  );

CREATE POLICY "Admins can manage all attendance"
  ON public.attendance_logs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Leave requests policies
CREATE POLICY "Approved users can view leave requests"
  ON public.leave_requests FOR SELECT
  USING (is_user_approved(auth.uid()));

CREATE POLICY "Users can manage their own leave requests"
  ON public.leave_requests FOR ALL
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND is_user_approved(auth.uid())
  );

CREATE POLICY "Admins can manage all leave requests"
  ON public.leave_requests FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_logs_updated_at
  BEFORE UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get employee KPI metrics
CREATE OR REPLACE FUNCTION public.get_employee_kpi(p_employee_id UUID, p_month DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
  total_working_days INTEGER,
  present_days INTEGER,
  leave_days INTEGER,
  attendance_percentage NUMERIC,
  total_working_hours NUMERIC,
  target_hours NUMERIC,
  hours_fulfilment_percentage NUMERIC,
  kpi_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_weekly_target NUMERIC;
BEGIN
  -- Get employee's weekly hours target
  SELECT weekly_hours_target INTO v_weekly_target
  FROM public.employees WHERE id = p_employee_id;

  RETURN QUERY
  WITH month_data AS (
    SELECT 
      COUNT(*) FILTER (WHERE status NOT IN ('weekend', 'holiday'))::INTEGER as working_days,
      COUNT(*) FILTER (WHERE status = 'present')::INTEGER as present_count,
      COUNT(*) FILTER (WHERE status = 'on_leave')::INTEGER as leave_count,
      COALESCE(SUM(working_hours) FILTER (WHERE working_hours IS NOT NULL), 0) as total_hours
    FROM public.attendance_logs
    WHERE employee_id = p_employee_id
      AND date >= date_trunc('month', p_month)
      AND date < date_trunc('month', p_month) + interval '1 month'
  )
  SELECT 
    md.working_days,
    md.present_count,
    md.leave_count,
    CASE WHEN md.working_days > 0 
      THEN ROUND((md.present_count::NUMERIC / md.working_days) * 100, 1) 
      ELSE 0 
    END,
    ROUND(md.total_hours::NUMERIC, 1),
    (v_weekly_target * 4)::NUMERIC, -- Approximate monthly target
    CASE WHEN (v_weekly_target * 4) > 0 
      THEN ROUND((md.total_hours / (v_weekly_target * 4)) * 100, 1) 
      ELSE 0 
    END,
    CASE WHEN md.working_days > 0 
      THEN ROUND(
        ((md.present_count::NUMERIC / md.working_days) * 100 * 0.5) +
        (CASE WHEN (v_weekly_target * 4) > 0 
          THEN (md.total_hours / (v_weekly_target * 4)) * 100 * 0.5 
          ELSE 0 
        END),
        1
      )
      ELSE 0 
    END
  FROM month_data md;
END;
$$;

-- Enable realtime for attendance
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;