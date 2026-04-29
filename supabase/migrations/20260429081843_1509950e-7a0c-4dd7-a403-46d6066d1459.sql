-- Premium Companies/Accounts CRM upgrade

-- 1. Extend companies table
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('A','B','C')),
  ADD COLUMN IF NOT EXISTS tier_source TEXT DEFAULT 'auto' CHECK (tier_source IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS tier_locked_by UUID,
  ADD COLUMN IF NOT EXISTS tier_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier_notes TEXT,
  ADD COLUMN IF NOT EXISTS potential_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pipeline_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_score INT DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS health_band TEXT DEFAULT 'watch' CHECK (health_band IN ('healthy','watch','at_risk','critical')),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_owner_id UUID,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_type TEXT,
  ADD COLUMN IF NOT EXISTS next_action_notes TEXT,
  ADD COLUMN IF NOT EXISTS ai_brief TEXT,
  ADD COLUMN IF NOT EXISTS ai_brief_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_companies_tier ON public.companies(tier);
CREATE INDEX IF NOT EXISTS idx_companies_health_band ON public.companies(health_band);
CREATE INDEX IF NOT EXISTS idx_companies_owner ON public.companies(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_next_action ON public.companies(next_action_at);

-- 2. Activity feed (cross-source unified timeline)
CREATE TABLE IF NOT EXISTS public.company_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- call, email, whatsapp, order, note, ticket, meeting, task, lead
  source TEXT NOT NULL,        -- elevenlabs, exotel, myoperator, gmail, interakt, manual, shopify, woo, pipeline, system
  title TEXT NOT NULL,
  description TEXT,
  reference_id UUID,           -- links to underlying record (lead/order/ticket id)
  reference_table TEXT,
  contact_id UUID,
  amount NUMERIC,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_activities_company ON public.company_activities(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_activities_type ON public.company_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_company_activities_source ON public.company_activities(source);

ALTER TABLE public.company_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view company activities"
  ON public.company_activities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create company activities"
  ON public.company_activities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/Sales lead can update company activities"
  ON public.company_activities FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales_manager') OR created_by = auth.uid());

CREATE POLICY "Admin can delete company activities"
  ON public.company_activities FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- 3. Saved views
CREATE TABLE IF NOT EXISTS public.company_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own or shared saved views"
  ON public.company_saved_views FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_shared = true);

CREATE POLICY "Users manage own saved views"
  ON public.company_saved_views FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Health score recompute function
CREATE OR REPLACE FUNCTION public.recompute_company_health(_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_activity TIMESTAMPTZ;
  v_last_order TIMESTAMPTZ;
  v_open_tickets INT;
  v_recent_value NUMERIC;
  v_prior_value NUMERIC;
  v_score INT := 50;
  v_band TEXT := 'watch';
  v_days_since_activity INT;
BEGIN
  SELECT MAX(occurred_at) INTO v_last_activity FROM public.company_activities WHERE company_id = _company_id;
  SELECT MAX(order_date) INTO v_last_order FROM public.orders WHERE company_id = _company_id;

  v_days_since_activity := COALESCE(EXTRACT(DAY FROM (now() - v_last_activity))::INT, 365);

  -- Recency
  IF v_days_since_activity <= 7 THEN v_score := v_score + 25;
  ELSIF v_days_since_activity <= 30 THEN v_score := v_score + 10;
  ELSIF v_days_since_activity <= 60 THEN v_score := v_score - 5;
  ELSE v_score := v_score - 20;
  END IF;

  -- Growth/decline
  SELECT COALESCE(SUM(total_sales_amount),0) INTO v_recent_value
    FROM public.orders WHERE company_id = _company_id AND order_date >= (now() - interval '90 days');
  SELECT COALESCE(SUM(total_sales_amount),0) INTO v_prior_value
    FROM public.orders WHERE company_id = _company_id
      AND order_date >= (now() - interval '180 days') AND order_date < (now() - interval '90 days');

  IF v_recent_value > v_prior_value * 1.1 THEN v_score := v_score + 15;
  ELSIF v_recent_value < v_prior_value * 0.7 AND v_prior_value > 0 THEN v_score := v_score - 15;
  END IF;

  -- Negative signals (open tickets)
  BEGIN
    SELECT COUNT(*) INTO v_open_tickets FROM public.tickets
      WHERE company_id = _company_id AND status IN ('open','in_progress');
    v_score := v_score - LEAST(v_open_tickets * 5, 20);
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    v_open_tickets := 0;
  END;

  v_score := GREATEST(0, LEAST(100, v_score));

  v_band := CASE
    WHEN v_score >= 75 THEN 'healthy'
    WHEN v_score >= 50 THEN 'watch'
    WHEN v_score >= 25 THEN 'at_risk'
    ELSE 'critical'
  END;

  UPDATE public.companies
    SET health_score = v_score,
        health_band = v_band,
        last_activity_at = v_last_activity,
        last_order_at = v_last_order,
        updated_at = now()
    WHERE id = _company_id;
END;
$$;

-- 5. Auto-tier function (revenue Pareto, skips locked)
CREATE OR REPLACE FUNCTION public.recompute_company_tiers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_cum NUMERIC := 0;
  rec RECORD;
  v_new_tier TEXT;
BEGIN
  SELECT SUM(total_order_value) INTO v_total FROM public.companies WHERE tier_source = 'auto' OR tier_source IS NULL;
  IF v_total IS NULL OR v_total = 0 THEN RETURN; END IF;

  FOR rec IN
    SELECT id, total_order_value FROM public.companies
      WHERE tier_source = 'auto' OR tier_source IS NULL
      ORDER BY total_order_value DESC NULLS LAST
  LOOP
    v_cum := v_cum + COALESCE(rec.total_order_value,0);
    IF v_cum / v_total <= 0.7 THEN v_new_tier := 'A';
    ELSIF v_cum / v_total <= 0.9 THEN v_new_tier := 'B';
    ELSE v_new_tier := 'C';
    END IF;
    UPDATE public.companies SET tier = v_new_tier WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 6. Helper to log activity
CREATE OR REPLACE FUNCTION public.log_company_activity(
  _company_id UUID, _type TEXT, _source TEXT, _title TEXT,
  _description TEXT DEFAULT NULL, _reference_id UUID DEFAULT NULL,
  _reference_table TEXT DEFAULT NULL, _amount NUMERIC DEFAULT NULL,
  _occurred_at TIMESTAMPTZ DEFAULT now(), _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.company_activities(company_id, activity_type, source, title, description, reference_id, reference_table, amount, occurred_at, metadata, created_by)
  VALUES (_company_id, _type, _source, _title, _description, _reference_id, _reference_table, _amount, _occurred_at, _metadata, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 7. Updated_at trigger for saved views
CREATE TRIGGER trg_company_saved_views_updated_at
  BEFORE UPDATE ON public.company_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();