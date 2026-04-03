-- Add missing DELETE policies for credit card tables
CREATE POLICY "admin_finance_delete_cards" ON public.credit_cards FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "admin_finance_delete_stmts" ON public.cc_statements FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "admin_finance_delete_uploads" ON public.statement_uploads FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role));