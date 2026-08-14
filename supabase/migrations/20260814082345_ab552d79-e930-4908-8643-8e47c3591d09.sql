CREATE OR REPLACE FUNCTION public.get_sales_dashboard_metrics(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_sales_person_id uuid DEFAULT NULL::uuid, p_include_website boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sys uuid := 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid;
  v_is_manager boolean;
  v_sp uuid;
  v_result jsonb;
  v_caller_role text;
BEGIN
  -- Service-role callers (scheduled reports / edge functions) have no auth.uid()
  -- but are trusted server-side and are treated as managers (org-wide view).
  v_caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'role')
  );

  IF auth.uid() IS NULL AND COALESCE(v_caller_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_is_manager := auth.uid() IS NULL
               OR public.has_role(auth.uid(), 'admin')
               OR public.has_role(auth.uid(), 'sales_manager');

  IF v_is_manager THEN
    v_sp := p_sales_person_id;
  ELSE
    v_sp := auth.uid();
  END IF;

  WITH
  lead_rows AS (
    SELECT 'enquiries'::text AS src, e.sales_person_id AS owner, e.created_at::date AS d,
           (e.lead_temperature = 'hot') AS is_hot, false AS is_website
      FROM enquiries e
    UNION ALL
    SELECT CASE WHEN c.lead_source = 'ElevenLabs' THEN 'elevenlabs' ELSE 'myoperator' END,
           c.sales_person_id, c.created_at::date,
           (c.lead_temperature = 'hot'), false
      FROM call_logs c
     WHERE COALESCE(c.is_enquiry_converted, false) = false
    UNION ALL
    SELECT 'email', el.sales_person_id, el.created_at::date, false, false
      FROM email_leads el
     WHERE COALESCE(el.is_enquiry_converted, false) = false
    UNION ALL
    SELECT 'interakt', il.sales_person_id, il.created_at::date, false, false
      FROM interakt_leads il
     WHERE COALESCE(il.is_enquiry_converted, false) = false
    UNION ALL
    SELECT CASE
             WHEN lower(COALESCE(l.source, l.form_type, '')) LIKE '%facebook%'
               OR lower(COALESCE(l.source, l.form_type, '')) LIKE '%meta%' THEN 'facebook'
             WHEN lower(COALESCE(l.source, l.form_type, '')) LIKE '%indiamart%' THEN 'indiamart'
             WHEN lower(COALESCE(l.source, l.form_type, '')) LIKE '%manychat%' THEN 'manychat'
             WHEN lower(COALESCE(l.source, l.form_type, '')) LIKE '%website%' THEN 'website'
             ELSE 'qforms'
           END,
           l.assigned_to, l.created_at::date,
           (l.lead_temperature = 'hot'),
           (lower(COALESCE(l.source, l.form_type, '')) LIKE '%website%')
      FROM leads l
     WHERE COALESCE(l.is_enquiry_converted, false) = false
    UNION ALL
    SELECT 'google_ads', g.sales_person_id, g.created_at::date,
           (g.lead_temperature = 'hot'), false
      FROM google_ads_leads g
    UNION ALL
    SELECT 'manychat', m.assigned_to, m.created_at::date, false, false
      FROM manychat_leads m
     WHERE COALESCE(m.is_enquiry_converted, false) = false
    UNION ALL
    SELECT 'abandoned_cart', w.assigned_to, w.created_at::date, false, true
      FROM woocommerce_orders w
     WHERE lower(COALESCE(w.order_status, '')) NOT IN
           ('pending','processing','on-hold','shipped','completed','delivered')
  ),
  leads_scoped AS (
    SELECT * FROM lead_rows
     WHERE (p_start IS NULL OR d >= p_start)
       AND (p_end   IS NULL OR d <= p_end)
       AND (v_sp IS NULL OR owner = v_sp)
       AND (
         p_include_website
         OR (is_website = false AND COALESCE(owner, v_sys) <> v_sys)
       )
  ),
  prospects_scoped AS (
    SELECT p.created_by AS owner, COALESCE(p.is_a_category, false) AS is_a
      FROM prospects p
     WHERE (p_start IS NULL OR p.created_at::date >= p_start)
       AND (p_end   IS NULL OR p.created_at::date <= p_end)
       AND (v_sp IS NULL OR p.created_by = v_sp)
  ),
  pipeline_scoped AS (
    SELECT po.sales_person_id AS owner, po.status,
           COALESCE(po.expected_price, 0) AS val
      FROM pipeline_orders po
     WHERE (p_start IS NULL OR po.created_at::date >= p_start)
       AND (p_end   IS NULL OR po.created_at::date <= p_end)
       AND (v_sp IS NULL OR po.sales_person_id = v_sp)
  ),
  orders_scoped AS (
    SELECT o.sales_person_id AS owner,
           COALESCE(o.total_sales_amount, 0) AS val
      FROM orders o
     WHERE o.deleted_at IS NULL
       AND (p_start IS NULL OR COALESCE(o.order_date::date, o.created_at::date) >= p_start)
       AND (p_end   IS NULL OR COALESCE(o.order_date::date, o.created_at::date) <= p_end)
       AND (v_sp IS NULL OR o.sales_person_id = v_sp)
       AND (
         p_include_website
         OR COALESCE(o.source, 'manual') <> 'website'
         OR COALESCE(o.sales_attribution_locked, false) = true
       )
       AND (p_include_website OR COALESCE(o.sales_person_id, v_sys) <> v_sys)
  ),
  t AS (
    SELECT
      (SELECT COUNT(*) FROM leads_scoped)                                     AS total_leads,
      (SELECT COUNT(*) FROM leads_scoped WHERE is_hot)                        AS hot_leads,
      (SELECT COUNT(*) FROM prospects_scoped)                                 AS total_prospects,
      (SELECT COUNT(*) FROM prospects_scoped WHERE is_a)                      AS a_category,
      (SELECT COUNT(*) FROM pipeline_scoped
        WHERE status NOT IN ('won','lost'))                                   AS pipeline_count,
      (SELECT COALESCE(SUM(val),0) FROM pipeline_scoped
        WHERE status NOT IN ('won','lost'))                                   AS pipeline_value,
      (SELECT COUNT(*) FROM pipeline_scoped WHERE status = 'won')             AS pipeline_won_count,
      (SELECT COALESCE(SUM(val),0) FROM pipeline_scoped WHERE status = 'won') AS pipeline_won_value,
      (SELECT COUNT(*) FROM orders_scoped)                                    AS orders_won,
      (SELECT COALESCE(SUM(val),0) FROM orders_scoped)                        AS revenue
  ),
  by_source AS (
    SELECT src, COUNT(*)::int AS count
      FROM leads_scoped
     GROUP BY src
  ),
  reps AS (
    SELECT pr.user_id, MAX(pr.name) AS name
      FROM profiles pr
      JOIN user_roles ur ON ur.user_id = pr.user_id
     WHERE ur.role IN ('sales','sales_manager')
       AND pr.is_approved = true
       AND pr.user_id <> v_sys
       AND (v_sp IS NULL OR pr.user_id = v_sp)
     GROUP BY pr.user_id
  ),
  person_sources AS (
    SELECT ls.owner, jsonb_object_agg(ls.src, ls.c) AS sources
      FROM (SELECT owner, src, COUNT(*)::int AS c FROM leads_scoped GROUP BY owner, src) ls
     GROUP BY ls.owner
  ),
  by_person AS (
    SELECT
      r.user_id,
      r.name,
      COALESCE((SELECT COUNT(*) FROM leads_scoped ls WHERE ls.owner = r.user_id), 0)::int AS leads,
      COALESCE((SELECT COUNT(*) FROM prospects_scoped ps WHERE ps.owner = r.user_id), 0)::int AS prospects,
      COALESCE((SELECT COUNT(*) FROM pipeline_scoped pl
                 WHERE pl.owner = r.user_id AND pl.status NOT IN ('won','lost')), 0)::int AS pipeline,
      COALESCE((SELECT SUM(pl.val) FROM pipeline_scoped pl
                 WHERE pl.owner = r.user_id AND pl.status NOT IN ('won','lost')), 0) AS pipeline_value,
      COALESCE((SELECT COUNT(*) FROM orders_scoped os WHERE os.owner = r.user_id), 0)::int AS orders_won,
      COALESCE((SELECT SUM(os.val) FROM orders_scoped os WHERE os.owner = r.user_id), 0) AS revenue,
      COALESCE((SELECT ps.sources FROM person_sources ps WHERE ps.owner = r.user_id), '{}'::jsonb) AS sources
      FROM reps r
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('start', p_start, 'end', p_end),
    'scope', jsonb_build_object(
       'sales_person_id', v_sp,
       'is_manager', v_is_manager,
       'include_website', p_include_website
    ),
    'totals', jsonb_build_object(
       'total_leads', t.total_leads,
       'hot_leads', t.hot_leads,
       'total_prospects', t.total_prospects,
       'a_category', t.a_category,
       'pipeline_count', t.pipeline_count,
       'pipeline_value', t.pipeline_value,
       'pipeline_won_count', t.pipeline_won_count,
       'pipeline_won_value', t.pipeline_won_value,
       'orders_won', t.orders_won,
       'revenue', t.revenue,
       'avg_deal', CASE WHEN t.orders_won > 0 THEN ROUND(t.revenue / t.orders_won, 2) ELSE 0 END,
       'win_rate', CASE WHEN t.total_leads > 0
                        THEN ROUND((t.orders_won::numeric / t.total_leads) * 100, 1)
                        ELSE 0 END,
       'lead_to_prospect', CASE WHEN t.total_leads > 0
                        THEN ROUND((t.total_prospects::numeric / t.total_leads) * 100, 1)
                        ELSE 0 END,
       'prospect_to_pipeline', CASE WHEN t.total_prospects > 0
                        THEN ROUND((t.pipeline_count::numeric / t.total_prospects) * 100, 1)
                        ELSE 0 END,
       'pipeline_to_won', CASE WHEN t.pipeline_count > 0
                        THEN ROUND((t.orders_won::numeric / t.pipeline_count) * 100, 1)
                        ELSE 0 END
    ),
    'by_source', COALESCE((SELECT jsonb_object_agg(src, count) FROM by_source), '{}'::jsonb),
    'by_person', COALESCE((
       SELECT jsonb_agg(to_jsonb(bp) ORDER BY bp.leads DESC, bp.revenue DESC) FROM by_person bp
    ), '[]'::jsonb)
  )
    INTO v_result
    FROM t;

  RETURN v_result;
END;
$function$;