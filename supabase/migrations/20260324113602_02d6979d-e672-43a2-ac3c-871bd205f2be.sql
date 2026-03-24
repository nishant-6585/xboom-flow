
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS end_time TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS assigned_agent_name TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS assigned_agent_phone TEXT;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS full_number TEXT;
