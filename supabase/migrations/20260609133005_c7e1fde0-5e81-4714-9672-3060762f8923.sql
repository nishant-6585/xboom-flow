
-- Block portal (b2b_customer) accounts from being treated as "approved internal users".
-- This single change blocks b2b_customer from all tables/policies that gate on is_user_approved().
CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(
      (SELECT is_approved FROM public.profiles WHERE user_id = _user_id),
      false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'b2b_customer'::app_role
    )
$function$;

-- Tighten lead_touch_marks SELECT (was USING true => any authenticated incl. portal).
DROP POLICY IF EXISTS "Auth users can read lead_touch_marks" ON public.lead_touch_marks;
CREATE POLICY "Approved internal users read lead_touch_marks"
ON public.lead_touch_marks
FOR SELECT
TO authenticated
USING (public.is_user_approved(auth.uid()));
