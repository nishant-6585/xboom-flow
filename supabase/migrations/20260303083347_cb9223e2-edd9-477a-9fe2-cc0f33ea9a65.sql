
-- Add new columns to meetings table for calendar support
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team';

-- Backfill title from agenda or meeting_type for existing meetings
UPDATE public.meetings
SET title = COALESCE(
  NULLIF(TRIM(LEFT(agenda, 80)), ''),
  INITCAP(meeting_type) || ' Meeting'
)
WHERE title IS NULL;

-- Backfill end_datetime = meeting_date + 1 hour for existing
UPDATE public.meetings
SET end_datetime = meeting_date + interval '1 hour'
WHERE end_datetime IS NULL;

-- Add index on meeting date range for calendar queries
CREATE INDEX IF NOT EXISTS idx_meetings_date_range
  ON public.meetings (meeting_date, end_datetime);

-- Create meeting_participants table
CREATE TABLE public.meeting_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  response_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

-- Enable RLS on meeting_participants
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

-- Participants: authenticated users can read participants for meetings they can see
CREATE POLICY "Authenticated users can view meeting participants"
  ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
      AND (
        m.visibility = 'team'
        OR m.owner_id = auth.uid()
        OR m.host_id = auth.uid()
        OR auth.uid()::text = ANY(m.participants)
        OR public.is_hr_or_admin(auth.uid())
      )
    )
  );

-- Participants: host/owner/admin can insert
CREATE POLICY "Host or owner can add participants"
  ON public.meeting_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
      AND (m.owner_id = auth.uid() OR m.host_id = auth.uid() OR public.is_hr_or_admin(auth.uid()))
    )
  );

-- Participants: host/owner/admin can delete
CREATE POLICY "Host or owner can remove participants"
  ON public.meeting_participants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
      AND (m.owner_id = auth.uid() OR m.host_id = auth.uid() OR public.is_hr_or_admin(auth.uid()))
    )
  );

-- Participants: user can update own response_status
CREATE POLICY "User can update own response"
  ON public.meeting_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Backfill meeting_participants from existing participants array
INSERT INTO public.meeting_participants (meeting_id, user_id, response_status)
SELECT m.id, unnest(m.participants)::uuid, 'accepted'
FROM public.meetings m
WHERE m.participants IS NOT NULL AND array_length(m.participants, 1) > 0
ON CONFLICT (meeting_id, user_id) DO NOTHING;

-- Enable realtime for meeting_participants
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
