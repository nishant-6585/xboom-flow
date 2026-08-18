-- ============================================================================
-- Portal ticket assignment pool + round-robin auto-assignment
-- ============================================================================
-- The "Assign to…" dropdown listed every internal user, and every new ticket
-- landed unassigned (9 of 18 at the time of writing). Both change here:
--
--   * The assignable pool becomes the membership of the Slack channel
--     #customer-portal-ticket (C0BR3CZ0KLL), synced by the
--     sync-portal-ticket-assignees edge function. Slack is the source of
--     truth — add someone to the channel and they become assignable.
--   * Every new ticket is auto-assigned on creation, round-robin across the
--     active pool, so a ticket always has a name against it.
--
-- Round-robin is implemented as least-recently-assigned rather than a modulo
-- cursor. It self-balances, survives people joining or leaving the pool
-- mid-rotation, and cannot hand every ticket to one person after a pool
-- change resets an index.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The pool
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_ticket_assignee_pool (
  user_id          uuid PRIMARY KEY,
  slack_user_id    text,
  slack_handle     text,
  is_active        boolean     NOT NULL DEFAULT true,
  -- Drives the rotation. NULL means "never assigned", which sorts first so a
  -- newly added member picks up the next ticket rather than waiting a lap.
  last_assigned_at timestamptz,
  assigned_count   integer     NOT NULL DEFAULT 0,
  added_at         timestamptz NOT NULL DEFAULT now(),
  synced_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.portal_ticket_assignee_pool IS
  'Staff eligible to own a portal ticket. Mirrors the membership of the Slack '
  'channel #customer-portal-ticket; maintained by sync-portal-ticket-assignees.';

CREATE INDEX IF NOT EXISTS idx_portal_ticket_pool_rotation
  ON public.portal_ticket_assignee_pool (last_assigned_at NULLS FIRST, added_at)
  WHERE is_active;

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

-- Writes are service-role only (the sync function). No client-side policy.

-- ---------------------------------------------------------------------------
-- 2. Assignable list = the pool. Replaces the role-based listing so the
--    dropdown shows Slack channel members only.
--    Falls back to the old role-based list ONLY while the pool is empty, so a
--    failed or not-yet-run first sync cannot leave the dropdown blank.
-- ---------------------------------------------------------------------------
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

  -- Pool empty (sync never ran / failed): fall back to the role-based list so
  -- assignment stays possible. in_slack_channel = false flags this in the UI.
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

-- ---------------------------------------------------------------------------
-- 3. Round-robin picker — least-recently-assigned wins.
--
--    FOR UPDATE SKIP LOCKED means two tickets created at the same instant take
--    two different people instead of both taking the head of the queue.
-- ---------------------------------------------------------------------------
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
    RETURN NULL;  -- empty pool: ticket stays unassigned, team is still alerted
  END IF;

  UPDATE public.portal_ticket_assignee_pool
     SET last_assigned_at = now(),
         assigned_count   = assigned_count + 1
   WHERE user_id = v_user;

  RETURN v_user;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Auto-assign on creation.
--
--    BEFORE INSERT, so assigned_to is already set when the AFTER INSERT
--    notifier runs — the creation alert then names the owner instead of
--    saying "Unassigned", and the owner is in the recipient set.
--    A ticket created with an explicit assignee is left alone.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. Pool sync target, called by the sync-portal-ticket-assignees function.
--    Takes the full desired membership and reconciles in one statement so the
--    pool can never be briefly empty mid-sync (which would strand the
--    round-robin picker).
--
--    Rotation state (last_assigned_at, assigned_count) is preserved for
--    members who stay, and for members who leave and later return.
-- ---------------------------------------------------------------------------
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

  -- Anyone no longer in the channel stops receiving new tickets. We keep the
  -- row (rather than deleting) so their rotation history survives a
  -- leave/rejoin, and so existing tickets still resolve their name.
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

  -- Opportunistically fix the profiles.slack_user_id gap while we are here:
  -- Slack DMs fall back to users.lookupByEmail without it, which silently
  -- fails when someone's Slack address differs from their app login.
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

-- ---------------------------------------------------------------------------
-- 6. Keep the pool in step with Slack. Membership changes are rare, so every
--    6 hours is plenty; the admin UI has a "Sync now" button for immediate
--    changes.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  PERFORM cron.unschedule('sync-portal-ticket-assignees-6h');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync-portal-ticket-assignees-6h not scheduled — nothing to unschedule';
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
