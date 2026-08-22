-- =========================================================================
-- First-answerer-owns-the-lead.
--
-- Until now the first assignment won permanently, whatever produced it. A
-- missed call with nobody on the line was round-robined to a rep, and that
-- rep kept the number for good — even if a different rep actually picked up
-- the next call and did the talking.
--
-- New model: a number's owner is either
--
--   PROVISIONAL — nobody in the assignable pool has spoken to this caller yet.
--                 The owner came from the round-robin off a missed or
--                 unattributable call. A placeholder, so the lead is never
--                 unowned.
--
--   EARNED      — a pool rep answered a call from this number, or a manager
--                 assigned it by hand.
--
-- The first pool rep to answer takes the number over, replacing a provisional
-- owner and inheriting every earlier call from that number. Later answers by
-- other reps do NOT steal it: first answerer wins. A manual assignment
-- outranks everything and is never overridden automatically.
--
-- This adds the two things that model needs:
--   1. assignment_reason — how the current owner got the number, which is what
--      distinguishes provisional from earned.
--   2. caller_last10 — a stored, indexed normalisation of caller_number.
--      Ownership is per-caller and every lookup keys on the trailing 10
--      digits; doing that with `ilike '%…'` forces a sequential scan on a
--      table already past 10k rows and growing with every call.
-- =========================================================================

-- ------------------------------------------------------------ 1. the column
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS assignment_reason text;

COMMENT ON COLUMN public.call_logs.assignment_reason IS
  'How this row''s owner was decided: manual (set by a human, outranks all) | receiver_in_sales (a pool rep answered — earned) | sticky_owner (inherited from the number''s existing owner) | round_robin_fallback (provisional placeholder) | unresolved. NULL on rows written before this column existed; treated as provisional.';

-- Only the earned reasons are ever searched for, and they are the minority of
-- rows, so a partial index keeps this small.
CREATE INDEX IF NOT EXISTS idx_call_logs_assignment_reason_earned
  ON public.call_logs (assignment_reason)
  WHERE assignment_reason IN ('manual', 'receiver_in_sales');

-- --------------------------------------------------- 2. the caller-key column
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS caller_last10 text
  GENERATED ALWAYS AS (
    right(regexp_replace(coalesce(caller_number, ''), '\D', '', 'g'), 10)
  ) STORED;

COMMENT ON COLUMN public.call_logs.caller_last10 IS
  'Trailing 10 digits of caller_number. The identity of a lead: rows stored as +918894656913 and 8894656913 share one key. Generated, so it cannot drift from caller_number.';

CREATE INDEX IF NOT EXISTS idx_call_logs_caller_last10
  ON public.call_logs (caller_last10);

-- Ownership lookups filter by caller and sort by recency.
CREATE INDEX IF NOT EXISTS idx_call_logs_caller_last10_created_at
  ON public.call_logs (caller_last10, created_at);

-- ------------------------------------------------------------- 3. backfill
DO $backfill$
DECLARE v_rows INT;
BEGIN
  UPDATE public.call_logs cl
     SET assignment_reason = 'receiver_in_sales'
   WHERE cl.assignment_reason IS NULL
     AND cl.sales_person_id IS NOT NULL
     AND cl.assigned_agent_phone IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.agent_user_mapping m
       WHERE m.is_active
         AND m.provider = 'myoperator'
         AND m.agent_phone = cl.assigned_agent_phone
         AND m.user_id = cl.sales_person_id
     );
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RAISE NOTICE 'Marked % existing call_logs row(s) as earned (owner answered the call). The rest stay provisional.', v_rows;
END
$backfill$;