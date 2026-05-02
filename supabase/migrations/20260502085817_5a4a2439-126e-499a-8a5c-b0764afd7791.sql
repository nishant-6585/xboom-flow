DO $$
DECLARE
  v_new text := encode(gen_random_bytes(32), 'hex');
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_id, v_new, 'CRON_SECRET');
  ELSE
    PERFORM vault.create_secret(v_new, 'CRON_SECRET');
  END IF;
  RAISE NOTICE 'NEW_CRON_SECRET=%', v_new;
END $$;