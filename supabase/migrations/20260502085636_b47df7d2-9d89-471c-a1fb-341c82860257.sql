DO $$
DECLARE
  v_secret text;
  v_url text := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/send-website-order-email';
  v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := jsonb_build_object(
      'order_id', gen_random_uuid()::text,
      'event', 'status_update',
      'customer_email', 'nishant.k@xboom.in',
      'customer_name', 'Nishant',
      'order_number', 'TEST-EMAIL-001',
      'product_name', 'Test product',
      'status', 'in_transit',
      'total', 1
    )
  ) INTO v_req_id;

  RAISE NOTICE 'Test email request id: %', v_req_id;
END $$;