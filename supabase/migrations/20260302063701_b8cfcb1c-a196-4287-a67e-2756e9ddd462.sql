
-- Fix meetings table: replace overly permissive SELECT policy with scoped access
DROP POLICY IF EXISTS "Users can view all meetings" ON public.meetings;

-- Users can view meetings they own, host, or participate in
CREATE POLICY "Users can view their own meetings"
  ON public.meetings FOR SELECT
  TO authenticated
  USING (
    auth.uid() = owner_id OR 
    auth.uid() = host_id OR
    auth.uid()::text = ANY(participants)
  );

-- Admins and HR can view all meetings for oversight
CREATE POLICY "Admins can view all meetings"
  ON public.meetings FOR SELECT
  TO authenticated
  USING (
    public.is_hr_or_admin(auth.uid())
  );

-- Managers can view meetings of their direct reports
CREATE POLICY "Managers can view direct reports meetings"
  ON public.meetings FOR SELECT
  TO authenticated
  USING (
    public.is_reporting_manager(auth.uid(), owner_id)
  );
