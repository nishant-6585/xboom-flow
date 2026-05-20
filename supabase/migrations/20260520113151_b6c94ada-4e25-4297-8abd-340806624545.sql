UPDATE public.notification_templates
SET template_id = '6a0d984272c5fc609b0ab1e2'
WHERE provider = 'msg91' AND event_type = 'payment_received';

UPDATE public.notification_templates
SET template_id = '6a0d9899b7ff80a6fb0c8a72'
WHERE provider = 'msg91' AND event_type = 'shipped';

UPDATE public.notification_templates
SET template_id = '6a0d98d738b00ea2560e5fb2'
WHERE provider = 'msg91' AND event_type = 'delivered';

UPDATE public.notification_templates
SET template_id = '6a0d9903c90ba631e50c1bd3'
WHERE provider = 'msg91' AND event_type = 'cancelled';