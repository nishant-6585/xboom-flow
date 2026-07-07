
-- 1. kyc_documents: method + provider
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider text;

-- 2. Feature flag
INSERT INTO public.feature_flags (key, enabled)
VALUES ('digilocker_kyc_enabled', false)
ON CONFLICT (key) DO NOTHING;

-- 3. Extend auto-confirm trigger to also fire on direct → approved
CREATE OR REPLACE FUNCTION public.auto_confirm_orders_on_kyc_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r RECORD; v_emails text[]; v_sp_is_admin boolean; v_source text;
BEGIN
  IF (NEW.kyc_status = 'pending_verification'
       AND (OLD.kyc_status IS DISTINCT FROM 'pending_verification'))
     OR (NEW.kyc_status = 'approved'
         AND (OLD.kyc_status IS DISTINCT FROM 'approved')
         AND (OLD.kyc_status IS DISTINCT FROM 'pending_verification')) THEN

    v_source := CASE WHEN NEW.kyc_status = 'approved'
                     THEN 'kyc_digilocker'
                     ELSE 'kyc_submission' END;

    SELECT array_agg(lower(email)) INTO v_emails
      FROM public.portal_contacts
     WHERE account_id = NEW.id AND is_active = true AND email IS NOT NULL;
    IF v_emails IS NULL OR array_length(v_emails,1) = 0 THEN
      RETURN NEW;
    END IF;

    FOR r IN
      SELECT o.id, o.order_number, o.sales_person_id, o.customer_name
        FROM public.orders o
       WHERE o.confirmation_status = 'pending'
         AND o.customer_email IS NOT NULL
         AND lower(o.customer_email) = ANY(v_emails)
    LOOP
      UPDATE public.orders
         SET confirmation_status = 'confirmed',
             confirmed_at = now(),
             confirmation_source = v_source
       WHERE id = r.id AND confirmation_status = 'pending';

      v_sp_is_admin := false;
      IF r.sales_person_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, order_id)
        VALUES (r.sales_person_id, 'order_confirmed_by_customer',
          'Order auto-confirmed via KYC: ' || COALESCE(r.order_number, r.id::text),
          COALESCE(r.customer_name,'Customer') || ' completed KYC — order auto-confirmed.',
          r.id);
        v_sp_is_admin := public.has_role(r.sales_person_id, 'admin'::app_role);
      END IF;

      IF NOT v_sp_is_admin THEN
        INSERT INTO public.notifications (target_role, type, title, message, order_id)
        VALUES ('admin', 'order_confirmed_by_customer',
          'Order auto-confirmed via KYC: ' || COALESCE(r.order_number, r.id::text),
          COALESCE(r.customer_name,'Customer') || ' completed KYC — order auto-confirmed.',
          r.id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;
