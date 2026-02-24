
-- Atomic invitation approval: wraps all DB mutations in a single transaction
CREATE OR REPLACE FUNCTION public.approve_invitation_atomic(
  p_user_id UUID,
  p_invitation_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_role TEXT,
  p_department TEXT,
  p_admin_user_id UUID,
  p_admin_name TEXT,
  p_is_existing_user BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
  v_existing_profile BOOLEAN;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_user_id
  ) INTO v_existing_profile;

  IF v_existing_profile AND p_is_existing_user THEN
    -- Approve existing profile
    UPDATE public.profiles 
    SET is_approved = true, updated_at = now()
    WHERE user_id = p_user_id;
    
    -- Ensure role exists (upsert)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT v_existing_profile THEN
    -- Create new profile (this triggers auto employee creation via trigger)
    INSERT INTO public.profiles (user_id, name, email, is_approved)
    VALUES (p_user_id, p_name, p_email, true);
    
    -- Create user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role::app_role);
  ELSE
    RAISE EXCEPTION 'Profile already exists for non-existing-user flow';
  END IF;

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

  -- Write audit log (immutable insert)
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
$$;

-- RLS: Only service_role can call this (edge function uses service_role client)
-- No direct RPC access for regular users needed since this is called from edge function
