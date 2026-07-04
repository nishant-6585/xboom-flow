
-- 1. Snapshot counts BEFORE purge (logged as NOTICE for the record)
DO $$
DECLARE v_before bigint; v_flood bigint;
BEGIN
  SELECT COUNT(*) INTO v_before FROM pgmq.q_transactional_emails;
  SELECT COUNT(*) INTO v_flood FROM pgmq.q_transactional_emails
   WHERE (message->>'idempotency_key') IN (
     'woo:2901462b-5776-46bc-9ae4-be84ef69cd3d:cancelled:email',
     'woo:60bb090f-4107-4a3d-99d2-bae59d88cac1:cancelled:email'
   );
  RAISE NOTICE 'pgmq before purge: total=% flood=%', v_before, v_flood;
END $$;

-- 2. Delete ALL pgmq messages for the two flood idempotency keys.
--    (Both recipients already received ~99 duplicate cancellation emails;
--     no further sends are needed.)
DELETE FROM pgmq.q_transactional_emails
WHERE (message->>'idempotency_key') IN (
  'woo:2901462b-5776-46bc-9ae4-be84ef69cd3d:cancelled:email',
  'woo:60bb090f-4107-4a3d-99d2-bae59d88cac1:cancelled:email'
);

-- 3. Also purge any *other* transactional-email queue message whose
--    idempotency key already has a `sent` row in email_send_log — the
--    provider would drop them as duplicates anyway but we don't want them
--    consuming queue budget during recovery.
DELETE FROM pgmq.q_transactional_emails q
WHERE EXISTS (
  SELECT 1 FROM public.email_send_log l
  WHERE l.status = 'sent'
    AND l.metadata ? 'idempotency_key'
    AND l.metadata->>'idempotency_key' = q.message->>'idempotency_key'
);

-- 4. Mark the corresponding pending log rows as suppressed so the
--    dashboard doesn't show a permanent 1500-row 'pending' backlog.
UPDATE public.email_send_log
   SET status = 'suppressed',
       error_message = 'purged_webhook_loop_duplicate'
 WHERE status = 'pending'
   AND template_name = 'website-order'
   AND recipient_email IN ('abhishekdixit5522@gmail.com','jyotiraditya1901@gmail.com')
   AND created_at > now() - interval '6 hours';

-- 5. Snapshot counts AFTER purge
DO $$
DECLARE v_after bigint;
BEGIN
  SELECT COUNT(*) INTO v_after FROM pgmq.q_transactional_emails;
  RAISE NOTICE 'pgmq after purge: total=%', v_after;
END $$;

-- 6. Harden the website-order email trigger: only fire cancelled /
--    delivered / refunded when the *state* actually transitions, not
--    every time cancelled_at is re-stamped by a repeat webhook.
CREATE OR REPLACE FUNCTION public.notify_website_order_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event TEXT := NULL;
  v_url   TEXT;
  v_secret TEXT;
BEGIN
  IF NEW.customer_email IS NULL OR NEW.customer_email = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := 'order_received';
  ELSIF TG_OP = 'UPDATE' THEN
    IF (COALESCE(NEW.tracking_number,'') <> COALESCE(OLD.tracking_number,''))
       OR (COALESCE(NEW.tracking_url,'')    <> COALESCE(OLD.tracking_url,''))
       OR (COALESCE(NEW.courier_name,'')    <> COALESCE(OLD.courier_name,''))
    THEN
      v_event := 'tracking_update';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      -- Only email on real status transitions. Repeat webhooks that don't
      -- actually change the status must not re-notify.
      v_event := 'status_update';
    ELSIF NEW.actual_delivery IS DISTINCT FROM OLD.actual_delivery
          AND NEW.actual_delivery IS NOT NULL
          AND OLD.actual_delivery IS NULL THEN
      v_event := 'delivered';
    ELSIF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
          AND NEW.cancelled_at IS NOT NULL
          AND OLD.cancelled_at IS NULL THEN
      -- Only on FIRST cancellation stamp, not re-stamps.
      v_event := 'cancelled';
    ELSIF NEW.refund_status IS DISTINCT FROM OLD.refund_status
          AND NEW.refund_status = 'refunded'
          AND (OLD.refund_status IS NULL OR OLD.refund_status <> 'refunded') THEN
      v_event := 'refunded';
    END IF;
  END IF;

  IF v_event IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_event = 'tracking_update'
     AND (COALESCE(NEW.tracking_number,'') = '' OR COALESCE(NEW.tracking_url,'') = '') THEN
    RETURN NEW;
  END IF;

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
      'order_id',           NEW.id,
      'event',              v_event,
      'customer_email',     NEW.customer_email,
      'customer_name',      NEW.customer_name,
      'order_number',       NEW.order_number,
      'product_name',       NEW.product_name,
      'total',              NEW.total_sales_amount,
      'status',             NEW.status,
      'tracking_number',    NEW.tracking_number,
      'tracking_url',       NEW.tracking_url,
      'courier_name',       NEW.courier_name,
      'estimated_delivery', NEW.estimated_delivery,
      'shipping_address',   NEW.shipping_address,
      'external_id',        NEW.external_id,
      'source',             NEW.source
    )
  );

  RETURN NEW;
END;
$function$;
