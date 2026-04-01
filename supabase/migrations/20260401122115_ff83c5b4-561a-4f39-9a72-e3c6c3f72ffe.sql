
-- Add ai_resolution_status to tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ai_resolution_status text DEFAULT NULL;

-- Add ai_generated and comment_type to ticket_comments
ALTER TABLE public.ticket_comments ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false;
ALTER TABLE public.ticket_comments ADD COLUMN IF NOT EXISTS comment_type text DEFAULT 'user';

-- Create ticket_ai_resolutions table
CREATE TABLE public.ticket_ai_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  resolution_plan text,
  lovable_prompt text,
  confidence_score integer,
  resolution_type text,
  estimated_complexity text,
  root_cause text,
  resolution_comment text,
  needs_human_review boolean DEFAULT true,
  review_reason text,
  approval_status text DEFAULT 'pending',
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  rejection_reason text,
  applied_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create ticket_notifications table
CREATE TABLE public.ticket_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ticket_ai_resolutions_ticket_id ON public.ticket_ai_resolutions(ticket_id);
CREATE INDEX idx_ticket_notifications_user_id ON public.ticket_notifications(user_id);
CREATE INDEX idx_ticket_notifications_read ON public.ticket_notifications(user_id, read);

-- Enable RLS
ALTER TABLE public.ticket_ai_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_notifications ENABLE ROW LEVEL SECURITY;

-- RLS: ticket_ai_resolutions
-- Admin/HR can read all
CREATE POLICY "admin_hr_read_resolutions" ON public.ticket_ai_resolutions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  );

-- Assignee and reporter can read their ticket's resolutions
CREATE POLICY "ticket_participants_read_resolutions" ON public.ticket_ai_resolutions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_ai_resolutions.ticket_id
      AND (t.assigned_to = auth.uid() OR t.raised_by = auth.uid())
    )
  );

-- RLS: ticket_notifications
-- Users can only read their own notifications
CREATE POLICY "users_read_own_notifications" ON public.ticket_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "users_update_own_notifications" ON public.ticket_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
