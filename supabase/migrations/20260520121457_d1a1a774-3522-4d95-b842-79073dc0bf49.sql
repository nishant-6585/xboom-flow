UPDATE public.notification_templates
SET variables = '["customer_name","amount","order_number"]'::jsonb
WHERE provider = 'msg91' AND event_type = 'payment_received';