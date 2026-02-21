
-- ============================================================
-- PHASE 1: INTELLIGENCE FOUNDATION - DATABASE MIGRATION
-- ============================================================

-- 1. Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1️⃣ DUPLICATE LEAD DETECTION
-- ============================================================

CREATE TABLE public.duplicate_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  matched_enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL, -- 'phone', 'email', 'gst', 'company_fuzzy'
  similarity_score NUMERIC(5,4) NOT NULL DEFAULT 0,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_by UUID,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.duplicate_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view duplicate alerts"
  ON public.duplicate_alerts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert duplicate alerts"
  ON public.duplicate_alerts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update duplicate alerts"
  ON public.duplicate_alerts FOR UPDATE TO authenticated
  USING (true);

CREATE INDEX idx_duplicate_alerts_enquiry ON public.duplicate_alerts(enquiry_id);
CREATE INDEX idx_duplicate_alerts_matched ON public.duplicate_alerts(matched_enquiry_id);

-- Add trigram index on enquiries.customer_company for fuzzy search
CREATE INDEX idx_enquiries_company_trgm ON public.enquiries USING gin (customer_company gin_trgm_ops);

-- Duplicate check function
CREATE OR REPLACE FUNCTION public.find_duplicate_enquiries(
  p_customer_company TEXT,
  p_customer_name TEXT,
  p_exclude_id UUID DEFAULT NULL,
  p_threshold NUMERIC DEFAULT 0.4
)
RETURNS TABLE(
  enquiry_id UUID,
  customer_name TEXT,
  customer_company TEXT,
  product_name TEXT,
  match_type TEXT,
  similarity_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as enquiry_id,
    e.customer_name,
    e.customer_company,
    e.product_name,
    'company_fuzzy'::TEXT as match_type,
    similarity(e.customer_company, p_customer_company)::NUMERIC as similarity_score
  FROM public.enquiries e
  WHERE (p_exclude_id IS NULL OR e.id != p_exclude_id)
    AND similarity(e.customer_company, p_customer_company) > p_threshold
  ORDER BY similarity_score DESC
  LIMIT 10;
END;
$$;

-- ============================================================
-- 2️⃣ AUTO AI LEAD SCORING
-- ============================================================

-- Add AI scoring columns to enquiries
ALTER TABLE public.enquiries 
  ADD COLUMN IF NOT EXISTS ai_score NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS probability_to_close NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS ai_priority_level TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS ai_last_scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(3,2);

-- AI scoring logs
CREATE TABLE public.ai_scoring_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  raw_response JSONB,
  score NUMERIC(4,2),
  probability NUMERIC(3,2),
  confidence NUMERIC(3,2),
  priority_level TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_scoring_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ai scoring logs"
  ON public.ai_scoring_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert ai scoring logs"
  ON public.ai_scoring_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_ai_scoring_logs_enquiry ON public.ai_scoring_logs(enquiry_id);

-- ============================================================
-- 3️⃣ WEIGHTED REVENUE FORECAST VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.sales_weighted_forecast_view AS
SELECT 
  po.id,
  po.customer_name,
  po.customer_company,
  po.product_name,
  po.product_category,
  po.quantity,
  po.expected_price,
  po.probability,
  po.status,
  po.lead_temperature,
  po.is_mega_deal,
  po.expected_closure_date,
  po.sales_person_id,
  po.sales_person_name,
  po.created_at,
  COALESCE(po.expected_price, 0) * COALESCE(po.probability, 50) / 100.0 AS weighted_revenue,
  CASE 
    WHEN po.status IN ('won') THEN 'closed_won'
    WHEN po.status IN ('lost') THEN 'closed_lost'
    WHEN po.expected_closure_date < CURRENT_DATE THEN 'overdue'
    ELSE 'active'
  END AS deal_stage
FROM public.pipeline_orders po
WHERE po.status NOT IN ('lost');

-- ============================================================
-- 4️⃣ MARGIN GUARDRAIL ENGINE
-- ============================================================

-- Configurable margin thresholds per category
CREATE TABLE public.margin_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  minimum_margin_percent NUMERIC(5,2) NOT NULL DEFAULT 15.0,
  warning_margin_percent NUMERIC(5,2) NOT NULL DEFAULT 20.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.margin_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view margin thresholds"
  ON public.margin_thresholds FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin can manage margin thresholds"
  ON public.margin_thresholds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_margin_thresholds_updated_at
  BEFORE UPDATE ON public.margin_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default thresholds
INSERT INTO public.margin_thresholds (category, minimum_margin_percent, warning_margin_percent) VALUES
  ('Consumer Drones', 15.0, 20.0),
  ('Enterprise Drones', 12.0, 18.0),
  ('Agriculture Drones', 12.0, 18.0),
  ('Safety & Security', 15.0, 20.0),
  ('Robotics', 15.0, 20.0),
  ('Accessories', 20.0, 25.0),
  ('Default', 15.0, 20.0)
ON CONFLICT (category) DO NOTHING;

-- Quote risk flags
CREATE TABLE public.quote_risk_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  item_product_name TEXT,
  item_category TEXT,
  item_margin_percent NUMERIC(5,2),
  overall_margin_percent NUMERIC(5,2),
  threshold_percent NUMERIC(5,2),
  risk_level TEXT NOT NULL DEFAULT 'safe', -- 'safe', 'warning', 'critical'
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_risk_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view quote risk flags"
  ON public.quote_risk_flags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert quote risk flags"
  ON public.quote_risk_flags FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin/Finance can update quote risk flags"
  ON public.quote_risk_flags FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE INDEX idx_quote_risk_flags_quote ON public.quote_risk_flags(quote_id);

-- ============================================================
-- 5️⃣ SHOPIFY ↔ INVENTORY SYNC SETTINGS
-- ============================================================

CREATE TABLE public.inventory_sync_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enable_shopify_sync BOOLEAN NOT NULL DEFAULT false,
  sync_direction TEXT NOT NULL DEFAULT 'internal_to_shopify', -- 'internal_to_shopify', 'bi_directional'
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_sync_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync settings"
  ON public.inventory_sync_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/Supply Chain can manage sync settings"
  ON public.inventory_sync_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE TRIGGER update_inventory_sync_settings_updated_at
  BEFORE UPDATE ON public.inventory_sync_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.inventory_sync_settings (enable_shopify_sync, sync_direction) 
VALUES (false, 'internal_to_shopify');

-- ============================================================
-- 6️⃣ LOW-STOCK ALERT ENGINE
-- ============================================================

-- Add columns to inventory
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS safety_stock INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ;

-- Inventory alert logs
CREATE TABLE public.inventory_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_category TEXT,
  current_stock INTEGER NOT NULL,
  reorder_point INTEGER NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'low_stock', -- 'low_stock', 'out_of_stock', 'critical'
  task_created_id UUID,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory alerts"
  ON public.inventory_alert_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "System can insert inventory alerts"
  ON public.inventory_alert_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_inventory_alert_logs_inventory ON public.inventory_alert_logs(inventory_id);
CREATE INDEX idx_inventory_alert_logs_created ON public.inventory_alert_logs(created_at DESC);

-- ============================================================
-- 7️⃣ INVOICE AGING VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.invoice_aging_view AS
SELECT 
  i.id,
  i.invoice_number,
  i.customer_name,
  i.customer_company,
  i.total_amount,
  i.amount_paid,
  i.balance_due,
  i.invoice_date,
  i.due_date,
  i.status,
  i.created_by,
  CASE 
    WHEN i.status = 'paid' THEN 'paid'
    WHEN i.due_date IS NULL THEN 'no_due_date'
    WHEN CURRENT_DATE <= i.due_date::date THEN 'current'
    WHEN CURRENT_DATE - i.due_date::date BETWEEN 1 AND 30 THEN '1_30'
    WHEN CURRENT_DATE - i.due_date::date BETWEEN 31 AND 60 THEN '31_60'
    WHEN CURRENT_DATE - i.due_date::date BETWEEN 61 AND 90 THEN '61_90'
    ELSE '90_plus'
  END AS aging_bucket,
  CASE 
    WHEN i.due_date IS NOT NULL AND i.status NOT IN ('paid', 'cancelled')
    THEN GREATEST(0, CURRENT_DATE - i.due_date::date)
    ELSE 0
  END AS days_overdue
FROM public.invoices i
WHERE i.status NOT IN ('cancelled')
  AND i.is_archived IS NOT TRUE;

-- ============================================================
-- 9️⃣ DOMAIN EVENTS (Architectural Safeguard)
-- ============================================================

CREATE TABLE public.domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view domain events"
  ON public.domain_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert domain events"
  ON public.domain_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update domain events"
  ON public.domain_events FOR UPDATE TO authenticated
  USING (true);

CREATE INDEX idx_domain_events_type ON public.domain_events(event_type);
CREATE INDEX idx_domain_events_entity ON public.domain_events(entity_type, entity_id);
CREATE INDEX idx_domain_events_unprocessed ON public.domain_events(processed, created_at) WHERE processed = false;

-- ============================================================
-- Add task_type for low_stock_alert
-- ============================================================
ALTER TYPE public.task_type ADD VALUE IF NOT EXISTS 'low_stock_alert';
