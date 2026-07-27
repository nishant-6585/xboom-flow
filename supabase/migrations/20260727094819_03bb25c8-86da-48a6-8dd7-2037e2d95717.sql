
-- 1) Safe status RPC for gmail_integrations (no token columns exposed)
CREATE OR REPLACE FUNCTION public.get_gmail_integrations_status()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  is_active boolean,
  last_synced_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.user_id, g.email, g.is_active, g.last_synced_at, g.created_at, g.updated_at
  FROM public.gmail_integrations g
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'sales_manager'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_gmail_integrations_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gmail_integrations_status() TO authenticated;

-- 2) Tighten quote_risk_flags INSERT to require ownership of the referenced quote
DROP POLICY IF EXISTS "Approved users can insert unapproved quote risk flags" ON public.quote_risk_flags;

CREATE POLICY "Quote owner or privileged roles can insert risk flags"
ON public.quote_risk_flags
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid())
  AND requires_approval = true
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND risk_level = ANY (ARRAY['warning'::text, 'danger'::text])
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_risk_flags.quote_id
        AND q.created_by = auth.uid()
    )
  )
);
