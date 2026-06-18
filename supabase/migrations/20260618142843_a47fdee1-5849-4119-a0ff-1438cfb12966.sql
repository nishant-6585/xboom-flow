ALTER PUBLICATION supabase_realtime ADD TABLE public.repairs;
ALTER TABLE public.repairs REPLICA IDENTITY FULL;