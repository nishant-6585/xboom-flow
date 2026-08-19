-- ============================================================================
-- Separate "in the Slack channel" from "takes a turn in the rotation"
-- ============================================================================
-- Channel membership and rotation membership are not the same thing. Admins and
-- sales managers are in #customer-portal-ticket for visibility, but handing them
-- customer tickets as the accountable owner is wrong — the portal queue is
-- supply chain's. Before this, everyone in the channel was assignable, so an
-- admin picked up roughly 1 in 6 tickets.
--
-- Adds is_assignable alongside is_active:
--   is_active     — are they still in the Slack channel? (managed by the sync)
--   is_assignable — should they take a turn?             (managed by a human)
--
-- The sync deliberately does NOT touch is_assignable, so an opt-out survives
-- every re-sync rather than being silently undone every 6 hours.
-- ============================================================================

ALTER TABLE public.portal_ticket_assignee_pool
  ADD COLUMN IF NOT EXISTS is_assignable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.portal_ticket_assignee_pool.is_assignable IS
  'Whether this member takes a turn in the round-robin. Independent of '
  'is_active (Slack channel membership) and never overwritten by the sync.';

-- Backfill by role rather than by name: the rotation is the supply-chain queue,
-- so anyone in the channel without supply_chain or support opts out by default.
-- Individuals can be toggled back on from the admin UI.
UPDATE public.portal_ticket_assignee_pool p
   SET is_assignable = false
 WHERE NOT EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id
      AND ur.role IN ('supply_chain'::app_role, 'support'::app_role)
 );

DROP INDEX IF EXISTS idx_portal_ticket_pool_rotation;
CREATE INDEX idx_portal_ticket_pool_rotation
  ON public.portal_ticket_assignee_pool (last_assigned_at NULLS FIRST, added_at)
  WHERE is_active AND is_assignable;

-- ---------------------------------------------------------------------------
-- Rotation skips opted-out members.
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
   WHERE p.is_active AND p.is_assignable
   ORDER BY p.last_assigned_at NULLS FIRST, p.added_at, p.user_id
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_user IS NULL THEN
    RETURN NULL;  -- nobody eligible: ticket stays unassigned, team still alerted
  END IF;

  UPDATE public.portal_ticket_assignee_pool
     SET last_assigned_at = now(),
         assigned_count   = assigned_count + 1
   WHERE user_id = v_user;

  RETURN v_user;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Dropdown shows only people who take a turn.
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
    FROM public.portal_ticket_assignee_pool WHERE is_active AND is_assignable;

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
     WHERE p.is_active AND p.is_assignable
     ORDER BY 2;
    RETURN;
  END IF;

  -- Nobody eligible: fall back to the role-based list so assignment stays
  -- possible. in_slack_channel = false flags this in the UI.
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
-- Full channel membership, including opted-out members, for the admin panel.
-- The dropdown hides them; the panel must still show them so an opt-out is
-- visible and reversible rather than looking like a failed sync.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_portal_ticket_pool()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  role text,
  slack_handle text,
  is_active boolean,
  is_assignable boolean,
  assigned_count integer,
  last_assigned_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (
       has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'support'::app_role)
    OR has_role(v_uid, 'sales_manager'::app_role)
    OR has_role(v_uid, 'supply_chain'::app_role)) THEN
    RETURN;
  END IF;

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
             LIMIT 1), '—')::text,
         p.slack_handle,
         p.is_active,
         p.is_assignable,
         p.assigned_count,
         p.last_assigned_at
    FROM public.portal_ticket_assignee_pool p
    JOIN public.profiles pr ON pr.user_id = p.user_id
   WHERE p.is_active
   ORDER BY p.is_assignable DESC, 2;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_pool() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_pool() TO authenticated;

-- ---------------------------------------------------------------------------
-- Toggle a member in or out of the rotation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_portal_ticket_assignable(
  _user_id    uuid,
  _assignable boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (has_role(v_uid, 'admin'::app_role)
       OR has_role(v_uid, 'supply_chain'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.portal_ticket_assignee_pool
     SET is_assignable = _assignable
   WHERE user_id = _user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'not in the assignment pool'; END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_portal_ticket_assignable(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_portal_ticket_assignable(uuid, boolean) TO authenticated;
