-- Tighten insert policy: edge function uses service_role (bypasses RLS),
-- drop permissive WITH CHECK (true) insert policy
DROP POLICY IF EXISTS "Service can insert nudge logs" ON public.attendance_notifications_log;

-- Edge function (service_role) bypasses RLS — no INSERT policy needed for anon/authenticated at all.
-- If we ever need client-side insert, it should be limited strictly:
-- (No client-side insert is needed for nudge logs)
