DROP POLICY IF EXISTS "portal_tickets: internal staff full" ON public.portal_tickets;
DROP POLICY IF EXISTS "portal_tickets: support admin full" ON public.portal_tickets;
CREATE POLICY "portal_tickets: support admin full"
ON public.portal_tickets
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'support'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'support'::public.app_role)
);

DROP POLICY IF EXISTS "portal_tickets: service request staff manage" ON public.portal_tickets;
CREATE POLICY "portal_tickets: service request staff manage"
ON public.portal_tickets
FOR ALL
TO authenticated
USING (
  ticket_type = 'service_request'
  AND (
    public.has_role(auth.uid(), 'supply_chain'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
  )
)
WITH CHECK (
  ticket_type = 'service_request'
  AND (
    public.has_role(auth.uid(), 'supply_chain'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
  )
);

DROP POLICY IF EXISTS "portal_messages: internal full" ON public.portal_ticket_messages;
DROP POLICY IF EXISTS "portal_messages: internal staff full" ON public.portal_ticket_messages;
CREATE POLICY "portal_messages: internal ticket staff manage"
ON public.portal_ticket_messages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.portal_tickets t
    LEFT JOIN public.portal_accounts a ON a.id = t.account_id
    WHERE t.id = portal_ticket_messages.ticket_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'support'::public.app_role)
        OR (
          (public.has_role(auth.uid(), 'sales'::public.app_role) OR public.has_role(auth.uid(), 'sales_manager'::public.app_role))
          AND a.assigned_rep_id = auth.uid()
        )
        OR (
          t.ticket_type = 'service_request'
          AND (
            public.has_role(auth.uid(), 'supply_chain'::public.app_role)
            OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.portal_tickets t
    LEFT JOIN public.portal_accounts a ON a.id = t.account_id
    WHERE t.id = portal_ticket_messages.ticket_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'support'::public.app_role)
        OR (
          (public.has_role(auth.uid(), 'sales'::public.app_role) OR public.has_role(auth.uid(), 'sales_manager'::public.app_role))
          AND a.assigned_rep_id = auth.uid()
        )
        OR (
          t.ticket_type = 'service_request'
          AND (
            public.has_role(auth.uid(), 'supply_chain'::public.app_role)
            OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
          )
        )
      )
  )
);