CREATE OR REPLACE FUNCTION public.get_order_confirmation_details(p_order_id uuid)
RETURNS TABLE (
  confirmation_status text,
  confirmed_at timestamptz,
  contact_name text,
  contact_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
       public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'supply_chain')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'hr')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    o.confirmation_status,
    o.confirmed_at,
    pc.full_name,
    pc.email
  FROM public.orders o
  LEFT JOIN public.portal_contacts pc ON pc.id = o.confirmed_by_contact
  WHERE o.id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_confirmation_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_confirmation_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_order_activity_timeline(p_order_id uuid)
RETURNS TABLE (
  event_id text,
  event_type text,
  action text,
  actor text,
  details text,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ord AS (
    SELECT id, order_number, customer_name, created_by, created_at,
           confirmed_at, confirmed_by_contact
    FROM public.orders WHERE id = p_order_id
  ),
  created_evt AS (
    SELECT
      'created:' || o.id::text AS event_id,
      'order' AS event_type,
      'Order created' AS action,
      COALESCE((SELECT name FROM public.profiles WHERE id = o.created_by), 'System') AS actor,
      'Order #' || COALESCE(o.order_number, '-') || ' created for ' || COALESCE(o.customer_name,'') AS details,
      o.created_at AS occurred_at
    FROM ord o
  ),
  confirmation_evt AS (
    SELECT
      'confirm:' || o.id::text AS event_id,
      'confirmation' AS event_type,
      'Customer confirmed order' AS action,
      COALESCE(pc.full_name, pc.email, 'Customer') AS actor,
      'Confirmed via customer portal' AS details,
      o.confirmed_at AS occurred_at
    FROM ord o
    LEFT JOIN public.portal_contacts pc ON pc.id = o.confirmed_by_contact
    WHERE o.confirmed_at IS NOT NULL
  ),
  edits AS (
    SELECT
      'edit:' || h.id::text, 'field_edit',
      'Edited ' || h.field_name,
      COALESCE(h.edited_by_name, 'Unknown'),
      COALESCE(NULLIF(h.old_value,''), '(empty)') || ' → ' || COALESCE(NULLIF(h.new_value,''),'(empty)'),
      h.edited_at
    FROM public.edit_history h
    WHERE h.table_name = 'orders' AND h.record_id = p_order_id
  ),
  item_edits AS (
    SELECT
      'item_edit:' || h.id::text, 'item_edit',
      'Item edit: ' || h.field_name,
      COALESCE(h.edited_by_name, 'Unknown'),
      COALESCE(NULLIF(h.old_value,''),'(empty)') || ' → ' || COALESCE(NULLIF(h.new_value,''),'(empty)'),
      h.edited_at
    FROM public.edit_history h
    JOIN public.order_items oi ON oi.id = h.record_id
    WHERE h.table_name = 'order_items' AND oi.order_id = p_order_id
  ),
  phone_audit AS (
    SELECT
      'phone:' || p.id::text, 'phone_change',
      'Phone updated',
      COALESCE(p.changed_by_name,'Unknown'),
      COALESCE(p.old_phone,'(empty)') || ' → ' || COALESCE(p.new_phone,'(empty)'),
      p.created_at
    FROM public.order_phone_audit_log p
    WHERE p.order_id = p_order_id
  ),
  attribution AS (
    SELECT
      'attr:' || a.id::text, 'attribution',
      'Salesperson attribution',
      COALESCE(a.changed_by_name,'System'),
      'Assigned to ' || COALESCE(a.to_sales_person_name,'(unassigned)')
        || CASE WHEN a.reason IS NOT NULL THEN ' — ' || a.reason ELSE '' END,
      a.created_at
    FROM public.sales_attribution_log a
    WHERE a.order_id = p_order_id
  ),
  proforma AS (
    SELECT
      'prof:' || pa.id::text, 'proforma',
      'Proforma ' || pa.action,
      COALESCE(pa.generated_by_name,'Unknown'),
      'Proforma ' || COALESCE(pa.proforma_number,'(no number)'),
      pa.created_at
    FROM public.proforma_audit_log pa
    WHERE pa.order_id = p_order_id
  ),
  invoices AS (
    SELECT
      'inv:' || i.id::text, 'invoice',
      'Invoice attached',
      COALESCE((SELECT name FROM public.profiles WHERE id = i.uploaded_by), 'System'),
      COALESCE(i.invoice_number, i.file_name, 'Invoice'),
      i.created_at
    FROM public.order_invoices i
    WHERE i.order_id = p_order_id
  ),
  procurement_links AS (
    SELECT
      'proc:' || l.id::text, 'procurement',
      'Procurement linked',
      COALESCE((SELECT name FROM public.profiles WHERE id = l.linked_by), 'System'),
      'Linked qty ' || COALESCE(l.quantity_used::text,'-')
        || CASE WHEN l.notes IS NOT NULL THEN ' — ' || l.notes ELSE '' END,
      l.linked_at
    FROM public.order_procurement_links l
    WHERE l.order_id = p_order_id
  ),
  woo_status AS (
    SELECT
      'woo:' || w.id::text, 'woo_status',
      'Website status change',
      COALESCE(w.changed_by_email, w.source, 'Website'),
      COALESCE(w.previous_status,'(none)') || ' → ' || COALESCE(w.new_status,'(none)')
        || CASE WHEN w.error_message IS NOT NULL THEN ' [error: ' || w.error_message || ']' ELSE '' END,
      w.created_at
    FROM public.woocommerce_order_status_logs w
    JOIN ord o ON o.order_number IS NOT NULL AND o.order_number = w.order_number
  )
  SELECT * FROM created_evt
  UNION ALL SELECT * FROM confirmation_evt
  UNION ALL SELECT * FROM edits
  UNION ALL SELECT * FROM item_edits
  UNION ALL SELECT * FROM phone_audit
  UNION ALL SELECT * FROM attribution
  UNION ALL SELECT * FROM proforma
  UNION ALL SELECT * FROM invoices
  UNION ALL SELECT * FROM procurement_links
  UNION ALL SELECT * FROM woo_status
  ORDER BY occurred_at DESC NULLS LAST
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_activity_timeline(uuid) TO authenticated;