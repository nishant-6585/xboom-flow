-- Findings table
CREATE TABLE IF NOT EXISTS public.data_quality_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  field_name text NOT NULL DEFAULT 'customer_company',
  bad_value text NOT NULL,
  reason text NOT NULL,
  owner_user_id uuid,
  owner_name text,
  customer_name text,
  product_name text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_dqf_unresolved ON public.data_quality_findings(resolved, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_dqf_owner ON public.data_quality_findings(owner_user_id);

ALTER TABLE public.data_quality_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dqf_admin_finance_select" ON public.data_quality_findings;
CREATE POLICY "dqf_admin_finance_select" ON public.data_quality_findings
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "dqf_admin_update" ON public.data_quality_findings;
CREATE POLICY "dqf_admin_update" ON public.data_quality_findings
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Scanner function: returns number of NEW issues inserted
CREATE OR REPLACE FUNCTION public.scan_company_field_quality()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_count integer := 0;
BEGIN
  WITH candidates AS (
    -- ENQUIRIES
    SELECT 'enquiries'::text AS src, id AS sid, customer_company AS val,
           sales_person_id AS owner, sales_person_name AS oname,
           customer_name AS cname, product_name AS pname
    FROM public.enquiries
    WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
    UNION ALL
    SELECT 'prospects', id, COALESCE(customer_company, company),
           created_by, created_by_name, customer_name, product_name
    FROM public.prospects
    WHERE COALESCE(customer_company, company) IS NOT NULL 
      AND btrim(COALESCE(customer_company, company)) <> ''
    UNION ALL
    SELECT 'pipeline_orders', id, customer_company,
           COALESCE(sales_person_id, created_by), sales_person_name, customer_name, product_name
    FROM public.pipeline_orders
    WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
    UNION ALL
    SELECT 'call_logs', id, customer_company,
           sales_person_id, sales_person_name, customer_name, product_name
    FROM public.call_logs
    WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
    UNION ALL
    SELECT 'interakt_leads', id, COALESCE(customer_company, company),
           CASE WHEN sales_person_id ~ '^[0-9a-f]{8}-' THEN sales_person_id::uuid ELSE NULL END,
           sales_person_name, customer_name, product_name
    FROM public.interakt_leads
    WHERE COALESCE(customer_company, company) IS NOT NULL 
      AND btrim(COALESCE(customer_company, company)) <> ''
    UNION ALL
    SELECT 'email_leads', id, customer_company,
           COALESCE(sales_person_id, created_by), sales_person_name, customer_name, product_name
    FROM public.email_leads
    WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
    UNION ALL
    SELECT 'google_ads_leads', id, customer_company,
           sales_person_id, sales_person_name, customer_name, product_name
    FROM public.google_ads_leads
    WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
  ),
  flagged AS (
    SELECT 
      c.src, c.sid, c.val, c.owner, c.oname, c.cname, c.pname,
      CASE
        WHEN length(btrim(c.val)) < 3 THEN 'Too short (< 3 chars)'
        WHEN lower(btrim(c.val)) ~ '^[0-9 +\-().]+$' THEN 'Looks like a phone number'
        WHEN lower(btrim(c.val)) IN ('n/a','na','no','none','nil','null','-','--','test','testing','xyz','abc','tbd','xxx','unknown') THEN 'Generic placeholder'
        WHEN EXISTS (SELECT 1 FROM public.inventory i WHERE lower(btrim(i.name)) = lower(btrim(c.val))) THEN 'Matches inventory product name'
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pricelist')
             AND EXISTS (SELECT 1 FROM public.pricelist p WHERE lower(btrim(p.product_name)) = lower(btrim(c.val))) THEN 'Matches pricelist product name'
        WHEN c.pname IS NOT NULL AND lower(btrim(c.val)) = lower(btrim(c.pname)) THEN 'Equals this row''s product_name'
        WHEN lower(btrim(c.val)) ~ '(drone|fpv|combo|battery|propeller|gimbal|camera|rtk|gps module|mavic|avata|mini |air |phantom|matrice|inspire)' 
             AND length(btrim(c.val)) < 60 THEN 'Contains drone/product keyword'
        ELSE NULL
      END AS _reason
    FROM candidates c
  )
  INSERT INTO public.data_quality_findings 
    (source_table, source_id, field_name, bad_value, reason, owner_user_id, owner_name, customer_name, product_name)
  SELECT src, sid, 'customer_company', val, _reason, owner, oname, cname, pname
  FROM flagged
  WHERE _reason IS NOT NULL
  ON CONFLICT (source_table, source_id, field_name) 
  DO UPDATE SET 
    bad_value = EXCLUDED.bad_value,
    reason = EXCLUDED.reason,
    owner_user_id = EXCLUDED.owner_user_id,
    owner_name = EXCLUDED.owner_name,
    detected_at = now(),
    resolved = false;

  GET DIAGNOSTICS _new_count = ROW_COUNT;
  
  -- Auto-resolve findings whose source row no longer triggers (cleaned up)
  UPDATE public.data_quality_findings dqf
  SET resolved = true, resolved_at = now()
  WHERE NOT resolved
    AND NOT EXISTS (
      SELECT 1 FROM public.enquiries e WHERE dqf.source_table='enquiries' AND e.id=dqf.source_id AND lower(btrim(e.customer_company)) = lower(btrim(dqf.bad_value))
      UNION ALL SELECT 1 FROM public.prospects p WHERE dqf.source_table='prospects' AND p.id=dqf.source_id AND lower(btrim(COALESCE(p.customer_company,p.company))) = lower(btrim(dqf.bad_value))
      UNION ALL SELECT 1 FROM public.pipeline_orders po WHERE dqf.source_table='pipeline_orders' AND po.id=dqf.source_id AND lower(btrim(po.customer_company)) = lower(btrim(dqf.bad_value))
      UNION ALL SELECT 1 FROM public.call_logs cl WHERE dqf.source_table='call_logs' AND cl.id=dqf.source_id AND lower(btrim(cl.customer_company)) = lower(btrim(dqf.bad_value))
      UNION ALL SELECT 1 FROM public.interakt_leads il WHERE dqf.source_table='interakt_leads' AND il.id=dqf.source_id AND lower(btrim(COALESCE(il.customer_company,il.company))) = lower(btrim(dqf.bad_value))
      UNION ALL SELECT 1 FROM public.email_leads el WHERE dqf.source_table='email_leads' AND el.id=dqf.source_id AND lower(btrim(el.customer_company)) = lower(btrim(dqf.bad_value))
      UNION ALL SELECT 1 FROM public.google_ads_leads gl WHERE dqf.source_table='google_ads_leads' AND gl.id=dqf.source_id AND lower(btrim(gl.customer_company)) = lower(btrim(dqf.bad_value))
    );

  RETURN _new_count;
END;
$$;