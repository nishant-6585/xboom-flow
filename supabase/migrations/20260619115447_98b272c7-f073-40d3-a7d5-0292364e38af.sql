
CREATE TYPE public.security_finding_status AS ENUM ('open', 'fixed', 'ignored', 'wontfix');

CREATE TABLE public.security_findings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner_name TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  internal_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  severity TEXT,
  status public.security_finding_status NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  migration_ref TEXT,
  commit_ref TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scanner_name, internal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_findings_ledger TO authenticated;
GRANT ALL ON public.security_findings_ledger TO service_role;

ALTER TABLE public.security_findings_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view security findings ledger"
ON public.security_findings_ledger FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert security findings ledger"
ON public.security_findings_ledger FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update security findings ledger"
ON public.security_findings_ledger FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete security findings ledger"
ON public.security_findings_ledger FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_security_findings_ledger_status ON public.security_findings_ledger(status);
CREATE INDEX idx_security_findings_ledger_scanner ON public.security_findings_ledger(scanner_name);

CREATE TRIGGER trg_security_findings_ledger_updated_at
BEFORE UPDATE ON public.security_findings_ledger
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the three findings from this session
INSERT INTO public.security_findings_ledger
  (scanner_name, finding_id, internal_id, name, description, severity, status, resolution_note, resolved_at, migration_ref)
VALUES
  ('supabase_lov', 'EXPOSED_SENSITIVE_DATA', 'invoice_email_log_open_select',
   'All invoice email logs are readable by every authenticated user',
   'SELECT policy used USING(true), exposing customer emails and invoice metadata to all authenticated users including portal b2b_customer.',
   'error', 'fixed',
   'Replaced permissive SELECT policy with role-gated policy (admin, finance, supply_chain, sales_manager).',
   now(), '20260619115113_restrict_invoice_email_proforma_audit'),
  ('supabase_lov', 'EXPOSED_SENSITIVE_DATA', 'proforma_rule_audit_open_select',
   'Full proforma audit snapshots readable by every authenticated user',
   'SELECT policy used USING(true), exposing before/after snapshot JSONB with pricing, customer details, margins.',
   'error', 'fixed',
   'Replaced permissive SELECT policy with role-gated policy matching INSERT policy (admin, finance, supply_chain, sales_manager).',
   now(), '20260619115113_restrict_invoice_email_proforma_audit'),
  ('trust_surface', 'missing_trust_surface_page', 'missing_trust_surface_page',
   'Add a trust page',
   'No customer-facing trust, security, or privacy page was detected.',
   'info', 'wontfix',
   'Internal ERP/CRM — no external customer trust page required.',
   now(), NULL);
