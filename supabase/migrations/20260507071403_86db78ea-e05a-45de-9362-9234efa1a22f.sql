
-- Tables
CREATE TABLE public.monthly_pulses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  month text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1
);

CREATE INDEX idx_monthly_pulses_active_created ON public.monthly_pulses(is_active, created_at DESC);

CREATE TABLE public.monthly_pulse_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id uuid NOT NULL REFERENCES public.monthly_pulses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pulse_id, user_id)
);

CREATE INDEX idx_monthly_pulse_reads_user ON public.monthly_pulse_reads(user_id, pulse_id);

ALTER TABLE public.monthly_pulses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_pulse_reads ENABLE ROW LEVEL SECURITY;

-- monthly_pulses policies
CREATE POLICY "Authenticated can view active pulses"
  ON public.monthly_pulses FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "HR/Admin can insert pulses"
  ON public.monthly_pulses FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "HR/Admin can update pulses"
  ON public.monthly_pulses FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "HR/Admin can delete pulses"
  ON public.monthly_pulses FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- monthly_pulse_reads policies
CREATE POLICY "Users can view their own pulse reads"
  ON public.monthly_pulse_reads FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own pulse reads"
  ON public.monthly_pulse_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('monthly-pulses', 'monthly-pulses', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "HR/Admin can upload monthly pulses"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'monthly-pulses'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  );

CREATE POLICY "HR/Admin can update monthly pulse files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'monthly-pulses'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  );

CREATE POLICY "HR/Admin can delete monthly pulse files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'monthly-pulses'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  );

CREATE POLICY "Authenticated can read monthly pulse files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'monthly-pulses');
