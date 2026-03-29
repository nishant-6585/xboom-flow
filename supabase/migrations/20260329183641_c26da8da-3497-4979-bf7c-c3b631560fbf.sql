
-- Create form_leads table
CREATE TABLE public.form_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
  form_name TEXT NOT NULL,
  submission_id UUID REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT 'Unknown',
  email TEXT,
  phone TEXT,
  company TEXT,
  city TEXT,
  product_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to UUID,
  assigned_to_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_leads ENABLE ROW LEVEL SECURITY;

-- RLS policies - authenticated users can read
CREATE POLICY "Authenticated users can view form leads"
  ON public.form_leads FOR SELECT TO authenticated
  USING (true);

-- Admin/sales can update
CREATE POLICY "Authenticated users can update form leads"
  ON public.form_leads FOR UPDATE TO authenticated
  USING (true);

-- System inserts via trigger (security definer)
CREATE POLICY "Authenticated users can insert form leads"
  ON public.form_leads FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admin can delete
CREATE POLICY "Authenticated users can delete form leads"
  ON public.form_leads FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supply_chain')
  );

-- Updated_at trigger
CREATE TRIGGER update_form_leads_updated_at
  BEFORE UPDATE ON public.form_leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger function to auto-push form submissions to leads
CREATE OR REPLACE FUNCTION public.push_form_submission_to_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_form RECORD;
  v_field RECORD;
  v_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_company TEXT;
  v_city TEXT;
  v_product TEXT;
  v_notes TEXT := '';
  v_field_value TEXT;
BEGIN
  SELECT id, name INTO v_form FROM public.forms WHERE id = NEW.form_id;

  -- Skip job application / recruitment forms
  IF LOWER(v_form.name) LIKE '%job%' OR LOWER(v_form.name) LIKE '%career%' 
     OR LOWER(v_form.name) LIKE '%application%' OR LOWER(v_form.name) LIKE '%recruit%'
     OR LOWER(v_form.name) LIKE '%hiring%' OR LOWER(v_form.name) LIKE '%resume%' THEN
    RETURN NEW;
  END IF;

  FOR v_field IN
    SELECT id, label, field_type FROM public.form_fields WHERE form_id = NEW.form_id ORDER BY field_order
  LOOP
    v_field_value := NEW.submission_data ->> v_field.id::text;
    IF v_field_value IS NULL OR TRIM(v_field_value) = '' THEN
      CONTINUE;
    END IF;

    IF v_field.field_type = 'email' AND v_email IS NULL THEN
      v_email := v_field_value;
    ELSIF v_field.field_type = 'phone' AND v_phone IS NULL THEN
      v_phone := v_field_value;
    ELSIF LOWER(v_field.label) LIKE '%name%' AND v_name IS NULL AND v_field.field_type NOT IN ('email') THEN
      v_name := v_field_value;
    ELSIF LOWER(v_field.label) LIKE '%company%' OR LOWER(v_field.label) LIKE '%organization%' OR LOWER(v_field.label) LIKE '%organisation%' THEN
      v_company := v_field_value;
    ELSIF LOWER(v_field.label) LIKE '%city%' OR LOWER(v_field.label) LIKE '%location%' THEN
      v_city := v_field_value;
    ELSIF LOWER(v_field.label) LIKE '%product%' OR LOWER(v_field.label) LIKE '%drone%' OR LOWER(v_field.label) LIKE '%model%' THEN
      v_product := v_field_value;
    ELSE
      v_notes := v_notes || v_field.label || ': ' || v_field_value || E'\n';
    END IF;
  END LOOP;

  IF v_name IS NOT NULL OR v_email IS NOT NULL OR v_phone IS NOT NULL THEN
    INSERT INTO public.form_leads (form_id, form_name, submission_id, customer_name, email, phone, company, city, product_name, notes)
    VALUES (NEW.form_id, v_form.name, NEW.id, COALESCE(v_name, 'Unknown'), v_email, v_phone, v_company, v_city, v_product, NULLIF(TRIM(v_notes), ''));
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to form_submissions
CREATE TRIGGER trg_push_form_submission_to_leads
  AFTER INSERT ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.push_form_submission_to_leads();
