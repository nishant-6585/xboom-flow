-- Restore the sales rep's "Request to claim this order" panel on website orders.
--
-- Migration 20260717095242 scoped the orders SELECT policy so sales reps only
-- see rows where sales_person_id = auth.uid(). Unattributed website orders are
-- owned by the SYSTEM user, so a rep's client-side lookup of the mirrored
-- internal order (OrderAttributionPanel / AttributionEvidencePicker) returns
-- 0 rows and the whole attribution section silently disappears — reps can no
-- longer raise an attribution request from the order dialog, and the evidence
-- picker loses the customer phone/email it needs for call-log matching.
--
-- Fix: a narrow SECURITY DEFINER lookup RPC (same pattern as
-- find_claimable_website_order) restricted to website-mirrored orders and to
-- the exact fields the attribution UI needs. The caller must already hold the
-- order's uuid or Woo external id (unguessable — obtained from surfaces the
-- rep can already read, e.g. woocommerce_orders), so this does not reopen
-- general order browsing for reps.

CREATE OR REPLACE FUNCTION public.get_website_order_attribution(
  p_internal_order_id uuid DEFAULT NULL,
  p_external_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  external_id text,
  order_number text,
  customer_name text,
  customer_phone text,
  customer_email text,
  total_sales_amount numeric,
  sales_person_id uuid,
  sales_person_name text,
  sales_attribution_locked boolean,
  sales_attribution_reason text,
  sales_attribution_reason_custom text,
  attributed_by_name text,
  attributed_at timestamptz,
  created_at timestamptz,
  order_date timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_user_approved(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supply_chain')
    OR public.can_attribute_website_order(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_internal_order_id IS NULL AND p_external_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.external_id,
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.customer_email,
    o.total_sales_amount,
    o.sales_person_id,
    o.sales_person_name,
    o.sales_attribution_locked,
    o.sales_attribution_reason,
    o.sales_attribution_reason_custom,
    o.attributed_by_name,
    o.attributed_at,
    o.created_at,
    o.order_date
  FROM public.orders o
  WHERE o.external_id IS NOT NULL
    AND (
      (p_internal_order_id IS NOT NULL AND o.id = p_internal_order_id)
      OR (p_internal_order_id IS NULL AND o.external_id = p_external_id)
    )
  ORDER BY o.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_website_order_attribution(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_website_order_attribution(uuid, text) TO authenticated;
