DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('01e8aeb7-4bf5-4424-9e06-b8ec56fa0a54', '1f346b51-dda2-4ac0-b545-ccf825f2dc27'::uuid, 'Narasimha S'),
      ('3e28972a-7258-43fd-bde2-d44deecc1285', '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid, 'Manoj Kumar'),
      ('99651a83-6bf8-4088-92fc-0349c7f1d57d', '01f14df0-45f1-4bf9-9194-5ed4750e94f8'::uuid, 'Srishti Suman')
    ) AS v(agent_id, user_id, agent_name)
  LOOP
    UPDATE public.agent_user_mapping
       SET user_id = r.user_id,
           agent_name = r.agent_name,
           is_active = true,
           notes = 'Matched via Contact Hub phone numbers',
           updated_at = now()
     WHERE provider = 'interakt' AND agent_id = r.agent_id;
    IF NOT FOUND THEN
      INSERT INTO public.agent_user_mapping (provider, agent_id, user_id, agent_name, is_active, notes)
      VALUES ('interakt', r.agent_id, r.user_id, r.agent_name, true, 'Matched via Contact Hub phone numbers');
    END IF;
  END LOOP;
END $$;