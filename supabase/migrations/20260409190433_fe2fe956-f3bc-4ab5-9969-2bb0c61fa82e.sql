
-- Simple counter table for round-robin
CREATE TABLE IF NOT EXISTS public.lead_assignment_counter (
  id INTEGER PRIMARY KEY DEFAULT 1,
  counter INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.lead_assignment_counter (id, counter) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- Round-robin assignment function using counter
CREATE OR REPLACE FUNCTION public.auto_assign_salesperson()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counter INTEGER;
  v_idx INTEGER;
  v_ids UUID[] := ARRAY[
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39',
    'a790b58d-8e3d-4333-b6d6-08be631c865d',
    '457fc2d5-9fc5-439a-938e-5b998549b811',
    'e05f9afe-0160-4956-bb1f-496028386062'
  ];
  v_names TEXT[] := ARRAY['suman das', 'Narasimha', 'mohammed musthak', 'Arjav chauhan'];
BEGIN
  IF NEW.sales_person_id IS NOT NULL AND NEW.sales_person_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.lead_assignment_counter SET counter = counter + 1 WHERE id = 1 RETURNING counter INTO v_counter;
  v_idx := ((v_counter - 1) % 4) + 1;

  NEW.sales_person_id := v_ids[v_idx];
  NEW.sales_person_name := v_names[v_idx];

  RETURN NEW;
END;
$function$;

-- Drop existing triggers if any (safe)
DROP TRIGGER IF EXISTS auto_assign_enquiry_salesperson ON public.enquiries;
DROP TRIGGER IF EXISTS auto_assign_call_salesperson ON public.call_logs;
DROP TRIGGER IF EXISTS auto_assign_form_salesperson ON public.form_leads;
DROP TRIGGER IF EXISTS auto_assign_email_salesperson ON public.email_leads;
DROP TRIGGER IF EXISTS auto_assign_interakt_salesperson ON public.interakt_leads;

-- Create triggers
CREATE TRIGGER auto_assign_enquiry_salesperson
  BEFORE INSERT ON public.enquiries FOR EACH ROW EXECUTE FUNCTION public.auto_assign_salesperson();

CREATE TRIGGER auto_assign_call_salesperson
  BEFORE INSERT ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.auto_assign_salesperson();

CREATE TRIGGER auto_assign_form_salesperson
  BEFORE INSERT ON public.form_leads FOR EACH ROW EXECUTE FUNCTION public.auto_assign_salesperson();

CREATE TRIGGER auto_assign_email_salesperson
  BEFORE INSERT ON public.email_leads FOR EACH ROW EXECUTE FUNCTION public.auto_assign_salesperson();

CREATE TRIGGER auto_assign_interakt_salesperson
  BEFORE INSERT ON public.interakt_leads FOR EACH ROW EXECUTE FUNCTION public.auto_assign_salesperson();
