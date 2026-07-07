-- Defense-in-depth: DB-level idempotency for attendance nudges.
-- Even if cron double-fires or app-level dedup fails, only one attendance_nudge per user per UTC day can be inserted.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_attendance_nudge_unique_per_day
  ON public.notifications (user_id, ((timezone('UTC', created_at))::date))
  WHERE type = 'attendance_nudge' AND user_id IS NOT NULL;