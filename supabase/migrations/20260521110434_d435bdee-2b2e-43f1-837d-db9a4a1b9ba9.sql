
CREATE OR REPLACE FUNCTION public.can_access_ticket_attachment(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE _name = ANY(t.attachment_urls)
      AND (
        t.raised_by = _user_id
        OR t.assigned_to = _user_id
        OR public.has_role(_user_id, 'admin'::app_role)
        OR public.has_role(_user_id, t.assigned_department)
      )
  ) OR EXISTS (
    SELECT 1 FROM public.ticket_comments c
    JOIN public.tickets t ON t.id = c.ticket_id
    WHERE _name = ANY(c.attachment_urls)
      AND (
        t.raised_by = _user_id
        OR t.assigned_to = _user_id
        OR public.has_role(_user_id, 'admin'::app_role)
        OR public.has_role(_user_id, t.assigned_department)
      )
  );
$$;

DROP POLICY IF EXISTS "Users can view ticket attachments" ON storage.objects;

CREATE POLICY "Users can view ticket attachments they have access to"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_ticket_attachment(auth.uid(), name)
  )
);
