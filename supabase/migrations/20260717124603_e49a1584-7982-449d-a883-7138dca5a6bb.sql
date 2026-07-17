
-- Close "Office Delivery" bypass: when courier indicates self-hand-delivery
-- (Office Delivery, Bus, self pickup, etc.), enforce the same proof-photo
-- requirement as the office_pickup delivery mode, and normalize the mode so
-- the proof appears in the review queue.

CREATE OR REPLACE FUNCTION public.enforce_office_delivery_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_office_courier boolean := false;
BEGIN
  -- Detect couriers that mean "we hand-delivered ourselves" (no third-party tracking).
  IF NEW.courier_name IS NOT NULL AND btrim(NEW.courier_name) <> '' THEN
    is_office_courier := NEW.courier_name ~* '(office\s*deliver|office\s*pickup|self\s*deliver|hand\s*deliver|walk[-\s]?in|showroom|^\s*bus\s*$)';
  END IF;

  -- Normalize delivery_mode so the DeliveryProofCard + admin queue treat it
  -- like an office pickup and reviewers can approve/reject the proof.
  IF is_office_courier AND (NEW.delivery_mode IS DISTINCT FROM 'office_pickup') THEN
    NEW.delivery_mode := 'office_pickup';
  END IF;

  -- Block marking the order Delivered without a proof photo when the delivery
  -- was self / office pickup — regardless of which of the two paths (delivery
  -- mode or courier name) the user took.
  IF NEW.status = 'delivery_done'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND (NEW.delivery_mode = 'office_pickup' OR is_office_courier)
     AND (NEW.delivery_proof_url IS NULL OR btrim(NEW.delivery_proof_url) = '')
  THEN
    RAISE EXCEPTION 'Upload the customer-receiving proof photo before marking this office/self-delivery order as delivered.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_office_delivery_proof ON public.orders;
CREATE TRIGGER trg_enforce_office_delivery_proof
  BEFORE INSERT OR UPDATE OF status, delivery_mode, courier_name, delivery_proof_url
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_office_delivery_proof();
