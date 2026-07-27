-- Birthday cards: HR attaches a photo and a greeting message to each employee,
-- emailed together with the tagged birthday song. Kept separate from
-- birthday_songs so a photo/greeting can exist before (or without) a song.

-- 1) Table: one card per employee ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.birthday_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  photo_path text,
  greeting_message text,
  greeting_source text NOT NULL DEFAULT 'manual' CHECK (greeting_source IN ('manual', 'ai')),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.birthday_cards TO authenticated;
GRANT ALL ON public.birthday_cards TO service_role;

ALTER TABLE public.birthday_cards ENABLE ROW LEVEL SECURITY;

-- Staff can see that a card exists (drives the birthday-card display).
CREATE POLICY "Approved staff can read birthday cards"
  ON public.birthday_cards FOR SELECT
  TO authenticated
  USING (
    public.is_user_approved(auth.uid())
    AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
  );

-- HR and admin manage cards.
CREATE POLICY "HR can manage birthday cards"
  ON public.birthday_cards FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP TRIGGER IF EXISTS trg_birthday_cards_updated_at ON public.birthday_cards;
CREATE TRIGGER trg_birthday_cards_updated_at
BEFORE UPDATE ON public.birthday_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Storage bucket + policies -------------------------------------------------
-- Photos live at <employee_id>/<filename> inside a private bucket, mirroring
-- the birthday-songs bucket: HR manages, staff can view on the birthday.
INSERT INTO storage.buckets (id, name, public)
VALUES ('birthday-cards', 'birthday-cards', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "birthday-cards: hr manage" ON storage.objects;
CREATE POLICY "birthday-cards: hr manage"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'birthday-cards'
  AND (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'birthday-cards'
  AND (
    public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "birthday-cards: staff view on birthday" ON storage.objects;
CREATE POLICY "birthday-cards: staff view on birthday"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'birthday-cards'
  AND public.is_user_approved(auth.uid())
  AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
  AND public.is_birthday_today(((storage.foldername(name))[1])::uuid)
);
