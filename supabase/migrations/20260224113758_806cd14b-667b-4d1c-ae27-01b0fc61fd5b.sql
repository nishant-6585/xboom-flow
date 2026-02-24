
-- ============================================================
-- SECURITY HARDENING: Remove USING(true) / WITH CHECK(true) 
-- Add is_user_approved() and role checks across all tables
-- ============================================================

-- 1. DEMAND FORECASTS
DROP POLICY IF EXISTS "Service role can manage demand forecasts" ON public.demand_forecasts;
DROP POLICY IF EXISTS "Approved users can read demand forecasts" ON public.demand_forecasts;
CREATE POLICY "Approved role users can read demand forecasts"
  ON public.demand_forecasts FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'supply_chain')));

-- 2. PAYMENT RISK SCORES
DROP POLICY IF EXISTS "Service role can manage payment risk scores" ON public.payment_risk_scores;
DROP POLICY IF EXISTS "Approved users can read payment risk scores" ON public.payment_risk_scores;
CREATE POLICY "Approved admin/finance can read payment risk scores"
  ON public.payment_risk_scores FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance')));

-- 3. FORECAST ACCURACY LOG
DROP POLICY IF EXISTS "Service role can manage forecast accuracy" ON public.forecast_accuracy_log;
CREATE POLICY "Approved role users can read forecast accuracy"
  ON public.forecast_accuracy_log FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'supply_chain')));

-- 4. PAYMENT RISK ACCURACY LOG
DROP POLICY IF EXISTS "Service role can manage payment risk accuracy" ON public.payment_risk_accuracy_log;
CREATE POLICY "Approved admin/finance can read payment risk accuracy"
  ON public.payment_risk_accuracy_log FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance')));

-- 5. AI SCORING LOGS
DROP POLICY IF EXISTS "Authenticated users can view ai scoring logs" ON public.ai_scoring_logs;
DROP POLICY IF EXISTS "Authenticated users can insert ai scoring logs" ON public.ai_scoring_logs;
CREATE POLICY "Approved users can view ai scoring logs"
  ON public.ai_scoring_logs FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can insert ai scoring logs"
  ON public.ai_scoring_logs FOR INSERT TO authenticated
  WITH CHECK (is_user_approved(auth.uid()));

-- 6. ATTENDANCE AUDIT LOG
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.attendance_audit_log;
CREATE POLICY "Approved admin/hr can read attendance audit logs"
  ON public.attendance_audit_log FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND is_hr_or_admin(auth.uid()));

-- 7. DOMAIN EVENTS
DROP POLICY IF EXISTS "Authenticated users can view domain events" ON public.domain_events;
DROP POLICY IF EXISTS "Authenticated users can insert domain events" ON public.domain_events;
DROP POLICY IF EXISTS "System can update domain events" ON public.domain_events;
CREATE POLICY "Approved users can view domain events"
  ON public.domain_events FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can insert domain events"
  ON public.domain_events FOR INSERT TO authenticated WITH CHECK (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can update domain events"
  ON public.domain_events FOR UPDATE TO authenticated USING (is_user_approved(auth.uid()));

-- 8. DUPLICATE ALERTS
DROP POLICY IF EXISTS "Authenticated users can view duplicate alerts" ON public.duplicate_alerts;
DROP POLICY IF EXISTS "Authenticated users can insert duplicate alerts" ON public.duplicate_alerts;
DROP POLICY IF EXISTS "Authenticated users can update duplicate alerts" ON public.duplicate_alerts;
CREATE POLICY "Approved users can view duplicate alerts"
  ON public.duplicate_alerts FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can insert duplicate alerts"
  ON public.duplicate_alerts FOR INSERT TO authenticated WITH CHECK (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can update duplicate alerts"
  ON public.duplicate_alerts FOR UPDATE TO authenticated USING (is_user_approved(auth.uid()));

-- 9. EXPENSE ORDER LINKS
DROP POLICY IF EXISTS "Authenticated users can view expense order links" ON public.expense_order_links;
DROP POLICY IF EXISTS "Authenticated users can insert expense order links" ON public.expense_order_links;
DROP POLICY IF EXISTS "Authenticated users can delete expense order links" ON public.expense_order_links;
CREATE POLICY "Approved users can view expense order links"
  ON public.expense_order_links FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance')));
CREATE POLICY "Approved admin/finance can insert expense order links"
  ON public.expense_order_links FOR INSERT TO authenticated
  WITH CHECK (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance')));
CREATE POLICY "Approved admin/finance can delete expense order links"
  ON public.expense_order_links FOR DELETE TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance')));

-- 10. EXPENSE PROCUREMENT LINKS
DROP POLICY IF EXISTS "Authenticated users can view expense procurement links" ON public.expense_procurement_links;
DROP POLICY IF EXISTS "Authenticated users can insert expense procurement links" ON public.expense_procurement_links;
DROP POLICY IF EXISTS "Authenticated users can delete expense procurement links" ON public.expense_procurement_links;
CREATE POLICY "Approved users can view expense procurement links"
  ON public.expense_procurement_links FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'supply_chain')));
CREATE POLICY "Approved role users can insert expense procurement links"
  ON public.expense_procurement_links FOR INSERT TO authenticated
  WITH CHECK (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'supply_chain')));
CREATE POLICY "Approved role users can delete expense procurement links"
  ON public.expense_procurement_links FOR DELETE TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'supply_chain')));

-- 11. EXPENSES (created_by is TEXT)
DROP POLICY IF EXISTS "All users can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "All users can create expenses" ON public.expenses;
CREATE POLICY "Approved users can view expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (created_by = auth.uid()::text OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance')));
CREATE POLICY "Approved users can create expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (is_user_approved(auth.uid()) AND created_by = auth.uid()::text);

-- 12. IMPORTS (created_by is UUID)
DROP POLICY IF EXISTS "Authenticated users can view imports" ON public.imports;
DROP POLICY IF EXISTS "Authenticated users can create imports" ON public.imports;
DROP POLICY IF EXISTS "Authenticated users can update imports" ON public.imports;
DROP POLICY IF EXISTS "Authenticated users can delete imports" ON public.imports;
CREATE POLICY "Approved users can view imports"
  ON public.imports FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supply_chain')));
CREATE POLICY "Approved users can create imports"
  ON public.imports FOR INSERT TO authenticated
  WITH CHECK (is_user_approved(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Approved users can update imports"
  ON public.imports FOR UPDATE TO authenticated
  USING (is_user_approved(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supply_chain')));
CREATE POLICY "Approved users can delete imports"
  ON public.imports FOR DELETE TO authenticated
  USING (is_user_approved(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin')));

-- 13. IMPORT ITEMS
DROP POLICY IF EXISTS "Authenticated users can view import items" ON public.import_items;
DROP POLICY IF EXISTS "Authenticated users can create import items" ON public.import_items;
DROP POLICY IF EXISTS "Authenticated users can update import items" ON public.import_items;
DROP POLICY IF EXISTS "Authenticated users can delete import items" ON public.import_items;
CREATE POLICY "Approved users can view import items"
  ON public.import_items FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can create import items"
  ON public.import_items FOR INSERT TO authenticated WITH CHECK (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can update import items"
  ON public.import_items FOR UPDATE TO authenticated USING (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can delete import items"
  ON public.import_items FOR DELETE TO authenticated USING (is_user_approved(auth.uid()));

-- 14. INVENTORY ALERT LOGS
DROP POLICY IF EXISTS "Authenticated users can view inventory alerts" ON public.inventory_alert_logs;
DROP POLICY IF EXISTS "System can insert inventory alerts" ON public.inventory_alert_logs;
CREATE POLICY "Approved users can view inventory alerts"
  ON public.inventory_alert_logs FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supply_chain')));
CREATE POLICY "Approved users can insert inventory alerts"
  ON public.inventory_alert_logs FOR INSERT TO authenticated
  WITH CHECK (is_user_approved(auth.uid()));

-- 15. INVENTORY SYNC SETTINGS
DROP POLICY IF EXISTS "Authenticated users can view sync settings" ON public.inventory_sync_settings;
CREATE POLICY "Approved users can view sync settings"
  ON public.inventory_sync_settings FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supply_chain')));

-- 16. MARGIN THRESHOLDS
DROP POLICY IF EXISTS "Authenticated users can view margin thresholds" ON public.margin_thresholds;
CREATE POLICY "Approved users can view margin thresholds"
  ON public.margin_thresholds FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'supply_chain')));

-- 17. ORG DEPARTMENTS
DROP POLICY IF EXISTS "Authenticated users can view departments" ON public.org_departments;
CREATE POLICY "Approved users can view departments"
  ON public.org_departments FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));

-- 18. ORG ROLES
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.org_roles;
CREATE POLICY "Approved users can view roles"
  ON public.org_roles FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));

-- 19. PETTY CASH TRANSACTIONS
DROP POLICY IF EXISTS "All users can view petty cash transactions" ON public.petty_cash_transactions;
CREATE POLICY "Approved admin/finance can view petty cash"
  ON public.petty_cash_transactions FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'finance')));

-- 20. PIPELINE TAGS
DROP POLICY IF EXISTS "Authenticated users can view pipeline tags" ON public.pipeline_tags;
CREATE POLICY "Approved users can view pipeline tags"
  ON public.pipeline_tags FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));

-- 21. QUOTE RISK FLAGS
DROP POLICY IF EXISTS "Authenticated users can view quote risk flags" ON public.quote_risk_flags;
DROP POLICY IF EXISTS "Authenticated users can insert quote risk flags" ON public.quote_risk_flags;
CREATE POLICY "Approved users can view quote risk flags"
  ON public.quote_risk_flags FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));
CREATE POLICY "Approved users can insert quote risk flags"
  ON public.quote_risk_flags FOR INSERT TO authenticated WITH CHECK (is_user_approved(auth.uid()));

-- 22. AUDIT TABLE IMMUTABILITY
DROP POLICY IF EXISTS "update_security_audit_log" ON public.security_audit_log;
DROP POLICY IF EXISTS "delete_security_audit_log" ON public.security_audit_log;
DROP POLICY IF EXISTS "update_login_history" ON public.login_history;
DROP POLICY IF EXISTS "delete_login_history" ON public.login_history;

-- 23. Fix functions missing search_path
CREATE OR REPLACE FUNCTION public.generate_quote_number()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := 'QT-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(nextval('quote_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;
