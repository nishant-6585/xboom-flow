
-- 1. Add conversion tracking columns to enquiries
ALTER TABLE public.enquiries 
  ADD COLUMN IF NOT EXISTS is_converted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conversion_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_date timestamptz;

-- 2. Add campaign_id to orders for attribution
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS campaign_id text;

-- 3. Create campaign_spend table
CREATE TABLE IF NOT EXISTS public.campaign_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  campaign_name text,
  spend numeric NOT NULL DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, date)
);

ALTER TABLE public.campaign_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view campaign_spend"
  ON public.campaign_spend FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can manage campaign_spend"
  ON public.campaign_spend FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. Create trigger: when order is created with enquiry_id, mark enquiry as converted
CREATE OR REPLACE FUNCTION public.mark_enquiry_converted_on_order()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.enquiry_id IS NOT NULL THEN
    UPDATE public.enquiries
    SET is_converted = true,
        conversion_value = COALESCE(NEW.total_sales_amount, NEW.selling_price, 0),
        conversion_date = NOW(),
        campaign_id = COALESCE(
          (SELECT campaign_id FROM public.enquiries WHERE id = NEW.enquiry_id),
          NEW.campaign_id
        )
    WHERE id = NEW.enquiry_id
      AND is_converted = false;
    
    -- Also copy campaign_id to order if not set
    IF NEW.campaign_id IS NULL THEN
      NEW.campaign_id := (SELECT campaign_id FROM public.enquiries WHERE id = NEW.enquiry_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_enquiry_converted ON public.orders;
CREATE TRIGGER trg_mark_enquiry_converted
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_enquiry_converted_on_order();

-- 5. Create campaign_performance view
CREATE OR REPLACE VIEW public.campaign_performance AS
SELECT
  COALESCE(e.campaign_id, cs.campaign_id) AS campaign_id,
  COALESCE(e.campaign_name, cs.campaign_name, 'Unknown Campaign') AS campaign_name,
  COALESCE(spend_data.total_spend, 0) AS total_spend,
  COALESCE(lead_data.total_leads, 0) AS total_leads,
  COALESCE(lead_data.qualified_leads, 0) AS qualified_leads,
  COALESCE(lead_data.conversions, 0) AS conversions,
  COALESCE(lead_data.revenue, 0) AS revenue,
  CASE WHEN COALESCE(lead_data.total_leads, 0) > 0
    THEN COALESCE(spend_data.total_spend, 0) / lead_data.total_leads
    ELSE 0
  END AS cpl,
  CASE WHEN COALESCE(spend_data.total_spend, 0) > 0
    THEN COALESCE(lead_data.revenue, 0) / spend_data.total_spend
    ELSE 0
  END AS roas,
  COALESCE(lead_data.revenue, 0) - COALESCE(spend_data.total_spend, 0) AS profit
FROM (
  SELECT DISTINCT campaign_id, campaign_name
  FROM public.enquiries
  WHERE lead_source = 'google_ads' AND campaign_id IS NOT NULL
) e
FULL OUTER JOIN (
  SELECT DISTINCT campaign_id, campaign_name
  FROM public.campaign_spend
) cs ON e.campaign_id = cs.campaign_id
LEFT JOIN (
  SELECT
    campaign_id,
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE lead_temperature IN ('hot', 'warm')) AS qualified_leads,
    COUNT(*) FILTER (WHERE is_converted = true) AS conversions,
    SUM(conversion_value) FILTER (WHERE is_converted = true) AS revenue
  FROM public.enquiries
  WHERE lead_source = 'google_ads' AND campaign_id IS NOT NULL
  GROUP BY campaign_id
) lead_data ON COALESCE(e.campaign_id, cs.campaign_id) = lead_data.campaign_id
LEFT JOIN (
  SELECT campaign_id, SUM(spend) AS total_spend
  FROM public.campaign_spend
  GROUP BY campaign_id
) spend_data ON COALESCE(e.campaign_id, cs.campaign_id) = spend_data.campaign_id;

-- 6. Create daily_performance view
CREATE OR REPLACE VIEW public.daily_performance AS
SELECT
  d.date,
  COALESCE(lead_data.leads, 0) AS leads,
  COALESCE(lead_data.conversions, 0) AS conversions,
  COALESCE(lead_data.revenue, 0) AS revenue,
  COALESCE(spend_data.spend, 0) AS spend
FROM (
  SELECT DISTINCT date
  FROM (
    SELECT created_at::date AS date FROM public.enquiries WHERE lead_source = 'google_ads'
    UNION
    SELECT date FROM public.campaign_spend
  ) dates
) d
LEFT JOIN (
  SELECT
    created_at::date AS date,
    COUNT(*) AS leads,
    COUNT(*) FILTER (WHERE is_converted = true) AS conversions,
    SUM(conversion_value) FILTER (WHERE is_converted = true) AS revenue
  FROM public.enquiries
  WHERE lead_source = 'google_ads'
  GROUP BY created_at::date
) lead_data ON d.date = lead_data.date
LEFT JOIN (
  SELECT date, SUM(spend) AS spend
  FROM public.campaign_spend
  GROUP BY date
) spend_data ON d.date = spend_data.date
ORDER BY d.date DESC;

-- 7. Enable realtime for campaign_spend
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_spend;
