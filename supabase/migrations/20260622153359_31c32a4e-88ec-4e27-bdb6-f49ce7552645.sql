-- Audit log table for website-order claim attempts and manager decisions.
-- Stores structured, non-PII events for troubleshooting.
CREATE TABLE IF NOT EXISTS public.claim_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'search',
    'search_no_results',
    'claim_attempt',
    'claim_submitted',
    'claim_failed',
    'manager_decision'
  )),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  order_id uuid,
  request_id uuid,
  outcome text,           -- e.g. approved | rejected | error | pending | ok
  reason_code text,       -- preset reason key, never custom free text
  error_code text,        -- short code for failures
  query_length int,       -- length only, never the raw query
  query_kind text,        -- 'order_number' | 'phone' | 'email' | 'unknown'
  result_count int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_audit_log_created_at ON public.claim_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_audit_log_actor ON public.claim_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_audit_log_order ON public.claim_audit_log (order_id);

GRANT INSERT ON public.claim_audit_log TO authenticated;
GRANT ALL ON public.claim_audit_log TO service_role;

ALTER TABLE public.claim_audit_log ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may write their own audit row (actor_id must match).
CREATE POLICY "Users insert their own claim audit rows"
  ON public.claim_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Only admins may read the audit trail.
CREATE POLICY "Admins read claim audit"
  ON public.claim_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
