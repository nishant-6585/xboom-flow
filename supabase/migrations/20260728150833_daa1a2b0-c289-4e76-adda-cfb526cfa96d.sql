
CREATE OR REPLACE FUNCTION public.list_portal_ticket_reads(_ticket_ids uuid[])
RETURNS TABLE (
  ticket_id uuid,
  user_id uuid,
  display_name text,
  email text,
  last_read_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_internal_staff(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.ticket_id,
         r.user_id,
         COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(p.email), ''), 'Team member') AS display_name,
         p.email,
         r.last_read_at
    FROM public.portal_ticket_reads r
    LEFT JOIN public.profiles p ON p.id = r.user_id
   WHERE r.ticket_id = ANY(_ticket_ids)
   ORDER BY r.last_read_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_reads(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_reads(uuid[]) TO authenticated;
