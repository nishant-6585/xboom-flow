-- Live updates for the ManyChat leads table and per-lead message timeline:
-- new webhook-captured leads/messages appear without a manual refresh.
ALTER PUBLICATION supabase_realtime ADD TABLE public.manychat_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.manychat_messages;
