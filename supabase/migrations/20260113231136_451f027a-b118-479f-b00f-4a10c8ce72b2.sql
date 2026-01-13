-- Create edit history table to track all changes
CREATE TABLE public.edit_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  edited_by UUID NOT NULL,
  edited_by_name TEXT NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_edit_history_record ON public.edit_history(table_name, record_id);
CREATE INDEX idx_edit_history_edited_at ON public.edit_history(edited_at DESC);

-- Enable RLS
ALTER TABLE public.edit_history ENABLE ROW LEVEL SECURITY;

-- All approved users can view edit history
CREATE POLICY "All approved users can view edit history"
ON public.edit_history
FOR SELECT
USING (is_user_approved(auth.uid()));

-- Admin, supply chain, and sales can create edit history
CREATE POLICY "Authenticated users can create edit history"
ON public.edit_history
FOR INSERT
WITH CHECK (is_user_approved(auth.uid()));

-- Only admin can delete edit history
CREATE POLICY "Admin can delete edit history"
ON public.edit_history
FOR DELETE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));