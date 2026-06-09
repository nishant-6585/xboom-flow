
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
    AND (
      -- Pure portal accounts (only b2b_customer) are NOT internal-approved.
      -- If they hold ANY other role, they're internal staff and remain approved.
      NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'b2b_customer'::app_role
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'b2b_customer'::app_role
      )
    )
$function$;
