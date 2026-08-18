-- Portal ticket assignment pool + round-robin auto-assignment
CREATE TABLE IF NOT EXISTS public.portal_ticket_assignee_pool (
  user_id          uuid PRIMARY KEY,
  slack_user_id    text,
  slack_handle     text,
  is_active        boolean     NOT NULL DEFAULT true,
  last_assigned_at timestamptz,
  assigned_count   integer     NOT NULL DEFAULT 0,
  added_at         timestamptz NOT NULL DEFAULT now(),
  synced_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.portal_ticket_assignee_pool IS
  'Staff eligible to own a portal ticket. Mirrors the membership of the Slack channel #customer-portal-ticket; maintained by sync-portal-ticket-assignees.';

CREATE INDEX IF NOT EXISTS idx_portal_ticket_pool_rotation
  ON public.portal_ticket_assignee_pool (last_assigned_at NULLS FIRST, added_at)
  WHERE is_active;

GRANT SELECT ON public.portal_ticket_assignee_pool TO authenticated;
GRANT ALL ON public.portal_ticket_assignee_pool TO service_role;

ALTER TABLE public.portal_ticket_assignee_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pool: staff read" ON public.portal_ticket_assignee_pool;
CREATE POLICY "pool: staff read"
  ON public.portal_ticket_assignee_pool FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  );

DROP FUNCTION IF EXISTS public.list_portal_ticket_assignees();
CREATE OR REPLACE FUNCTION public.list_portal_ticket_assignees()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  role text,
  in_slack_channel boolean,
  assigned_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_pool integer;
BEGIN
  IF v_uid IS NULL OR NOT (
       has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'support'::app_role)
    OR has_role(v_uid, 'sales'::app_role)
    OR has_role(v_uid, 'sales_manager'::app_role)
    OR has_role(v_uid, 'supply_chain'::app_role)) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_pool
    FROM public.portal_ticket_assignee_pool WHERE is_active;

  IF v_pool > 0 THEN
    RETURN QUERY
    SELECT p.user_id,
           COALESCE(NULLIF(pr.name, ''), pr.email, 'Unknown')::text,
           pr.email::text,
           COALESCE(
             (SELECT ur.role::text FROM public.user_roles ur
               WHERE ur.user_id = p.user_id
               ORDER BY CASE ur.role
                          WHEN 'supply_chain'::app_role  THEN 0
                          WHEN 'support'::app_role       THEN 1
                          WHEN 'sales_manager'::app_role THEN 2
                          WHEN 'admin'::app_role         THEN 3
                          ELSE 4 END
               LIMIT 1), 'supply_chain')::text,
           true,
           p.assigned_count
      FROM public.portal_ticket_assignee_pool p
      JOIN public.profiles pr ON pr.user_id = p.user_id
     WHERE p.is_active
     ORDER BY 2;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (pr.user_id)
         pr.user_id,
         COALESCE(NULLIF(pr.name, ''), pr.email, 'Unknown')::text,
         pr.email::text,
         ur.role::text,
         false,
         0
    FROM public.user_roles ur
    JOIN public.profiles pr ON pr.user_id = ur.user_id
   WHERE ur.role IN ('supply_chain'::app_role, 'sales_manager'::app_role,
                     'support'::app_role, 'admin'::app_role)
     AND pr.is_approved = true
   ORDER BY pr.user_id,
            CASE ur.role
              WHEN 'supply_chain'::app_role  THEN 0
              WHEN 'support'::app_role       THEN 1
              WHEN 'sales_manager'::app_role THEN 2
              ELSE 3
            END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_assignees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_assignees() TO authenticated;

CREATE OR REPLACE FUNCTION public.pick_next_portal_ticket_assignee()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid;
BEGIN
  SELECT p.user_id INTO v_user
    FROM public.portal_ticket_assignee_pool p
   WHERE p.is_active
   ORDER BY p.last_assigned_at NULLS FIRST, p.added_at, p.user_id
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.portal_ticket_assignee_pool
     SET last_assigned_at = now(),
         assigned_count   = assigned_count + 1
   WHERE user_id = v_user;

  RETURN v_user;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.portal_tickets_auto_assign()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    NEW.assigned_to := public.pick_next_portal_ticket_assignee();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_tickets_auto_assign ON public.portal_tickets;
CREATE TRIGGER trg_portal_tickets_auto_assign
  BEFORE INSERT ON public.portal_tickets
  FOR EACH ROW EXECUTE FUNCTION public.portal_tickets_auto_assign();

CREATE OR REPLACE FUNCTION public.sync_portal_ticket_assignee_pool(
  _members jsonb
)
RETURNS TABLE (added integer, kept integer, deactivated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_added integer := 0;
  v_kept integer := 0;
  v_deact integer := 0;
BEGIN
  CREATE TEMP TABLE _desired (
    user_id uuid PRIMARY KEY,
    slack_user_id text,
    slack_handle text
  ) ON COMMIT DROP;

  INSERT INTO _desired (user_id, slack_user_id, slack_handle)
  SELECT (m->>'user_id')::uuid, m->>'slack_user_id', m->>'slack_handle'
    FROM jsonb_array_elements(COALESCE(_members, '[]'::jsonb)) AS m
   WHERE (m->>'user_id') IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.portal_ticket_assignee_pool p
     SET is_active = false, synced_at = now()
   WHERE p.is_active
     AND NOT EXISTS (SELECT 1 FROM _desired d WHERE d.user_id = p.user_id);
  GET DIAGNOSTICS v_deact = ROW_COUNT;

  WITH upsert AS (
    INSERT INTO public.portal_ticket_assignee_pool AS p
      (user_id, slack_user_id, slack_handle, is_active, synced_at)
    SELECT d.user_id, d.slack_user_id, d.slack_handle, true, now()
      FROM _desired d
    ON CONFLICT (user_id) DO UPDATE
      SET slack_user_id = EXCLUDED.slack_user_id,
          slack_handle  = EXCLUDED.slack_handle,
          is_active     = true,
          synced_at     = now()
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted),
         count(*) FILTER (WHERE NOT inserted)
    INTO v_added, v_kept
    FROM upsert;

  UPDATE public.profiles pr
     SET slack_user_id = d.slack_user_id
    FROM _desired d
   WHERE pr.user_id = d.user_id
     AND d.slack_user_id IS NOT NULL
     AND pr.slack_user_id IS DISTINCT FROM d.slack_user_id;

  RETURN QUERY SELECT v_added, v_kept, v_deact;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_portal_ticket_assignee_pool(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_portal_ticket_assignee_pool(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.sync_portal_ticket_assignee_pool(jsonb) FROM authenticated;

DO $do$
BEGIN
  PERFORM cron.unschedule('sync-portal-ticket-assignees-6h');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'not scheduled';
END $do$;

SELECT cron.schedule(
  'sync-portal-ticket-assignees-6h',
  '15 */6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/sync-portal-ticket-assignees',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag',
        'x-cron-secret', public.get_cron_secret()
      ),
      body := '{}'::jsonb
    );
  $$
);