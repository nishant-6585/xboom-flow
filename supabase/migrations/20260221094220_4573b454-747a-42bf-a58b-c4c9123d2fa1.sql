
-- ============================================
-- Phase 2A-1: Predictive Foundation Tables
-- ============================================

-- 1. Demand Forecasts
CREATE TABLE public.demand_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_category TEXT,
  forecast_date DATE NOT NULL DEFAULT CURRENT_DATE,
  predicted_daily_demand NUMERIC NOT NULL DEFAULT 0,
  days_to_stockout NUMERIC,
  recommended_reorder_qty INTEGER,
  current_stock INTEGER,
  avg_consumption_30d NUMERIC,
  avg_consumption_60d NUMERIC,
  avg_consumption_90d NUMERIC,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  historical_data_days INTEGER NOT NULL DEFAULT 0,
  model_version TEXT NOT NULL DEFAULT 'v1-rolling-mean',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.demand_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view demand forecasts"
  ON public.demand_forecasts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage demand forecasts"
  ON public.demand_forecasts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_demand_forecasts_product ON public.demand_forecasts(product_id, forecast_date DESC);
CREATE INDEX idx_demand_forecasts_stockout ON public.demand_forecasts(days_to_stockout) WHERE days_to_stockout IS NOT NULL;

-- 2. Forecast Accuracy Log
CREATE TABLE public.forecast_accuracy_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_id UUID REFERENCES public.demand_forecasts(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  predicted_demand NUMERIC NOT NULL,
  actual_demand NUMERIC NOT NULL,
  measurement_period_days INTEGER NOT NULL DEFAULT 7,
  mape_percent NUMERIC,
  model_version TEXT NOT NULL DEFAULT 'v1-rolling-mean',
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_accuracy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view forecast accuracy"
  ON public.forecast_accuracy_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage forecast accuracy"
  ON public.forecast_accuracy_log FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_forecast_accuracy_product ON public.forecast_accuracy_log(product_id, logged_at DESC);

-- 3. Payment Risk Scores
CREATE TABLE public.payment_risk_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_company TEXT,
  customer_name TEXT NOT NULL,
  risk_score NUMERIC NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 1),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  predicted_days_to_pay INTEGER,
  factors JSONB NOT NULL DEFAULT '{}',
  model_version TEXT NOT NULL DEFAULT 'v1-heuristic',
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view payment risk scores"
  ON public.payment_risk_scores FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage payment risk scores"
  ON public.payment_risk_scores FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_payment_risk_invoice ON public.payment_risk_scores(invoice_id, scored_at DESC);
CREATE INDEX idx_payment_risk_level ON public.payment_risk_scores(risk_level);

-- 4. Payment Risk Accuracy Log
CREATE TABLE public.payment_risk_accuracy_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  score_id UUID REFERENCES public.payment_risk_scores(id) ON DELETE SET NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_company TEXT,
  predicted_risk_level TEXT NOT NULL,
  predicted_days_to_pay INTEGER,
  actual_days_to_pay INTEGER NOT NULL,
  was_late BOOLEAN NOT NULL DEFAULT false,
  model_version TEXT NOT NULL DEFAULT 'v1-heuristic',
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_risk_accuracy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view payment risk accuracy"
  ON public.payment_risk_accuracy_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage payment risk accuracy"
  ON public.payment_risk_accuracy_log FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_payment_risk_accuracy_invoice ON public.payment_risk_accuracy_log(invoice_id, logged_at DESC);
