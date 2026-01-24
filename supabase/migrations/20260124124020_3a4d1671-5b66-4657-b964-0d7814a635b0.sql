-- Update the petty cash transactions insert policy to allow users to record received cash for themselves
DROP POLICY IF EXISTS "Admin and finance can create petty cash transactions" ON public.petty_cash_transactions;

CREATE POLICY "Users can create petty cash transactions"
  ON public.petty_cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Admin/Finance can create transactions for anyone
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'finance')
    )
    OR 
    -- Any user can create transactions for themselves (including recording received cash)
    user_id = auth.uid()::text
  );