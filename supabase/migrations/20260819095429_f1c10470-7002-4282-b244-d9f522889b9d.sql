-- ============================================================================
-- Portal ticket pool: separate "in the Slack channel" from "may own a ticket"
-- ============================================================================
-- Slack channel membership includes people who watch the channel but should
-- never own a ticket (admins, sales managers). is_active keeps mirroring the
-- channel; is_assignable decides who the dropdown offers and who the
-- round-robin picker can hand a ticket to.
-- ============================================================================

ALTER TABLE public.portal_ticket_assignee_pool
  ADD COLUMN IF NOT EXISTS is_assignable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.portal_ticket_assignee_pool.is_assignable IS
  'May this member own a ticket? is_active mirrors Slack channel membership; '
  'this is the ownership decision and is never overwritten by the sync.';

-- Backfill: ticket ownership belongs to supply chain / support.
UPDATE public.portal_ticket_assignee_pool p
   SET is_assignable = false
 WHERE NOT EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id
      AND ur.role IN ('supply_chain'::app_role, 'support'::app_role)
 );

DROP INDEX IF EXISTS idx_portal_ticket_pool_rotation;
CREATE INDEX IF NOT EXISTS idx_portal_ticket_pool_rotation
  ON public.portal_ticket_assignee_pool (last_assigned_at NULLS FIRST, added_at)
  WHERE is_active AND is_assignable;

-- ---------------------------------------------------------------------------
-- Dropdown: assignable pool members only.
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
    FROM public.portal_ticket_assignee_pool
   WHERE is_active AND is_assignable;

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
   WHERE ur.role IN ('supply_chain'::app_role, 'support'::app_role)
     AND pr.is_approved = true
   ORDER BY pr.user_id,
            CASE ur.role
              WHEN 'supply_chain'::app_role THEN 0
              ELSE 1
            END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_assignees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_assignees() TO authenticated;

-- ---------------------------------------------------------------------------
-- Round-robin picker: assignable members only.
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
    RETURN NULL;
  END IF;

  UPDATE public.portal_ticket_assignee_pool
     SET last_assigned_at = now(),
         assigned_count   = assigned_count + 1
   WHERE user_id = v_user;

  RETURN v_user;
END;
$fn$;
