-- Fix permissive RLS policies for enquiry_tags
DROP POLICY IF EXISTS "Authenticated users can manage enquiry tags" ON public.enquiry_tags;

CREATE POLICY "Users can add enquiry tags"
ON public.enquiry_tags FOR INSERT TO authenticated
WITH CHECK (added_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE POLICY "Users can update their own tags or admins"
ON public.enquiry_tags FOR UPDATE TO authenticated
USING (added_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own tags or admins"
ON public.enquiry_tags FOR DELETE TO authenticated
USING (added_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Fix permissive RLS policies for pipeline_tags
DROP POLICY IF EXISTS "Authenticated users can manage pipeline tags" ON public.pipeline_tags;

CREATE POLICY "Users can add pipeline tags"
ON public.pipeline_tags FOR INSERT TO authenticated
WITH CHECK (added_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE POLICY "Users can update their own pipeline tags or admins"
ON public.pipeline_tags FOR UPDATE TO authenticated
USING (added_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own pipeline tags or admins"
ON public.pipeline_tags FOR DELETE TO authenticated
USING (added_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));