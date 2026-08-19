REVOKE ALL ON FUNCTION public.portal_message_is_from_customer(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_ticket_messages_notify_customer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_tickets_notify_customer_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_ticket_messages_notify_staff() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_portal_notifications_read(uuid[]) FROM anon;