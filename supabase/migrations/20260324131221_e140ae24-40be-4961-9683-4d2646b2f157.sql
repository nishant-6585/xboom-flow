ALTER TABLE public.daily_flow_entries ADD COLUMN IF NOT EXISTS task_description TEXT DEFAULT '';
ALTER TABLE public.daily_flow_entries ADD COLUMN IF NOT EXISTS links TEXT[] DEFAULT '{}';