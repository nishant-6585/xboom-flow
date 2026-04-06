
-- Fix Bulk Order and Drone Show existing leads
UPDATE public.form_leads
SET assigned_to = '9fea57d6-a27a-4b35-9293-e2151b84f45a',
    assigned_to_name = 'Rohit'
WHERE assigned_to IS NULL
  AND (form_name ILIKE '%bulk%order%' OR form_name ILIKE '%drone%show%');

-- Fix the Contact Us lead that got assigned to Rohit (from wrong ID migration)
UPDATE public.form_leads
SET assigned_to = 'e05f9afe-0160-4956-bb1f-496028386062',
    assigned_to_name = 'Arjav chauhan'
WHERE form_name ILIKE '%contact%us%' AND assigned_to_name = 'Rohit';
