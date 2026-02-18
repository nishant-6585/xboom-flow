-- Create attendance_notifications_log for nudge deduplication
CREATE TABLE public.attendance_notifications_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('late_nudge', 'break_nudge')),
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- unique: one nudge per user per type per day
  UNIQUE (user_id, date, type)
);

-- Enable RLS
ALTER TABLE public.attendance_notifications_log ENABLE ROW LEVEL SECURITY;

-- Employees can only see their own nudge logs (for badge indicator)
CREATE POLICY "Employees view own nudge logs"
  ON public.attendance_notifications_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role / edge function (anon bypass via service key) can insert
-- We use a security-definer function approach: allow insert from authenticated service calls
CREATE POLICY "HR and admin can view all nudge logs"
  ON public.attendance_notifications_log
  FOR SELECT
  USING (public.is_hr_or_admin(auth.uid()));

-- Allow insert for authenticated (edge function uses service key, bypasses RLS anyway)
-- We add this for any direct insert path
CREATE POLICY "Service can insert nudge logs"
  ON public.attendance_notifications_log
  FOR INSERT
  WITH CHECK (true);

-- Also ensure the notifications table has a user_id column for targeted nudges.
-- Check if user_id column already exists; add it if not.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN user_id UUID NULL;
    COMMENT ON COLUMN public.notifications.user_id IS 'If set, notification is private to this user only';
  END IF;
END$$;
