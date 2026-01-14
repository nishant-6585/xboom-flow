-- Add timer and stage tracking columns to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_status TEXT DEFAULT 'stopped' CHECK (timer_status IN ('stopped', 'running', 'paused')),
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'new' CHECK (stage IN ('new', 'started', 'in_review', 'on_hold', 'completed'));

-- Update existing tasks to sync stage with status
UPDATE public.tasks 
SET stage = CASE 
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'in_progress' THEN 'started'
  WHEN status = 'awaiting_approval' THEN 'in_review'
  ELSE 'new'
END
WHERE stage IS NULL OR stage = 'new';