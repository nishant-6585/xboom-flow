-- =========================================================================
-- Consolidate MyOperator call-log ownership.
--
-- Invariant being restored: one caller number, one owner, drawn from the
-- assignable rep pool.
--
-- What broke it: myoperator-webhook (the real-time path that inserts nearly
-- every call_logs row) picked an owner at random from *every* role='sales'
-- user and had no sticky lookup, so it re-picked on each call. One number
-- could therefore end up split across several reps — including support and
-- other non-selling staff who hold role='sales' but never work call leads.
-- The BEFORE INSERT trigger auto_assign_salesperson_on_call() then no-ops,
-- because it returns early when sales_person_id is already set.
--
-- The code changes (sticky lookup + pool restriction + round-robin instead of
-- random, in myoperator-webhook and sync-myoperator-logs) stop new damage.
-- This repairs the rows already written.
--
-- Repair rule, per affected number:
--   1. If any of its calls is already owned by a rep in the pool, that rep
--      takes the whole number (most recent such call wins, matching the
--      newest-wins sticky lookup). Legitimate ownership is preserved.
--   2. Otherwise the number is handed out round-robin across the pool.
--
-- Note: this touches sales_person_id / sales_person_name only — the columns
-- the call-log UI reads. The parallel assigned_to / contact_directory
-- ownership track (_a_sticky_call_logs) is deliberately left alone.
-- =========================================================================

DO $consolidate$
DECLARE
  v_pool_size INT;
  v_rows      INT;
BEGIN
  SELECT COUNT(*) INTO v_pool_size
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'sales'
  WHERE p.is_approved = true
    AND lower(COALESCE(p.name, '')) ~ '(suman das|narasimha|musthak|srishti|manoj kumar)';

  IF v_pool_size = 0 THEN
    RAISE NOTICE 'Assignable rep pool resolved to 0 users — skipping, nothing safe to assign to.';
    RETURN;
  END IF;

  WITH pool AS (
    -- Mirrors src/lib/assignableReps.ts and _shared/assignable-reps.ts.
    SELECT p.user_id,
           p.name,
           ROW_NUMBER() OVER (ORDER BY p.user_id) - 1 AS idx
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'sales'
    WHERE p.is_approved = true
      AND lower(COALESCE(p.name, '')) ~ '(suman das|narasimha|musthak|srishti|manoj kumar)'
  ),
  keyed AS (
    SELECT cl.id,
           right(regexp_replace(cl.caller_number, '\D', '', 'g'), 10) AS num10,
           cl.sales_person_id,
           cl.created_at
    FROM public.call_logs cl
    WHERE length(regexp_replace(COALESCE(cl.caller_number, ''), '\D', '', 'g')) >= 10
  ),
  broken AS (
    -- Split across owners, or owned by someone outside the pool.
    SELECT k.num10
    FROM keyed k
    GROUP BY k.num10
    HAVING COUNT(DISTINCT k.sales_person_id) > 1
        OR bool_or(
             k.sales_person_id IS NOT NULL
             AND k.sales_person_id NOT IN (SELECT user_id FROM pool)
           )
  ),
  preferred AS (
    SELECT DISTINCT ON (k.num10) k.num10, pl.user_id, pl.name
    FROM keyed k
    JOIN broken b ON b.num10 = k.num10
    JOIN pool pl  ON pl.user_id = k.sales_person_id
    ORDER BY k.num10, k.created_at DESC
  ),
  orphans AS (
    SELECT b.num10, ROW_NUMBER() OVER (ORDER BY b.num10) - 1 AS seq
    FROM broken b
    LEFT JOIN preferred p ON p.num10 = b.num10
    WHERE p.num10 IS NULL
  ),
  round_robin AS (
    SELECT o.num10, pl.user_id, pl.name
    FROM orphans o
    JOIN pool pl ON pl.idx = o.seq % v_pool_size
  ),
  final AS (
    SELECT num10, user_id, name FROM preferred
    UNION ALL
    SELECT num10, user_id, name FROM round_robin
  )
  UPDATE public.call_logs cl
  SET sales_person_id   = f.user_id,
      sales_person_name = f.name,
      updated_at        = now()
  FROM final f
  WHERE right(regexp_replace(COALESCE(cl.caller_number, ''), '\D', '', 'g'), 10) = f.num10
    AND cl.sales_person_id IS DISTINCT FROM f.user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Consolidated call_logs ownership: % rows updated across a pool of % reps.', v_rows, v_pool_size;
END
$consolidate$;