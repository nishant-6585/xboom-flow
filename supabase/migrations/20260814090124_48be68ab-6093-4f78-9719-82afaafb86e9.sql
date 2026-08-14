ALTER TABLE public.manychat_leads REPLICA IDENTITY FULL;
ALTER TABLE public.manychat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.manychat_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.manychat_messages;