
-- AI Action Logs table for tracking all AI-triggered actions
CREATE TABLE public.ai_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'executed',
  result JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_action_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own action logs
CREATE POLICY "Users can view own action logs"
  ON public.ai_action_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Insert policy for authenticated users (their own logs)
CREATE POLICY "Users can insert own action logs"
  ON public.ai_action_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Index for fast lookups
CREATE INDEX idx_ai_action_logs_user_id ON public.ai_action_logs(user_id);
CREATE INDEX idx_ai_action_logs_action_type ON public.ai_action_logs(action_type);
CREATE INDEX idx_ai_action_logs_created_at ON public.ai_action_logs(created_at DESC);
