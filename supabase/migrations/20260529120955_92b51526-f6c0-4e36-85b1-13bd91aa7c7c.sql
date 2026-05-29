-- Manual "mark as touched" overrides for any lead source
CREATE TABLE public.lead_touch_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  marked_by UUID NOT NULL,
  marked_by_name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, marked_by)
);

CREATE INDEX idx_lead_touch_marks_source ON public.lead_touch_marks (source_type, source_id);
CREATE INDEX idx_lead_touch_marks_marked_by ON public.lead_touch_marks (marked_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_touch_marks TO authenticated;
GRANT ALL ON public.lead_touch_marks TO service_role;

ALTER TABLE public.lead_touch_marks ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read marks (used for engagedIds set across panels)
CREATE POLICY "Auth users can read lead_touch_marks"
ON public.lead_touch_marks FOR SELECT
TO authenticated
USING (true);

-- Users can mark a lead as touched on their own behalf
CREATE POLICY "Users can insert their own touch marks"
ON public.lead_touch_marks FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = marked_by);

CREATE POLICY "Users can update their own touch marks"
ON public.lead_touch_marks FOR UPDATE
TO authenticated
USING (auth.uid() = marked_by);

CREATE POLICY "Users can delete their own touch marks"
ON public.lead_touch_marks FOR DELETE
TO authenticated
USING (auth.uid() = marked_by);