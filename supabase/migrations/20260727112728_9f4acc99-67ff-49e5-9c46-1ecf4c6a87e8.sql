CREATE OR REPLACE FUNCTION public.is_internal_staff(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role <> 'b2b_customer'::public.app_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_internal_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_internal_staff(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Approved staff can read birthday songs" ON public.birthday_songs;
CREATE POLICY "Approved staff can read birthday songs"
  ON public.birthday_songs FOR SELECT
  TO authenticated
  USING (
    public.is_user_approved(auth.uid())
    AND public.is_internal_staff(auth.uid())
  );

DROP POLICY IF EXISTS "birthday-songs: staff play on birthday" ON storage.objects;
CREATE POLICY "birthday-songs: staff play on birthday"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'birthday-songs'
  AND public.is_user_approved(auth.uid())
  AND public.is_internal_staff(auth.uid())
  AND public.is_birthday_today(((storage.foldername(name))[1])::uuid)
);