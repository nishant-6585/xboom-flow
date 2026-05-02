DO $$
DECLARE
  v_secret text;
  v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;

  SELECT net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/send-website-order-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'order_id', gen_random_uuid()::text,
      'event', 'status_update',
      'customer_email', 'nishant.k@xboom.in',
      'customer_name', 'Nishant',
      'order_number', 'TEST-EMAIL-002',
      'product_name', 'Sender pipeline test',
      'status', 'in_transit',
      'total', 1
    )
  ) INTO v_req_id;
  RAISE NOTICE 'Test email request id: %', v_req_id;
END $$;