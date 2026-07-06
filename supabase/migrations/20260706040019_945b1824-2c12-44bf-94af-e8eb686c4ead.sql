
-- Dedupe existing rows: keep earliest per (order_id, type, coalesce(user_id, target_role))
WITH dupes AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY order_id, type, title, message, COALESCE(user_id::text, '') , COALESCE(target_role, '')
           ORDER BY created_at
         ) AS rn
  FROM public.notifications
  WHERE type = 'order_confirmed_by_customer'
)
DELETE FROM public.notifications n USING dupes d
WHERE n.id = d.id AND d.rn > 1;

CREATE OR REPLACE FUNCTION public.auto_confirm_orders_on_kyc_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_emails text[]; v_sp_is_admin boolean;
BEGIN
  IF NEW.kyc_status = 'pending_verification'
     AND (OLD.kyc_status IS DISTINCT FROM 'pending_verification') THEN
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
             confirmation_source = 'kyc_submission'
       WHERE id = r.id AND confirmation_status = 'pending';

      v_sp_is_admin := false;
      IF r.sales_person_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, order_id)
        VALUES (r.sales_person_id, 'order_confirmed_by_customer',
          'Order auto-confirmed via KYC: ' || COALESCE(r.order_number, r.id::text),
          COALESCE(r.customer_name,'Customer') || ' submitted KYC — order auto-confirmed.',
          r.id);
        v_sp_is_admin := public.has_role(r.sales_person_id, 'admin'::app_role);
      END IF;

      -- Skip the admin-role copy if the salesperson is already an admin
      -- (otherwise the same user sees two identical notifications).
      IF NOT v_sp_is_admin THEN
        INSERT INTO public.notifications (target_role, type, title, message, order_id)
        VALUES ('admin', 'order_confirmed_by_customer',
          'Order auto-confirmed via KYC: ' || COALESCE(r.order_number, r.id::text),
          COALESCE(r.customer_name,'Customer') || ' submitted KYC — order auto-confirmed.',
          r.id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
