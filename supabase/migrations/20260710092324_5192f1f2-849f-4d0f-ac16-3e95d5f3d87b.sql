
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS followup_note text,
  ADD COLUMN IF NOT EXISTS followup_note_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_note_updated_by_name text;

-- Narrow UPDATE policy: sales user may update ONLY their own enquiry rows.
-- Column narrowing is enforced by the trigger below.
DROP POLICY IF EXISTS "Sales can update own enquiry followup" ON public.enquiries;
CREATE POLICY "Sales can update own enquiry followup"
ON public.enquiries
FOR UPDATE
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND public.has_role(auth.uid(), 'sales'::app_role)
  AND sales_person_id = auth.uid()
)
WITH CHECK (
  public.is_user_approved(auth.uid())
  AND public.has_role(auth.uid(), 'sales'::app_role)
  AND sales_person_id = auth.uid()
);

-- Guard trigger: when the actor is (only) sales (i.e. not admin/supply_chain),
-- reject any change to columns other than the three follow-up-note fields.
CREATE OR REPLACE FUNCTION public.guard_enquiries_sales_followup_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
  is_sales boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                OR public.has_role(auth.uid(), 'supply_chain'::app_role)
                OR public.has_role(auth.uid(), 'sales_manager'::app_role);
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  is_sales := public.has_role(auth.uid(), 'sales'::app_role);
  IF NOT is_sales THEN
    RETURN NEW; -- other roles blocked by RLS anyway
  END IF;

  -- For sales-only actors, allow ONLY the three follow-up-note columns to change.
  IF NEW.product_name          IS DISTINCT FROM OLD.product_name
  OR NEW.product_code          IS DISTINCT FROM OLD.product_code
  OR NEW.product_category      IS DISTINCT FROM OLD.product_category
  OR NEW.quantity              IS DISTINCT FROM OLD.quantity
  OR NEW.customer_name         IS DISTINCT FROM OLD.customer_name
  OR NEW.customer_company      IS DISTINCT FROM OLD.customer_company
  OR NEW.sales_person_id       IS DISTINCT FROM OLD.sales_person_id
  OR NEW.sales_person_name     IS DISTINCT FROM OLD.sales_person_name
  OR NEW.urgency               IS DISTINCT FROM OLD.urgency
  OR NEW.notes                 IS DISTINCT FROM OLD.notes
  OR NEW.status                IS DISTINCT FROM OLD.status
  OR NEW.response_pricing      IS DISTINCT FROM OLD.response_pricing
  OR NEW.response_availability IS DISTINCT FROM OLD.response_availability
  OR NEW.response_lead_time    IS DISTINCT FROM OLD.response_lead_time
  OR NEW.response_notes        IS DISTINCT FROM OLD.response_notes
  OR NEW.responded_by          IS DISTINCT FROM OLD.responded_by
  OR NEW.responded_by_name     IS DISTINCT FROM OLD.responded_by_name
  OR NEW.responded_at          IS DISTINCT FROM OLD.responded_at
  OR NEW.is_escalated          IS DISTINCT FROM OLD.is_escalated
  OR NEW.escalated_at          IS DISTINCT FROM OLD.escalated_at
  OR NEW.escalated_by          IS DISTINCT FROM OLD.escalated_by
  OR NEW.escalated_by_name     IS DISTINCT FROM OLD.escalated_by_name
  OR NEW.escalation_reason     IS DISTINCT FROM OLD.escalation_reason
  OR NEW.admin_response        IS DISTINCT FROM OLD.admin_response
  OR NEW.admin_response_by     IS DISTINCT FROM OLD.admin_response_by
  OR NEW.admin_response_by_name IS DISTINCT FROM OLD.admin_response_by_name
  OR NEW.admin_response_at     IS DISTINCT FROM OLD.admin_response_at
  OR NEW.order_outcome         IS DISTINCT FROM OLD.order_outcome
  OR NEW.lost_reason           IS DISTINCT FROM OLD.lost_reason
  OR NEW.lost_reason_notes     IS DISTINCT FROM OLD.lost_reason_notes
  OR NEW.outcome_updated_at    IS DISTINCT FROM OLD.outcome_updated_at
  OR NEW.outcome_updated_by    IS DISTINCT FROM OLD.outcome_updated_by
  OR NEW.lead_source           IS DISTINCT FROM OLD.lead_source
  OR NEW.requested_timeline    IS DISTINCT FROM OLD.requested_timeline
  OR NEW.is_mega_deal          IS DISTINCT FROM OLD.is_mega_deal
  OR NEW.lead_temperature      IS DISTINCT FROM OLD.lead_temperature
  THEN
    RAISE EXCEPTION 'Sales users may only update follow-up note fields on enquiries'
      USING ERRCODE = '42501';
  END IF;

  -- Also ensure they aren't editing someone else's enquiry.
  IF OLD.sales_person_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sales users may only update their own enquiry follow-up note'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_enquiries_sales_followup ON public.enquiries;
CREATE TRIGGER trg_guard_enquiries_sales_followup
BEFORE UPDATE ON public.enquiries
FOR EACH ROW
EXECUTE FUNCTION public.guard_enquiries_sales_followup_only();
