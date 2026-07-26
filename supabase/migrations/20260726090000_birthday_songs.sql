-- Birthday songs: HR uploads (or AI-generates via ElevenLabs) a personalized
-- song per employee. It plays from the dashboard birthday card, but only on
-- the employee's birthday (IST day boundary, matching get_next_birthday()).

-- 1) Table: one active song per employee -------------------------------------
CREATE TABLE IF NOT EXISTS public.birthday_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  title text,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'elevenlabs')),
  generation_prompt text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.birthday_songs TO authenticated;
GRANT ALL ON public.birthday_songs TO service_role;

ALTER TABLE public.birthday_songs ENABLE ROW LEVEL SECURITY;

-- Staff can see that a song exists (drives the play button on the card).
CREATE POLICY "Approved staff can read birthday songs"
  ON public.birthday_songs FOR SELECT
  TO authenticated
  USING (
    public.is_user_approved(auth.uid())
    AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
  );

-- HR and admin manage songs.
CREATE POLICY "HR can manage birthday songs"
  ON public.birthday_songs FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP TRIGGER IF EXISTS trg_birthday_songs_updated_at ON public.birthday_songs;
CREATE TRIGGER trg_birthday_songs_updated_at
BEFORE UPDATE ON public.birthday_songs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Helper: is it this employee's birthday today (IST)? ---------------------
-- Mirrors get_next_birthday()'s month/day handling, including Feb-29
-- birthdays falling on Feb-28 in non-leap years.
CREATE OR REPLACE FUNCTION public.is_birthday_today(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e,
         LATERAL (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today) t
    WHERE e.id = p_employee_id
      AND e.is_active = true
      AND e.date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM e.date_of_birth) = EXTRACT(MONTH FROM t.today)
      AND EXTRACT(DAY FROM t.today) = LEAST(
        EXTRACT(DAY FROM e.date_of_birth),
        EXTRACT(DAY FROM (date_trunc('month', t.today) + interval '1 month - 1 day'))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_birthday_today(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_birthday_today(uuid) TO authenticated, service_role;

-- 3) Storage bucket + policies -----------------------------------------------
-- Files live at <employee_id>/<filename> inside a private bucket; playback is
-- via short-lived signed URLs (creating one requires SELECT on the object).
INSERT INTO storage.buckets (id, name, public)
VALUES ('birthday-songs', 'birthday-songs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "birthday-songs: hr manage" ON storage.objects;
CREATE POLICY "birthday-songs: hr manage"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'birthday-songs'
  AND (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'birthday-songs'
  AND (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "birthday-songs: staff play on birthday" ON storage.objects;
CREATE POLICY "birthday-songs: staff play on birthday"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'birthday-songs'
  AND public.is_user_approved(auth.uid())
  AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
  AND public.is_birthday_today(((storage.foldername(name))[1])::uuid)
);
