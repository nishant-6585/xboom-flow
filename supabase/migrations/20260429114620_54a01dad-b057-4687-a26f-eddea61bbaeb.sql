ALTER TABLE public.company_contacts
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;