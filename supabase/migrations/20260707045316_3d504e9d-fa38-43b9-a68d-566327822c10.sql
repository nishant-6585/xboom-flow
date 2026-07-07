
-- Guard: portal_orders sensitive updates
CREATE OR REPLACE FUNCTION public.guard_portal_orders_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged := public.has_role(uid, 'admin')
                OR public.has_role(uid, 'supply_chain');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.current_state       IS DISTINCT FROM OLD.current_state
  OR NEW.subtotal            IS DISTINCT FROM OLD.subtotal
  OR NEW.discount_amount     IS DISTINCT FROM OLD.discount_amount
  OR NEW.discount_reason     IS DISTINCT FROM OLD.discount_reason
  OR NEW.gst_amount          IS DISTINCT FROM OLD.gst_amount
  OR NEW.total               IS DISTINCT FROM OLD.total
  OR NEW.payment_terms       IS DISTINCT FROM OLD.payment_terms
  OR NEW.delivery_commitment IS DISTINCT FROM OLD.delivery_commitment
  OR NEW.customer_facing_eta IS DISTINCT FROM OLD.customer_facing_eta
  OR NEW.courier_name        IS DISTINCT FROM OLD.courier_name
  OR NEW.awb_number          IS DISTINCT FROM OLD.awb_number
  OR NEW.tracking_url        IS DISTINCT FROM OLD.tracking_url
  OR NEW.daas_tier           IS DISTINCT FROM OLD.daas_tier
  OR NEW.daas_expires_at     IS DISTINCT FROM OLD.daas_expires_at
  OR NEW.amc_expires_at      IS DISTINCT FROM OLD.amc_expires_at
  OR NEW.portal_visible      IS DISTINCT FROM OLD.portal_visible
  OR NEW.account_id          IS DISTINCT FROM OLD.account_id
  OR NEW.assigned_rep_id     IS DISTINCT FROM OLD.assigned_rep_id
  OR NEW.order_number        IS DISTINCT FROM OLD.order_number
  THEN
    RAISE EXCEPTION 'Only admin or supply_chain can modify financial, state, tracking, or assignment fields on portal_orders. Use the portal_state_transitions workflow.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_portal_orders_sensitive_updates ON public.portal_orders;
CREATE TRIGGER trg_guard_portal_orders_sensitive_updates
BEFORE UPDATE ON public.portal_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_portal_orders_sensitive_updates();


-- Guard: portal_accounts KYC self-approval
CREATE OR REPLACE FUNCTION public.guard_portal_accounts_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_reviewer boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_reviewer := public.has_role(uid, 'admin')
              OR public.has_role(uid, 'finance');

  IF is_reviewer THEN
    RETURN NEW;
  END IF;

  IF NEW.kyc_status           IS DISTINCT FROM OLD.kyc_status
  OR NEW.kyc_reviewed_by      IS DISTINCT FROM OLD.kyc_reviewed_by
  OR NEW.kyc_reviewed_at      IS DISTINCT FROM OLD.kyc_reviewed_at
  OR NEW.kyc_rejection_reason IS DISTINCT FROM OLD.kyc_rejection_reason
  OR NEW.aadhaar_last4        IS DISTINCT FROM OLD.aadhaar_last4
  OR NEW.assigned_rep_id      IS DISTINCT FROM OLD.assigned_rep_id
  THEN
    RAISE EXCEPTION 'Only admin or finance can modify KYC review fields or reassign portal_accounts.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_portal_accounts_sensitive_updates ON public.portal_accounts;
CREATE TRIGGER trg_guard_portal_accounts_sensitive_updates
BEFORE UPDATE ON public.portal_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_portal_accounts_sensitive_updates();
