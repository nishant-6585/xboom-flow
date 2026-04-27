-- Enable scheduling extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================
-- 1. Sync runs (one row per invocation of sync-website-orders)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.woocommerce_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('backfill','incremental','manual')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  start_page INTEGER,
  end_page INTEGER,
  pages_fetched INTEGER DEFAULT 0,
  orders_fetched INTEGER DEFAULT 0,
  orders_upserted INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  total_in_woocommerce INTEGER,
  modified_after TIMESTAMPTZ,
  next_page INTEGER,
  has_more BOOLEAN DEFAULT false,
  message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'system',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_woo_sync_runs_started_at ON public.woocommerce_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_woo_sync_runs_mode ON public.woocommerce_sync_runs(mode, started_at DESC);

ALTER TABLE public.woocommerce_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Privileged users can view sync runs"
  ON public.woocommerce_sync_runs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'supply_chain')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

CREATE POLICY "Service role manages sync runs"
  ON public.woocommerce_sync_runs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================
-- 2. Sync state (singleton — last backfill / last incremental)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.woocommerce_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_backfill_started_at TIMESTAMPTZ,
  last_backfill_completed_at TIMESTAMPTZ,
  last_incremental_at TIMESTAMPTZ,
  total_orders_synced INTEGER DEFAULT 0,
  total_in_woocommerce INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.woocommerce_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.woocommerce_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Privileged users can view sync state"
  ON public.woocommerce_sync_state FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'supply_chain')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'sales')
  );

CREATE POLICY "Service role manages sync state"
  ON public.woocommerce_sync_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================
-- 3. Order status change audit log
-- =============================================================
CREATE TABLE IF NOT EXISTS public.woocommerce_order_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_order_id TEXT NOT NULL,
  order_number TEXT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  changed_by_email TEXT,
  source TEXT NOT NULL DEFAULT 'xboom_ui' CHECK (source IN ('xboom_ui','webhook','sync','system')),
  woo_api_success BOOLEAN,
  woo_api_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_woo_status_logs_order ON public.woocommerce_order_status_logs(woo_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_woo_status_logs_user ON public.woocommerce_order_status_logs(changed_by);

ALTER TABLE public.woocommerce_order_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Privileged users can view status logs"
  ON public.woocommerce_order_status_logs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'supply_chain')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

CREATE POLICY "Service role manages status logs"
  ON public.woocommerce_order_status_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);