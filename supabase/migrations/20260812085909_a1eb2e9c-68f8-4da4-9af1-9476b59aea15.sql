CREATE TABLE public.manychat_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manychat_contact_id text UNIQUE,
  customer_name text,
  first_name text,
  last_name text,
  phone_number text,
  country_code text,
  email text,
  city text,
  channel text,
  source text NOT NULL DEFAULT 'ManyChat',
  page_id text,
  flow_name text,
  product_name text,
  quantity integer,
  notes text,
  company text,
  status text NOT NULL DEFAULT 'new',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb,
  manychat_created_at timestamptz,
  last_interaction_at timestamptz,
  is_prospect boolean NOT NULL DEFAULT false,
  is_enquiry_converted boolean NOT NULL DEFAULT false,
  assigned_to uuid,
  assigned_to_name text,
  disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  disposition_reason_code text,
  disposition_reason_note text,
  disposition_at timestamptz,
  disposition_by uuid,
  disposition_by_name text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manychat_leads_created_at ON public.manychat_leads (created_at DESC);
CREATE INDEX idx_manychat_leads_assigned_to ON public.manychat_leads (assigned_to);
CREATE INDEX idx_manychat_leads_phone ON public.manychat_leads (phone_number);

GRANT SELECT, INSERT, UPDATE ON public.manychat_leads TO authenticated;
GRANT ALL ON public.manychat_leads TO service_role;

ALTER TABLE public.manychat_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized roles can view manychat leads"
ON public.manychat_leads FOR SELECT TO authenticated
USING (
  public.is_user_approved(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::app_role)
  )
);

CREATE POLICY "Authorized roles can insert manychat leads"
ON public.manychat_leads FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_approved(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  )
);

CREATE POLICY "Authorized roles can update manychat leads"
ON public.manychat_leads FOR UPDATE TO authenticated
USING (
  public.is_user_approved(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
  )
);

CREATE TRIGGER trg_manychat_leads_updated_at
BEFORE UPDATE ON public.manychat_leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.assign_manychat_lead_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next_user_id uuid;
  v_next_name text;
  v_last_assignee uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT assigned_to INTO v_last_assignee
  FROM public.manychat_leads
  WHERE assigned_to IS NOT NULL
  ORDER BY created_at DESC LIMIT 1;

  WITH pool AS (
    SELECT p.user_id, p.name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') !~* '(charles|fahad|umar|vishal)'
      AND public.is_user_available_on(p.user_id, CURRENT_DATE)
    GROUP BY p.user_id, p.name
  )
  SELECT user_id, name INTO v_next_user_id, v_next_name
  FROM pool
  WHERE v_last_assignee IS NULL OR user_id > v_last_assignee
  ORDER BY user_id LIMIT 1;

  IF v_next_user_id IS NULL THEN
    WITH pool AS (
      SELECT p.user_id, p.name
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.is_approved = true
        AND ur.role IN ('sales', 'sales_manager')
        AND COALESCE(p.name, '') !~* '(charles|fahad|umar|vishal)'
      GROUP BY p.user_id, p.name
    )
    SELECT user_id, name INTO v_next_user_id, v_next_name
    FROM pool ORDER BY user_id LIMIT 1;
  END IF;

  IF v_next_user_id IS NOT NULL THEN
    NEW.assigned_to := v_next_user_id;
    NEW.assigned_to_name := v_next_name;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_manychat_lead
BEFORE INSERT ON public.manychat_leads
FOR EACH ROW EXECUTE FUNCTION public.assign_manychat_lead_round_robin();

CREATE TABLE public.manychat_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL DEFAULT 'webhook',
  received integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  error text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manychat_sync_log_created_at ON public.manychat_sync_log (created_at DESC);

GRANT SELECT ON public.manychat_sync_log TO authenticated;
GRANT ALL ON public.manychat_sync_log TO service_role;

ALTER TABLE public.manychat_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view manychat sync log"
ON public.manychat_sync_log FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role));