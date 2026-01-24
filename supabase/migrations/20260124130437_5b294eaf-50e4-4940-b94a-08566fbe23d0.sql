-- Create a table to track form page views
CREATE TABLE public.form_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.form_views ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert views (public forms)
CREATE POLICY "Anyone can record form views"
  ON public.form_views
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users with permissions to view form views
CREATE POLICY "Users with form access can view form views"
  ON public.form_views
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND (ur.role = 'admin' OR has_form_permission(auth.uid(), 'view_forms'))
    )
  );

-- Create index for faster queries
CREATE INDEX idx_form_views_form_id ON public.form_views(form_id);

-- Add realtime for form_views
ALTER PUBLICATION supabase_realtime ADD TABLE public.form_views;