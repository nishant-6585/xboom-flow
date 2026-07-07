ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_pic_prompt_dismissed_at TIMESTAMPTZ;