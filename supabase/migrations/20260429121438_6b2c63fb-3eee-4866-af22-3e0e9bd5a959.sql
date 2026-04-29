
WITH allowed AS (
  SELECT a.uid AS user_id, a.uname AS name,
         ROW_NUMBER() OVER (ORDER BY a.uname) - 1 AS idx
  FROM public.allowed_website_lead_assignees() a
),
ordered AS (
  SELECT id,
         (ROW_NUMBER() OVER (ORDER BY woo_created_at NULLS LAST, id) - 1) % 4 AS slot
  FROM public.woocommerce_orders
  WHERE order_status NOT IN ('processing','completed','delivered')
)
UPDATE public.woocommerce_orders w
SET assigned_to = a.user_id,
    assigned_to_name = a.name,
    assigned_at = COALESCE(w.assigned_at, now())
FROM ordered o
JOIN allowed a ON a.idx = o.slot
WHERE w.id = o.id;

CREATE OR REPLACE FUNCTION public.enforce_woo_website_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_ids uuid[];
  v_count int;
  v_idx int;
  v_uid uuid;
  v_name text;
BEGIN
  IF NEW.order_status IN ('processing','completed','delivered') THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(a.uid) INTO v_allowed_ids
  FROM public.allowed_website_lead_assignees() a;

  v_count := COALESCE(array_length(v_allowed_ids, 1), 0);
  IF v_count = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL OR NOT (NEW.assigned_to = ANY(v_allowed_ids)) THEN
    UPDATE public.lead_assignment_state
    SET next_index = (next_index + 1) % v_count
    WHERE id = 1
    RETURNING ((next_index + v_count - 1) % v_count)
    INTO v_idx;

    SELECT a.uid, a.uname INTO v_uid, v_name
    FROM public.allowed_website_lead_assignees() a
    OFFSET v_idx LIMIT 1;

    NEW.assigned_to := v_uid;
    NEW.assigned_to_name := v_name;
    NEW.assigned_at := COALESCE(NEW.assigned_at, now());
  ELSE
    SELECT a.uname INTO v_name
    FROM public.allowed_website_lead_assignees() a
    WHERE a.uid = NEW.assigned_to;
    IF v_name IS NOT NULL THEN
      NEW.assigned_to_name := v_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_woo_website_lead_assignment ON public.woocommerce_orders;
CREATE TRIGGER trg_enforce_woo_website_lead_assignment
BEFORE INSERT OR UPDATE OF assigned_to, order_status ON public.woocommerce_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_woo_website_lead_assignment();
