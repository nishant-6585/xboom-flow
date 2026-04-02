CREATE OR REPLACE FUNCTION public.approve_invitation_atomic(
  p_user_id uuid,
  p_invitation_id uuid,
  p_name text,
  p_email text,
  p_role text,
  p_department text,
  p_admin_user_id uuid,
  p_admin_name text,
  p_is_existing_user boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
BEGIN
  -- Create or approve profile safely, even if partial user data already exists
  INSERT INTO public.profiles (user_id, name, email, is_approved)
  VALUES (p_user_id, p_name, p_email, true)
  ON CONFLICT (user_id)
  DO UPDATE SET
    is_approved = true,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    updated_at = now();

  -- Ensure role exists without failing on duplicates
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Update employee department if specified
  IF p_department IS NOT NULL AND p_department != '' THEN
    UPDATE public.employees
    SET department = p_department, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Mark invitation as accepted
  UPDATE public.user_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = p_invitation_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already processed (id: %)', p_invitation_id;
  END IF;

  -- Write audit log
  INSERT INTO public.security_audit_log (user_id, user_name, action, target_user_id, details)
  VALUES (
    p_admin_user_id,
    p_admin_name,
    'invitation_approved',
    p_user_id,
    jsonb_build_object(
      'email', p_email,
      'role', p_role,
      'department', p_department,
      'is_existing_user', p_is_existing_user
    )
  );

  result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'is_existing_user', p_is_existing_user
  );

  RETURN result;
END;
$function$;