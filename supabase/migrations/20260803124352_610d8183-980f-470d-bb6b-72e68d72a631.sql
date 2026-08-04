INSERT INTO public.agent_user_mapping (provider, agent_id, user_id, agent_name, notes, is_active)
VALUES
  ('interakt', 'bc669521-5690-47ad-9301-b24ca3204746', '457fc2d5-9fc5-439a-938e-5b998549b811', 'Musthak M', 'Matched via Contact Hub phone numbers', true),
  ('interakt', 'ccb0a56f-ea4b-424c-a13e-2703472d2779', 'a8050cc3-7d17-44ac-a083-d8023d505331', 'Vishal Saurav', 'Matched via Contact Hub phone numbers', true),
  ('interakt', 'ee399325-0167-42b6-a94d-c80e3d61bfcc', 'b87d4c2a-2687-4ea5-befb-3d216bb2d845', 'Amit Kumar', 'Matched via Contact Hub phone numbers', true)
ON CONFLICT (provider, agent_id) WHERE agent_id IS NOT NULL DO UPDATE
  SET user_id = EXCLUDED.user_id,
      agent_name = EXCLUDED.agent_name,
      is_active = true,
      updated_at = now();

UPDATE public.interakt_leads l
SET sales_person_id = m.user_id,
    sales_person_name = p.name,
    updated_at = now()
FROM public.agent_user_mapping m
JOIN public.profiles p ON p.user_id = m.user_id
WHERE m.provider = 'interakt'
  AND m.is_active
  AND m.agent_id IN ('bc669521-5690-47ad-9301-b24ca3204746','ccb0a56f-ea4b-424c-a13e-2703472d2779','ee399325-0167-42b6-a94d-c80e3d61bfcc')
  AND l.interakt_traits->>'_internal_contact_owner_id' = m.agent_id
  AND l.sales_person_id IS NULL;