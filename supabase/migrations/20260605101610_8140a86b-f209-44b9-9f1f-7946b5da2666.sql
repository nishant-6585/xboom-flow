
-- Restrict sales delete to rejected-only
DROP POLICY IF EXISTS "Sales can delete own pending or rejected payment records" ON public.payment_records;

CREATE POLICY "Sales can delete own rejected payment records"
ON public.payment_records
FOR DELETE
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND submitted_by = auth.uid()
  AND status = 'rejected'::text
);

-- Audit log table for payment record deletions
CREATE TABLE public.payment_records_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_id uuid NOT NULL,
  order_id uuid,
  amount numeric,
  status text,
  payment_mode text,
  reference_number text,
  payment_date date,
  notes text,
  screenshot_url text,
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  original_created_at timestamptz,
  record_snapshot jsonb NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_by_name text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_records_deletion_log TO authenticated;
GRANT ALL ON public.payment_records_deletion_log TO service_role;

ALTER TABLE public.payment_records_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Finance can view deletion log"
ON public.payment_records_deletion_log
FOR SELECT
USING (
  is_user_approved(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role))
);

-- Trigger to capture deletions
CREATE OR REPLACE FUNCTION public.log_payment_record_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.profiles WHERE user_id = v_actor;

  INSERT INTO public.payment_records_deletion_log (
    payment_record_id, order_id, amount, status, payment_mode, reference_number,
    payment_date, notes, screenshot_url, submitted_by, submitted_at,
    reviewed_by, reviewed_at, rejection_reason, original_created_at,
    record_snapshot, deleted_by, deleted_by_name
  ) VALUES (
    OLD.id, OLD.order_id, OLD.amount, OLD.status, OLD.payment_mode, OLD.reference_number,
    OLD.payment_date, OLD.notes, OLD.screenshot_url, OLD.submitted_by, OLD.submitted_at,
    OLD.reviewed_by, OLD.reviewed_at, OLD.rejection_reason, OLD.created_at,
    to_jsonb(OLD), COALESCE(v_actor, OLD.submitted_by), v_name
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment_record_deletion ON public.payment_records;
CREATE TRIGGER trg_log_payment_record_deletion
BEFORE DELETE ON public.payment_records
FOR EACH ROW
EXECUTE FUNCTION public.log_payment_record_deletion();
