-- Create forms table
CREATE TABLE public.forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create form_fields table
CREATE TABLE public.form_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  field_type TEXT NOT NULL, -- text, email, phone, number, textarea, dropdown, checkbox, radio, date
  label TEXT NOT NULL,
  placeholder TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB, -- For dropdown, checkbox, radio options
  field_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create form_submissions table
CREATE TABLE public.form_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  submission_data JSONB NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for forms (admin only for management)
CREATE POLICY "Admin can manage forms"
  ON public.forms
  FOR ALL
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approved users can view forms"
  ON public.forms
  FOR SELECT
  USING (is_user_approved(auth.uid()));

-- RLS policies for form_fields (admin only for management)
CREATE POLICY "Admin can manage form fields"
  ON public.form_fields
  FOR ALL
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approved users can view form fields"
  ON public.form_fields
  FOR SELECT
  USING (is_user_approved(auth.uid()));

-- Public read for form_fields (for embed)
CREATE POLICY "Public can view active form fields"
  ON public.form_fields
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.forms f 
    WHERE f.id = form_fields.form_id AND f.is_active = true
  ));

-- RLS policies for form_submissions
CREATE POLICY "Admin can view all submissions"
  ON public.form_submissions
  FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete submissions"
  ON public.form_submissions
  FOR DELETE
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can submit to active forms"
  ON public.form_submissions
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.forms f 
    WHERE f.id = form_submissions.form_id AND f.is_active = true
  ));

-- Trigger for updated_at
CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON public.forms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_form_fields_form_id ON public.form_fields(form_id);
CREATE INDEX idx_form_submissions_form_id ON public.form_submissions(form_id);
CREATE INDEX idx_form_submissions_submitted_at ON public.form_submissions(submitted_at DESC);