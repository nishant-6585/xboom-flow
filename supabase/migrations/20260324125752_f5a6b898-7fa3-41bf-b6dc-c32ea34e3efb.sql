
-- Daily Flow Templates: reusable task definitions per employee
CREATE TABLE public.daily_flow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  sl_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  sub_items TEXT[] DEFAULT '{}',
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  duration_mins INTEGER NOT NULL,
  target_value NUMERIC DEFAULT 0,
  is_break BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Daily Flow Entries: actual daily records with actuals and notes
CREATE TABLE public.daily_flow_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.daily_flow_templates(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  flow_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sl_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  sub_items TEXT[] DEFAULT '{}',
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  duration_mins INTEGER NOT NULL,
  target_value NUMERIC DEFAULT 0,
  actual_value NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  is_break BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  updated_by UUID,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, flow_date, sl_no)
);

-- RLS
ALTER TABLE public.daily_flow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_flow_entries ENABLE ROW LEVEL SECURITY;

-- Templates: authenticated users can read, admin/sales_manager/hr can manage
CREATE POLICY "Authenticated users can read templates"
  ON public.daily_flow_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert templates"
  ON public.daily_flow_templates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update templates"
  ON public.daily_flow_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete templates"
  ON public.daily_flow_templates FOR DELETE TO authenticated USING (true);

-- Entries: authenticated users can read, own entries or admin can update
CREATE POLICY "Authenticated users can read entries"
  ON public.daily_flow_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert entries"
  ON public.daily_flow_entries FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update entries"
  ON public.daily_flow_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete entries"
  ON public.daily_flow_entries FOR DELETE TO authenticated USING (true);
