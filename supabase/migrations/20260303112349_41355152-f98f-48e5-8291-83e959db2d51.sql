
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL UNIQUE,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read holidays
CREATE POLICY "Authenticated users can view holidays"
  ON public.holidays FOR SELECT
  TO authenticated
  USING (true);

-- Only admins/HR can manage holidays
CREATE POLICY "Admins and HR can insert holidays"
  ON public.holidays FOR INSERT
  TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admins and HR can update holidays"
  ON public.holidays FOR UPDATE
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Admins and HR can delete holidays"
  ON public.holidays FOR DELETE
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));
