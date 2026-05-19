
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.holiday_type AS ENUM ('national','regional','company','religious','restricted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Rename column date -> holiday_date
ALTER TABLE public.holidays RENAME COLUMN date TO holiday_date;

-- 3. New columns
ALTER TABLE public.holidays
  ADD COLUMN IF NOT EXISTS holiday_type public.holiday_type NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Swap unique constraint: drop unique(date), add unique(holiday_date, name)
ALTER TABLE public.holidays DROP CONSTRAINT IF EXISTS holidays_date_key;
DO $$ BEGIN
  ALTER TABLE public.holidays ADD CONSTRAINT holidays_date_name_key UNIQUE (holiday_date, name);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN unique_violation THEN NULL; END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_holidays_active_date ON public.holidays (holiday_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_holidays_type ON public.holidays (holiday_type);

-- 6. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_holidays_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_holidays_touch ON public.holidays;
CREATE TRIGGER trg_holidays_touch
BEFORE UPDATE ON public.holidays
FOR EACH ROW EXECUTE FUNCTION public.touch_holidays_updated_at();

-- 7. RLS: tighten SELECT to approved users only (replace open authenticated policy)
DROP POLICY IF EXISTS "Authenticated users can view holidays" ON public.holidays;
CREATE POLICY "Approved users can view holidays"
ON public.holidays FOR SELECT
TO authenticated
USING (public.is_user_approved(auth.uid()));
