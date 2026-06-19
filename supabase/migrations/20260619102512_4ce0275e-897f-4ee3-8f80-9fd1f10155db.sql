
CREATE TABLE public.proforma_rule_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT,
  order_id UUID,
  woocommerce_order_id UUID,
  action TEXT NOT NULL,
  triggered_by UUID NOT NULL,
  triggered_by_name TEXT,
  line_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_snapshot JSONB,
  after_snapshot JSONB,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proforma_rule_audit_order_number ON public.proforma_rule_audit (order_number);
CREATE INDEX idx_proforma_rule_audit_created_at ON public.proforma_rule_audit (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.proforma_rule_audit TO authenticated;
GRANT ALL ON public.proforma_rule_audit TO service_role;

ALTER TABLE public.proforma_rule_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view proforma rule audit"
  ON public.proforma_rule_audit FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert their own rule audit"
  ON public.proforma_rule_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = triggered_by);

CREATE POLICY "Admin/finance can update for rollback"
  ON public.proforma_rule_audit FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));
