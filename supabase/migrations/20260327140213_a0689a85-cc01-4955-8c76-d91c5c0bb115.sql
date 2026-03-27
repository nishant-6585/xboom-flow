
-- AI Auto Rules table
CREATE TABLE public.ai_auto_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'event' CHECK (trigger_type IN ('event', 'cron', 'threshold')),
  condition JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  allowed_roles TEXT[] NOT NULL DEFAULT ARRAY['admin'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI Policies table
CREATE TABLE public.ai_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL,
  allowed_actions TEXT[] NOT NULL DEFAULT '{}',
  blocked_actions TEXT[] NOT NULL DEFAULT '{}',
  amount_threshold NUMERIC DEFAULT NULL,
  time_restriction_start TIME DEFAULT NULL,
  time_restriction_end TIME DEFAULT NULL,
  requires_approval_above NUMERIC DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI Action Queue table
CREATE TABLE public.ai_action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.ai_auto_rules(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executing', 'executed', 'failed', 'rejected', 'cancelled')),
  risk_level TEXT NOT NULL DEFAULT 'low',
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 1,
  triggered_by TEXT NOT NULL DEFAULT 'system',
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI Learning Logs table
CREATE TABLE public.ai_learning_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  suggestion_type TEXT NOT NULL,
  suggestion_payload JSONB NOT NULL DEFAULT '{}',
  user_response TEXT NOT NULL CHECK (user_response IN ('accepted', 'rejected', 'ignored', 'modified')),
  execution_result TEXT,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_auto_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learning_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Admin-only for rules and policies
CREATE POLICY "Admins can manage auto rules" ON public.ai_auto_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage policies" ON public.ai_policies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Users see own queue items, admins see all
CREATE POLICY "Users see own queue or admins see all" ON public.ai_action_queue
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "System and admins can insert queue" ON public.ai_action_queue
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update queue" ON public.ai_action_queue
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- RLS: Learning logs
CREATE POLICY "Users see own learning logs" ON public.ai_learning_logs
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );
