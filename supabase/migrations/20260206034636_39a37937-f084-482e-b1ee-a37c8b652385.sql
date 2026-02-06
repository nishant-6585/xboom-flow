-- Create user_activity_logs table to track login sessions and app usage
CREATE TABLE public.user_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  session_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  session_end TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  pages_visited INTEGER DEFAULT 0,
  actions_performed INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Admin can view all activity logs
CREATE POLICY "Admins can view all activity logs"
  ON public.user_activity_logs
  FOR SELECT
  USING (
    is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Users can insert their own activity logs
CREATE POLICY "Users can insert own activity logs"
  ON public.user_activity_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Users can update their own activity logs
CREATE POLICY "Users can update own activity logs"
  ON public.user_activity_logs
  FOR UPDATE
  USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Create function to get user activity summary
CREATE OR REPLACE FUNCTION public.get_user_activity_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  total_sessions BIGINT,
  total_usage_minutes BIGINT,
  avg_session_minutes NUMERIC,
  total_pages_visited BIGINT,
  total_actions BIGINT,
  last_active TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ual.user_id,
    MAX(ual.user_name) as user_name,
    COUNT(*)::BIGINT as total_sessions,
    COALESCE(SUM(ual.duration_minutes), 0)::BIGINT as total_usage_minutes,
    ROUND(AVG(ual.duration_minutes)::NUMERIC, 1) as avg_session_minutes,
    COALESCE(SUM(ual.pages_visited), 0)::BIGINT as total_pages_visited,
    COALESCE(SUM(ual.actions_performed), 0)::BIGINT as total_actions,
    MAX(ual.last_activity_at) as last_active
  FROM public.user_activity_logs ual
  WHERE (p_start_date IS NULL OR ual.session_start::date >= p_start_date)
    AND (p_end_date IS NULL OR ual.session_start::date <= p_end_date)
  GROUP BY ual.user_id
  ORDER BY total_usage_minutes DESC;
END;
$$;

-- Create index for faster queries
CREATE INDEX idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX idx_user_activity_logs_session_start ON public.user_activity_logs(session_start);