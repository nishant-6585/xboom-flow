CREATE TABLE public.portal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.portal_contacts(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.portal_orders(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category text NOT NULL DEFAULT 'overall',
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_feedback_account ON public.portal_feedback(account_id);
CREATE INDEX idx_portal_feedback_order ON public.portal_feedback(order_id);

GRANT SELECT, INSERT ON public.portal_feedback TO authenticated;
GRANT ALL ON public.portal_feedback TO service_role;

ALTER TABLE public.portal_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_feedback: customer inserts own" ON public.portal_feedback
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id());

CREATE POLICY "portal_feedback: customer reads own" ON public.portal_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id());

CREATE POLICY "portal_feedback: internal reads" ON public.portal_feedback
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supply_chain')
    OR public.has_role(auth.uid(),'support')
    OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'sales_manager')
  );