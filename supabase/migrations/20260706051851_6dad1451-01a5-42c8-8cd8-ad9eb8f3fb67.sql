DROP POLICY IF EXISTS "Anyone can record form views" ON public.form_views;

CREATE POLICY "Anyone can record form views for active forms"
ON public.form_views
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms f
    WHERE f.id = form_views.form_id
      AND f.is_active = true
  )
);