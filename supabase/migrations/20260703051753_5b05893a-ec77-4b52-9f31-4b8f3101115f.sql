
-- Fix: sales_points_insert_no_owner_check
DROP POLICY IF EXISTS "System can create points" ON public.sales_points;
CREATE POLICY "Admin/Finance can insert points"
ON public.sales_points
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role))
);

-- Fix: quote_risk_flags_insert_bypasses_approval
DROP POLICY IF EXISTS "Approved users can insert quote risk flags" ON public.quote_risk_flags;
CREATE POLICY "Approved users can insert unapproved quote risk flags"
ON public.quote_risk_flags
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid())
  AND requires_approval = true
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND risk_level IN ('warning','danger')
);
CREATE POLICY "Admin/Finance can insert any quote risk flag"
ON public.quote_risk_flags
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)
);

-- Fix: petty_cash_transactions_unrestricted_insert
-- Only admin/finance can create credit entries (cash_given, overpayment_credit).
-- Regular users may only record their own debits (expense_deduction, refund).
DROP POLICY IF EXISTS "Users can create petty cash transactions" ON public.petty_cash_transactions;
CREATE POLICY "Admin/Finance can insert any petty cash transaction"
ON public.petty_cash_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role))
);
CREATE POLICY "Users can record own petty cash debits"
ON public.petty_cash_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid())
  AND user_id = (auth.uid())::text
  AND transaction_type IN ('expense_deduction','refund')
);
