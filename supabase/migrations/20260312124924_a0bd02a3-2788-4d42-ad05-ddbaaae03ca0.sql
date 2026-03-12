
-- Checklist templates table (flexible, not hardcoded)
CREATE TABLE public.checklist_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_type TEXT NOT NULL CHECK (checklist_type IN ('onboarding', 'offboarding')),
  item_name TEXT NOT NULL,
  item_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employee checklists (one per employee per type)
CREATE TABLE public.employee_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  checklist_type TEXT NOT NULL CHECK (checklist_type IN ('onboarding', 'offboarding')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  completion_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, checklist_type)
);

-- Individual checklist items for each employee
CREATE TABLE public.employee_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES public.employee_checklists(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES public.checklist_templates(id),
  item_name TEXT NOT NULL,
  item_order INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID,
  completed_by_name TEXT,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_checklist_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies: HR/Admin can manage all
CREATE POLICY "HR/Admin can manage checklist templates"
  ON public.checklist_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "HR/Admin can manage employee checklists"
  ON public.employee_checklists FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "HR/Admin can manage checklist items"
  ON public.employee_checklist_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- Function to auto-calculate completion percentage
CREATE OR REPLACE FUNCTION public.update_checklist_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
  v_pct NUMERIC;
  v_status TEXT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_completed = true)
  INTO v_total, v_completed
  FROM public.employee_checklist_items
  WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id);

  IF v_total > 0 THEN
    v_pct := ROUND((v_completed::NUMERIC / v_total) * 100, 0);
  ELSE
    v_pct := 0;
  END IF;

  IF v_completed = 0 THEN v_status := 'not_started';
  ELSIF v_completed = v_total THEN v_status := 'completed';
  ELSE v_status := 'in_progress';
  END IF;

  UPDATE public.employee_checklists
  SET completion_percentage = v_pct, status = v_status, updated_at = now()
  WHERE id = COALESCE(NEW.checklist_id, OLD.checklist_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_checklist_completion
AFTER INSERT OR UPDATE OR DELETE ON public.employee_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.update_checklist_completion();

-- Function to auto-create onboarding checklist when employee is created
CREATE OR REPLACE FUNCTION public.auto_create_onboarding_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_checklist_id UUID;
  v_template RECORD;
BEGIN
  -- Only create if no onboarding checklist exists
  IF NOT EXISTS (SELECT 1 FROM public.employee_checklists WHERE employee_id = NEW.id AND checklist_type = 'onboarding') THEN
    INSERT INTO public.employee_checklists (employee_id, checklist_type)
    VALUES (NEW.id, 'onboarding')
    RETURNING id INTO v_checklist_id;

    FOR v_template IN
      SELECT id, item_name, item_order FROM public.checklist_templates
      WHERE checklist_type = 'onboarding' AND is_active = true
      ORDER BY item_order
    LOOP
      INSERT INTO public.employee_checklist_items (checklist_id, template_item_id, item_name, item_order)
      VALUES (v_checklist_id, v_template.id, v_template.item_name, v_template.item_order);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_onboarding
AFTER INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.auto_create_onboarding_checklist();

-- Function to auto-create offboarding checklist when employee status changes to resigned/exited
CREATE OR REPLACE FUNCTION public.auto_create_offboarding_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_checklist_id UUID;
  v_template RECORD;
BEGIN
  IF NEW.employment_status IN ('resigned', 'terminated') AND (OLD.employment_status IS DISTINCT FROM NEW.employment_status) THEN
    IF NOT EXISTS (SELECT 1 FROM public.employee_checklists WHERE employee_id = NEW.id AND checklist_type = 'offboarding') THEN
      INSERT INTO public.employee_checklists (employee_id, checklist_type)
      VALUES (NEW.id, 'offboarding')
      RETURNING id INTO v_checklist_id;

      FOR v_template IN
        SELECT id, item_name, item_order FROM public.checklist_templates
        WHERE checklist_type = 'offboarding' AND is_active = true
        ORDER BY item_order
      LOOP
        INSERT INTO public.employee_checklist_items (checklist_id, template_item_id, item_name, item_order)
        VALUES (v_checklist_id, v_template.id, v_template.item_name, v_template.item_order);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_offboarding
AFTER UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.auto_create_offboarding_checklist();

-- Seed default onboarding templates
INSERT INTO public.checklist_templates (checklist_type, item_name, item_order) VALUES
('onboarding', 'Offer Letter', 1),
('onboarding', 'Signed Offer Letter', 2),
('onboarding', 'Welcome Email', 3),
('onboarding', 'NDA', 4),
('onboarding', 'Signed NDA', 5),
('onboarding', 'Laptop Issued', 6),
('onboarding', 'Mouse Issued', 7),
('onboarding', 'Laptop Battery Issued', 8),
('onboarding', 'Cell Phone Issued', 9),
('onboarding', 'Sim Issued', 10),
('onboarding', 'Official Email', 11),
('onboarding', 'Xboom Flow Access', 12),
('onboarding', 'Slack Access', 13),
('onboarding', 'Relieving Letter', 14),
('onboarding', 'Payslip', 15),
('onboarding', 'Aadhar', 16),
('onboarding', 'PAN', 17),
('onboarding', 'Bank Details', 18),
('onboarding', 'Photo', 19),
('onboarding', 'Background Verification', 20),
('onboarding', 'Jacket', 21),
('onboarding', 'Bag', 22),
('onboarding', 'Bottle', 23),
('onboarding', 'Diary', 24),
('onboarding', 'Tshirt', 25);

-- Seed default offboarding templates
INSERT INTO public.checklist_templates (checklist_type, item_name, item_order) VALUES
('offboarding', 'Knowledge Transfer', 1),
('offboarding', 'Laptop', 2),
('offboarding', 'Laptop Battery', 3),
('offboarding', 'Mouse', 4),
('offboarding', 'Cell Phone', 5),
('offboarding', 'Sim', 6),
('offboarding', 'FnF Settlement', 7),
('offboarding', 'Relieving Letter', 8),
('offboarding', 'Payslip', 9),
('offboarding', 'Email', 10),
('offboarding', 'Xboom Flow Access', 11),
('offboarding', 'Slack Access', 12);

-- Create onboarding checklists for all existing employees
DO $$
DECLARE
  v_emp RECORD;
  v_checklist_id UUID;
  v_template RECORD;
BEGIN
  FOR v_emp IN SELECT id FROM public.employees WHERE is_active = true LOOP
    IF NOT EXISTS (SELECT 1 FROM public.employee_checklists WHERE employee_id = v_emp.id AND checklist_type = 'onboarding') THEN
      INSERT INTO public.employee_checklists (employee_id, checklist_type)
      VALUES (v_emp.id, 'onboarding')
      RETURNING id INTO v_checklist_id;

      FOR v_template IN
        SELECT id, item_name, item_order FROM public.checklist_templates
        WHERE checklist_type = 'onboarding' AND is_active = true ORDER BY item_order
      LOOP
        INSERT INTO public.employee_checklist_items (checklist_id, template_item_id, item_name, item_order)
        VALUES (v_checklist_id, v_template.id, v_template.item_name, v_template.item_order);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
