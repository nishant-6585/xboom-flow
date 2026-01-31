-- Create enum for notice visibility
CREATE TYPE public.notice_visibility AS ENUM ('all', 'sales', 'supply_chain', 'finance', 'admin');

-- Create notices table
CREATE TABLE public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  visibility notice_visibility[] NOT NULL DEFAULT '{all}',
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create notice_reads table to track who has read which notice
CREATE TABLE public.notice_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID REFERENCES public.notices(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notice_id, user_id)
);

-- Enable RLS
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_reads ENABLE ROW LEVEL SECURITY;

-- Function to check if user can see notice based on visibility
CREATE OR REPLACE FUNCTION public.can_view_notice(_user_id UUID, _visibility notice_visibility[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    'all' = ANY(_visibility)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
      AND ur.role::text = ANY(
        SELECT unnest::text FROM unnest(_visibility)
      )
    )
$$;

-- Notices policies
-- Anyone can view notices targeted to them
CREATE POLICY "Users can view notices targeted to them"
ON public.notices
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND can_view_notice(auth.uid(), visibility)
);

-- Only admins can insert notices
CREATE POLICY "Admins can create notices"
ON public.notices
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Only admins can update notices
CREATE POLICY "Admins can update notices"
ON public.notices
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Only admins can delete notices
CREATE POLICY "Admins can delete notices"
ON public.notices
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Notice reads policies
-- Users can see their own reads
CREATE POLICY "Users can view their own reads"
ON public.notice_reads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can mark notices as read
CREATE POLICY "Users can mark notices as read"
ON public.notice_reads
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Create updated_at trigger
CREATE TRIGGER update_notices_updated_at
BEFORE UPDATE ON public.notices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();