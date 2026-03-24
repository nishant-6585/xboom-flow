
ALTER TABLE public.daily_flow_templates ADD COLUMN frequency text NOT NULL DEFAULT 'daily';
ALTER TABLE public.daily_flow_templates ADD COLUMN frequency_days text[] DEFAULT NULL;

ALTER TABLE public.daily_flow_entries ADD COLUMN frequency text DEFAULT 'daily';
ALTER TABLE public.daily_flow_entries ADD COLUMN frequency_days text[] DEFAULT NULL;
