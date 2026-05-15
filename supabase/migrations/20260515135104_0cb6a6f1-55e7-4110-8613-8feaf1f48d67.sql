-- =========================================================================
-- 1. payment_risk_scores: remove broad authenticated SELECT
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated users can view payment risk scores"
  ON public.payment_risk_scores;

-- Ensure proper restricted policy exists (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_risk_scores'
      AND policyname='Admin and Finance can view payment risk scores'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Admin and Finance can view payment risk scores"
      ON public.payment_risk_scores FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND (
          public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'finance'::app_role)
        )
      )
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 2. payment_risk_accuracy_log: remove broad authenticated SELECT
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated users can view payment risk accuracy"
  ON public.payment_risk_accuracy_log;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_risk_accuracy_log'
      AND policyname='Admin and Finance can view payment risk accuracy'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Admin and Finance can view payment risk accuracy"
      ON public.payment_risk_accuracy_log FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND (
          public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'finance'::app_role)
        )
      )
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 3. demand_forecasts: remove broad authenticated SELECT
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated users can view demand forecasts"
  ON public.demand_forecasts;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='demand_forecasts'
      AND policyname='Admin Finance SupplyChain can view demand forecasts'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Admin Finance SupplyChain can view demand forecasts"
      ON public.demand_forecasts FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND (
          public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'finance'::app_role)
          OR public.has_role(auth.uid(),'supply_chain'::app_role)
        )
      )
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 4. forecast_accuracy_log: remove broad authenticated SELECT
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated users can view forecast accuracy"
  ON public.forecast_accuracy_log;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='forecast_accuracy_log'
      AND policyname='Admin Finance SupplyChain can view forecast accuracy'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Admin Finance SupplyChain can view forecast accuracy"
      ON public.forecast_accuracy_log FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND (
          public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'finance'::app_role)
          OR public.has_role(auth.uid(),'supply_chain'::app_role)
        )
      )
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 5. crm_contact_activities: restrict UPDATE to creator or admin
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated users can update activities"
  ON public.crm_contact_activities;

DO $$
DECLARE
  has_user_id boolean;
  has_created_by boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_contact_activities' AND column_name='user_id'
  ) INTO has_user_id;
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_contact_activities' AND column_name='created_by'
  ) INTO has_created_by;

  IF has_user_id THEN
    EXECUTE $p$
      CREATE POLICY "Creator or admin can update CRM activities"
      ON public.crm_contact_activities FOR UPDATE
      USING (
        public.is_user_approved(auth.uid())
        AND (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'::app_role))
      )
      WITH CHECK (
        public.is_user_approved(auth.uid())
        AND (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'::app_role))
      )
    $p$;
  ELSIF has_created_by THEN
    EXECUTE $p$
      CREATE POLICY "Creator or admin can update CRM activities"
      ON public.crm_contact_activities FOR UPDATE
      USING (
        public.is_user_approved(auth.uid())
        AND (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::app_role))
      )
      WITH CHECK (
        public.is_user_approved(auth.uid())
        AND (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::app_role))
      )
    $p$;
  ELSE
    -- Fallback: admin only
    EXECUTE $p$
      CREATE POLICY "Admin can update CRM activities"
      ON public.crm_contact_activities FOR UPDATE
      USING (public.is_user_approved(auth.uid()) AND public.has_role(auth.uid(),'admin'::app_role))
      WITH CHECK (public.is_user_approved(auth.uid()) AND public.has_role(auth.uid(),'admin'::app_role))
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 6. company_activities: restrict SELECT to CRM-relevant roles
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can view company activities"
  ON public.company_activities;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='company_activities'
      AND policyname='CRM roles can view company activities'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "CRM roles can view company activities"
      ON public.company_activities FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND (
          public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'sales'::app_role)
          OR public.has_role(auth.uid(),'sales_manager'::app_role)
          OR public.has_role(auth.uid(),'supply_chain'::app_role)
        )
      )
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 7. woo_lead_activities: restrict SELECT
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can view woo lead activities"
  ON public.woo_lead_activities;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='woo_lead_activities'
      AND policyname='Sales and admin can view woo lead activities'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Sales and admin can view woo lead activities"
      ON public.woo_lead_activities FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND (
          public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'sales'::app_role)
          OR public.has_role(auth.uid(),'sales_manager'::app_role)
        )
      )
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 8. portal_order_line_items: scope to owning portal account or staff
-- =========================================================================
DROP POLICY IF EXISTS "portal_lineitems: read via order"
  ON public.portal_order_line_items;

DO $$
DECLARE
  has_helper boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_my_portal_account_id'
  ) INTO has_helper;

  IF has_helper THEN
    EXECUTE $p$
      CREATE POLICY "Portal customers and staff can view portal line items"
      ON public.portal_order_line_items FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_orders o
          WHERE o.id = portal_order_line_items.order_id
            AND o.account_id = public.get_my_portal_account_id()
        )
        OR (
          public.is_user_approved(auth.uid())
          AND (
            public.has_role(auth.uid(),'admin'::app_role)
            OR public.has_role(auth.uid(),'sales'::app_role)
            OR public.has_role(auth.uid(),'sales_manager'::app_role)
            OR public.has_role(auth.uid(),'supply_chain'::app_role)
          )
        )
      )
    $p$;
  ELSE
    -- Helper missing: staff-only fallback
    EXECUTE $p$
      CREATE POLICY "Staff can view portal line items"
      ON public.portal_order_line_items FOR SELECT
      USING (
        public.is_user_approved(auth.uid())
        AND (
          public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'sales'::app_role)
          OR public.has_role(auth.uid(),'sales_manager'::app_role)
          OR public.has_role(auth.uid(),'supply_chain'::app_role)
        )
      )
    $p$;
  END IF;
END $$;

-- =========================================================================
-- 9. call_logs: drop anon INSERT
-- =========================================================================
DROP POLICY IF EXISTS "Anon can insert call logs via webhook"
  ON public.call_logs;