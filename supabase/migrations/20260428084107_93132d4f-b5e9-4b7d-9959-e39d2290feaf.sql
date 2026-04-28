
DO $$
DECLARE
  new_secret text := encode(gen_random_bytes(32), 'hex');
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_id, new_secret, 'CRON_SECRET', 'Shared secret for scheduled cron jobs');
  ELSE
    PERFORM vault.create_secret(new_secret, 'CRON_SECRET', 'Shared secret for scheduled cron jobs');
  END IF;
  RAISE NOTICE 'NEW_CRON_SECRET=%', new_secret;
END $$;

SELECT decrypted_secret AS cron_secret_to_set_in_project_secrets
FROM vault.decrypted_secrets
WHERE name = 'CRON_SECRET' LIMIT 1;
