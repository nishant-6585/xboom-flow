CREATE POLICY "Users can delete own comments"
ON public.ticket_comments FOR DELETE
TO authenticated
USING (commented_by = auth.uid() AND is_user_approved(auth.uid()));

CREATE POLICY "Users can update own comments"
ON public.ticket_comments FOR UPDATE
TO authenticated
USING (commented_by = auth.uid() AND is_user_approved(auth.uid()))
WITH CHECK (commented_by = auth.uid() AND is_user_approved(auth.uid()));