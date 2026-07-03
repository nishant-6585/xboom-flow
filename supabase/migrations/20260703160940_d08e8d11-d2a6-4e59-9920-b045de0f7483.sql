DROP POLICY IF EXISTS "portal_tickets: support admin full" ON public.portal_tickets;
CREATE POLICY "portal_tickets: internal staff full"
ON public.portal_tickets
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'support'::public.app_role)
  OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'support'::public.app_role)
  OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
);

DROP POLICY IF EXISTS "portal_messages: internal full" ON public.portal_ticket_messages;
CREATE POLICY "portal_messages: internal staff full"
ON public.portal_ticket_messages
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'support'::public.app_role)
  OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
  OR public.has_role(auth.uid(), 'sales'::public.app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'support'::public.app_role)
  OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
  OR public.has_role(auth.uid(), 'sales'::public.app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
);