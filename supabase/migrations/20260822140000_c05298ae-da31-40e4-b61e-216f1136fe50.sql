-- =========================================================================
-- Collapse the two call_logs ownership tracks into one.
--
-- Today a call row carries ownership twice:
--
--   sales_person_id / sales_person_name  — written by the edge functions
--     (myoperator-webhook, sync-myoperator-logs) and by managers in the call-log
--     UI. This is the only one anyone sees or edits.
--
--   assigned_to / assigned_to_name       — written by _a_sticky_call_logs from
--     contact_directory.current_owner. This track has always had correct
--     per-contact stickiness — it is simply wired to a column no screen reads,
--     so its correctness never reached anybody.
--
-- The two drift freely, and contact_directory (which routes web forms, email
-- leads and Google Ads leads to "the rep who already owns this contact") learns
-- ownership only from the track nobody maintains.
--
-- Resolution: sales_person_id stays authoritative — it is what the UI shows and
-- what managers actually curate — and assigned_to becomes a mirror of it that
-- cannot drift. contact_directory then learns from the same single owner, so a
-- caller who later submits a web form reaches the rep who already owns them.
--
-- Ordering note: the mirror is named _b_* so it runs after _a_sticky_call_logs
-- (triggers fire in name order). The sticky trigger still seeds assigned_to for
-- rows that arrive with no sales_person_id; the mirror overrides it whenever a
-- real owner is present.
-- =========================================================================

-- ------------------------------------------------------- 1. keep them in step
CREATE OR REPLACE FUNCTION public._b_mirror_call_logs_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sales_person_id IS NOT NULL THEN
    NEW.assigned_to      := NEW.sales_person_id;
    NEW.assigned_to_name := NEW.sales_person_name;

  ELSIF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    -- Nothing from the edge function, but _a_sticky_call_logs found a prior
    -- owner for this contact — adopt it so both columns still agree.
    NEW.sales_person_id   := NEW.assigned_to;
    NEW.sales_person_name := NEW.assigned_to_name;

  ELSIF TG_OP = 'UPDATE'
        AND OLD.sales_person_id IS NOT NULL
        AND NEW.sales_person_id IS NULL THEN
    -- Someone deliberately cleared the owner ("— Unassigned —" in the call-log
    -- UI). Mirror the clear rather than resurrecting it from assigned_to, which
    -- would make unassigning silently impossible. Narrow on purpose: unrelated
    -- updates to rows that only ever had assigned_to are left untouched.
    NEW.assigned_to      := NULL;
    NEW.assigned_to_name := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS _b_mirror_call_logs_owner ON public.call_logs;
CREATE TRIGGER _b_mirror_call_logs_owner
BEFORE INSERT OR UPDATE ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public._b_mirror_call_logs_owner();

-- ------------------------------- 2. push owner changes into contact_directory
-- _z_touchpoint_call_logs already does this on INSERT. Manual reassignment in
-- the UI is an UPDATE, which previously never reached contact_directory — so a
-- corrected owner was silently forgotten by every other lead source.
CREATE OR REPLACE FUNCTION public._z_sync_directory_owner_call_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _key TEXT;
BEGIN
  IF NEW.sales_person_id IS NULL THEN RETURN NEW; END IF;

  _key := public.compute_contact_key(
    COALESCE(NEW.full_number, NEW.caller_number), NEW.email);
  IF _key IS NULL THEN RETURN NEW; END IF;

  UPDATE public.contact_directory
     SET current_owner      = NEW.sales_person_id,
         current_owner_name = NEW.sales_person_name,
         updated_at         = now()
   WHERE contact_key = _key;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS _z_sync_directory_owner_call_logs ON public.call_logs;
CREATE TRIGGER _z_sync_directory_owner_call_logs
AFTER UPDATE ON public.call_logs
FOR EACH ROW
WHEN (OLD.sales_person_id IS DISTINCT FROM NEW.sales_person_id)
EXECUTE FUNCTION public._z_sync_directory_owner_call_logs();

-- --------------------------------------------------------------- 3. backfill
DO $backfill$
DECLARE
  v_mirrored INT;
  v_directory INT;
BEGIN
  -- Align assigned_to with the authoritative column on existing rows.
  UPDATE public.call_logs
     SET assigned_to      = sales_person_id,
         assigned_to_name = sales_person_name
   WHERE sales_person_id IS NOT NULL
     AND (assigned_to IS DISTINCT FROM sales_person_id
          OR assigned_to_name IS DISTINCT FROM sales_person_name);
  GET DIAGNOSTICS v_mirrored = ROW_COUNT;

  -- Teach contact_directory the current owner, newest call per contact wins.
  WITH latest AS (
    SELECT DISTINCT ON (public.compute_contact_key(COALESCE(cl.full_number, cl.caller_number), cl.email))
           public.compute_contact_key(COALESCE(cl.full_number, cl.caller_number), cl.email) AS contact_key,
           cl.sales_person_id,
           cl.sales_person_name
    FROM public.call_logs cl
    WHERE cl.sales_person_id IS NOT NULL
      AND public.compute_contact_key(COALESCE(cl.full_number, cl.caller_number), cl.email) IS NOT NULL
    ORDER BY public.compute_contact_key(COALESCE(cl.full_number, cl.caller_number), cl.email),
             cl.created_at DESC
  )
  UPDATE public.contact_directory d
     SET current_owner      = l.sales_person_id,
         current_owner_name = l.sales_person_name,
         updated_at         = now()
    FROM latest l
   WHERE d.contact_key = l.contact_key
     AND d.current_owner IS DISTINCT FROM l.sales_person_id;
  GET DIAGNOSTICS v_directory = ROW_COUNT;

  RAISE NOTICE 'Ownership collapse: % call_logs rows mirrored, % contact_directory rows re-owned.',
    v_mirrored, v_directory;
END
$backfill$;
