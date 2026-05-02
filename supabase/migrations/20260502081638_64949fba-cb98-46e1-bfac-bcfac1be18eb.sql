
-- Trigger function: notify edge function when website orders change in
-- ways the customer should hear about.
CREATE OR REPLACE FUNCTION public.notify_website_order_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event TEXT := NULL;
  v_url TEXT;
  v_secret TEXT;
BEGIN
  IF COALESCE(NEW.source, 'manual') <> 'website' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := 'order_received';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Tracking added/changed (OR over both fields)
    IF (COALESCE(NEW.tracking_number,'') <> COALESCE(OLD.tracking_number,''))
       OR (COALESCE(NEW.tracking_url,'')    <> COALESCE(OLD.tracking_url,''))
    THEN
      v_event := 'tracking_update';
    -- Status lifecycle changes
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := 'status_update';
    ELSIF NEW.actual_delivery IS DISTINCT FROM OLD.actual_delivery
          AND NEW.actual_delivery IS NOT NULL THEN
      v_event := 'delivered';
    ELSIF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
          AND NEW.cancelled_at IS NOT NULL THEN
      v_event := 'cancelled';
    ELSIF NEW.refund_status IS DISTINCT FROM OLD.refund_status
          AND NEW.refund_status = 'refunded' THEN
      v_event := 'refunded';
    END IF;
  END IF;

  IF v_event IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't try to email if we have no recipient
  IF NEW.customer_email IS NULL OR NEW.customer_email = '' THEN
    RETURN NEW;
  END IF;

  -- Pull endpoint + cron secret from vault (best effort)
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  v_url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/send-website-order-email';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'order_id', NEW.id,
      'event', v_event,
      'customer_email', NEW.customer_email,
      'customer_name', NEW.customer_name,
      'order_number', NEW.order_number,
      'product_name', NEW.product_name,
      'total', NEW.total_sales_amount,
      'status', NEW.status,
      'tracking_number', NEW.tracking_number,
      'tracking_url', NEW.tracking_url,
      'external_id', NEW.external_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_orders_email_notify ON public.orders;
CREATE TRIGGER website_orders_email_notify
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_website_order_email();
