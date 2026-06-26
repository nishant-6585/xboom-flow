
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
    SELECT id, order_number, customer_name, created_by, created_at
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
  edits AS (
    SELECT
      'edit:' || h.id::text AS event_id,
      'field_edit' AS event_type,
      'Edited ' || h.field_name AS action,
      COALESCE(h.edited_by_name, 'Unknown') AS actor,
      COALESCE(NULLIF(h.old_value,''), '(empty)') || ' → ' || COALESCE(NULLIF(h.new_value,''),'(empty)') AS details,
      h.edited_at AS occurred_at
    FROM public.edit_history h
    WHERE h.table_name = 'orders' AND h.record_id = p_order_id
  ),
  item_edits AS (
    SELECT
      'item_edit:' || h.id::text AS event_id,
      'item_edit' AS event_type,
      'Item edit: ' || h.field_name AS action,
      COALESCE(h.edited_by_name, 'Unknown') AS actor,
      COALESCE(NULLIF(h.old_value,''),'(empty)') || ' → ' || COALESCE(NULLIF(h.new_value,''),'(empty)') AS details,
      h.edited_at AS occurred_at
    FROM public.edit_history h
    JOIN public.order_items oi ON oi.id = h.record_id
    WHERE h.table_name = 'order_items' AND oi.order_id = p_order_id
  ),
  phone_audit AS (
    SELECT
      'phone:' || p.id::text AS event_id,
      'phone_change' AS event_type,
      'Phone updated' AS action,
      COALESCE(p.changed_by_name,'Unknown') AS actor,
      COALESCE(p.old_phone,'(empty)') || ' → ' || COALESCE(p.new_phone,'(empty)') AS details,
      p.created_at AS occurred_at
    FROM public.order_phone_audit_log p
    WHERE p.order_id = p_order_id
  ),
  attribution AS (
    SELECT
      'attr:' || a.id::text AS event_id,
      'attribution' AS event_type,
      'Salesperson attribution' AS action,
      COALESCE(a.changed_by_name,'System') AS actor,
      'Assigned to ' || COALESCE(a.to_sales_person_name,'(unassigned)')
        || CASE WHEN a.reason IS NOT NULL THEN ' — ' || a.reason ELSE '' END AS details,
      a.created_at AS occurred_at
    FROM public.sales_attribution_log a
    WHERE a.order_id = p_order_id
  ),
  proforma AS (
    SELECT
      'prof:' || pa.id::text AS event_id,
      'proforma' AS event_type,
      'Proforma ' || pa.action AS action,
      COALESCE(pa.generated_by_name,'Unknown') AS actor,
      'Proforma ' || COALESCE(pa.proforma_number,'(no number)') AS details,
      pa.created_at AS occurred_at
    FROM public.proforma_audit_log pa
    WHERE pa.order_id = p_order_id
  ),
  invoices AS (
    SELECT
      'inv:' || i.id::text AS event_id,
      'invoice' AS event_type,
      'Invoice attached' AS action,
      COALESCE((SELECT name FROM public.profiles WHERE id = i.uploaded_by), 'System') AS actor,
      COALESCE(i.invoice_number, i.file_name, 'Invoice') AS details,
      i.created_at AS occurred_at
    FROM public.order_invoices i
    WHERE i.order_id = p_order_id
  ),
  procurement_links AS (
    SELECT
      'proc:' || l.id::text AS event_id,
      'procurement' AS event_type,
      'Procurement linked' AS action,
      COALESCE((SELECT name FROM public.profiles WHERE id = l.linked_by), 'System') AS actor,
      'Linked qty ' || COALESCE(l.quantity_used::text,'-')
        || CASE WHEN l.notes IS NOT NULL THEN ' — ' || l.notes ELSE '' END AS details,
      l.linked_at AS occurred_at
    FROM public.order_procurement_links l
    WHERE l.order_id = p_order_id
  ),
  woo_status AS (
    SELECT
      'woo:' || w.id::text AS event_id,
      'woo_status' AS event_type,
      'Website status change' AS action,
      COALESCE(w.changed_by_email, w.source, 'Website') AS actor,
      COALESCE(w.previous_status,'(none)') || ' → ' || COALESCE(w.new_status,'(none)')
        || CASE WHEN w.error_message IS NOT NULL THEN ' [error: ' || w.error_message || ']' ELSE '' END AS details,
      w.created_at AS occurred_at
    FROM public.woocommerce_order_status_logs w
    JOIN ord o ON o.order_number IS NOT NULL AND o.order_number = w.order_number
  )
  SELECT * FROM created_evt
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
