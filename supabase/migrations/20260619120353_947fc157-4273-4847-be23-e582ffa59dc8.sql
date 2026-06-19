
ALTER TABLE public.proforma_rule_audit
  ADD COLUMN IF NOT EXISTS rules_version text;

UPDATE public.proforma_rule_audit
SET rules_version = COALESCE(
  rules_version,
  NULLIF(line_changes->>'rules_version', ''),
  NULLIF(after_snapshot->>'rules_version', ''),
  NULLIF(before_snapshot->>'rules_version', '')
)
WHERE rules_version IS NULL;

CREATE INDEX IF NOT EXISTS idx_proforma_rule_audit_rules_version
  ON public.proforma_rule_audit (rules_version);
CREATE INDEX IF NOT EXISTS idx_proforma_rule_audit_triggered_by
  ON public.proforma_rule_audit (triggered_by);
CREATE INDEX IF NOT EXISTS idx_proforma_rule_audit_action
  ON public.proforma_rule_audit (action);
CREATE INDEX IF NOT EXISTS idx_proforma_rule_audit_created_at
  ON public.proforma_rule_audit (created_at DESC);
