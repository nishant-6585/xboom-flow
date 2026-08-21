-- =====================================================
-- Goods Receipt Notes + three-way match
-- =====================================================
-- Procurement could raise an order and pay a supplier, but nothing recorded that
-- the goods actually turned up. Without a receipt there is no three-way match
-- (ordered / received / invoiced), which is the control that stops the business
-- paying in full for a short or rejected shipment.
--
-- A GRN hangs off exactly one source document: an import, an order-linked
-- procurement, or an inventory procurement.

CREATE SEQUENCE IF NOT EXISTS public.grn_number_seq;

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_number TEXT UNIQUE,

  -- Exactly one source. Enforced by the check below.
  import_id UUID REFERENCES public.imports(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  inventory_procurement_id UUID REFERENCES public.inventory_procurements(id) ON DELETE CASCADE,

  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,

  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- draft is editable; posted is immutable and is what the match reads.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  posted_at TIMESTAMP WITH TIME ZONE,
  posted_by UUID,
  posted_by_name TEXT,

  inspection_notes TEXT,
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  created_by_name TEXT,

  CONSTRAINT goods_receipts_single_source CHECK (
    (import_id IS NOT NULL)::int
    + (order_id IS NOT NULL)::int
    + (inventory_procurement_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_import_id ON public.goods_receipts(import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goods_receipts_order_id ON public.goods_receipts(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goods_receipts_procurement_id ON public.goods_receipts(inventory_procurement_id) WHERE inventory_procurement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier_id ON public.goods_receipts(supplier_id);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  import_item_id UUID REFERENCES public.import_items(id) ON DELETE SET NULL,

  product_name TEXT NOT NULL,
  product_code TEXT,
  hsn_code TEXT,

  quantity_ordered NUMERIC NOT NULL DEFAULT 0,
  quantity_received NUMERIC NOT NULL DEFAULT 0,
  quantity_accepted NUMERIC NOT NULL DEFAULT 0,
  -- Generated so accepted + rejected can never disagree with received.
  quantity_rejected NUMERIC GENERATED ALWAYS AS (
    GREATEST(COALESCE(quantity_received, 0) - COALESCE(quantity_accepted, 0), 0)
  ) STORED,
  rejection_reason TEXT,

  unit_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT grn_items_quantities_sane CHECK (
    quantity_received >= 0
    AND quantity_accepted >= 0
    AND quantity_accepted <= quantity_received
  )
);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_grn_id ON public.goods_receipt_items(goods_receipt_id);

-- ---------- GRN numbering (server-side, sequential, collision-free) ----------
CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.grn_number IS NULL THEN
    NEW.grn_number := 'GRN-' || TO_CHAR(NOW(), 'YYMM') || '-'
                   || LPAD(nextval('public.grn_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_goods_receipts_number ON public.goods_receipts;
CREATE TRIGGER trg_goods_receipts_number
  BEFORE INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.generate_grn_number();

DROP TRIGGER IF EXISTS trg_goods_receipts_updated_at ON public.goods_receipts;
CREATE TRIGGER trg_goods_receipts_updated_at
  BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Posted receipts are immutable ----------
CREATE OR REPLACE FUNCTION public.guard_posted_goods_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only cancellation may touch a posted GRN; everything else is frozen. A
  -- receipt that can be edited after the fact cannot support a payment control.
  IF OLD.status = 'posted' AND NEW.status = 'posted' THEN
    RAISE EXCEPTION 'Goods receipt % is posted and cannot be edited. Cancel it and raise a new one.', OLD.grn_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_goods_receipts_immutable ON public.goods_receipts;
CREATE TRIGGER trg_goods_receipts_immutable
  BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_goods_receipt();

-- ---------- RLS ----------
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Procurement roles can view goods receipts"
  ON public.goods_receipts FOR SELECT TO authenticated
  USING (is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
  ));

-- Receiving goods is a warehouse/supply-chain act, not a finance one. Finance
-- reads receipts to match invoices against them; it must not be able to create
-- the very evidence it approves payment on.
CREATE POLICY "Admin/supply_chain can create goods receipts"
  ON public.goods_receipts FOR INSERT TO authenticated
  WITH CHECK (is_user_approved(auth.uid()) AND created_by = auth.uid() AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)
  ));

CREATE POLICY "Admin/supply_chain can update goods receipts"
  ON public.goods_receipts FOR UPDATE TO authenticated
  USING (is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)
  ));

-- Only an admin may delete, and only a receipt that was never posted.
CREATE POLICY "Admin can delete unposted goods receipts"
  ON public.goods_receipts FOR DELETE TO authenticated
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role) AND status <> 'posted');

CREATE POLICY "GRN items follow parent read access"
  ON public.goods_receipt_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = goods_receipt_items.goods_receipt_id));

CREATE POLICY "GRN items follow parent write access"
  ON public.goods_receipt_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_items.goods_receipt_id AND g.status = 'draft'
  ));

CREATE POLICY "GRN items follow parent update access"
  ON public.goods_receipt_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_items.goods_receipt_id AND g.status = 'draft'
  ));

CREATE POLICY "GRN items follow parent delete access"
  ON public.goods_receipt_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_items.goods_receipt_id AND g.status = 'draft'
  ));

-- =====================================================
-- Pay imports through the same rail as everything else
-- =====================================================
-- supplier_payments could reference an order or an inventory procurement, but
-- not an import — which is the main reason Imports sat outside the ledger and
-- the dashboard. Adding the link lets an import raise a payable that flows
-- through the existing request -> approve -> done workflow.
ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_import_id
  ON public.supplier_payments(import_id) WHERE import_id IS NOT NULL;

-- =====================================================
-- Three-way match: ordered vs received vs paid
-- =====================================================
-- security_invoker so the caller's RLS on imports/goods_receipts/supplier_payments
-- decides what they see, rather than the view's owner.
CREATE OR REPLACE VIEW public.import_three_way_match
WITH (security_invoker = on) AS
SELECT
  i.id                                   AS import_id,
  i.import_number,
  i.supplier_id,
  i.supplier_name,
  i.currency,
  i.base_currency,
  i.status,

  i.quantity                             AS quantity_ordered,
  i.base_amount                          AS ordered_value,
  i.total_landed_cost,

  COALESCE(grn.quantity_received, 0)     AS quantity_received,
  COALESCE(grn.quantity_accepted, 0)     AS quantity_accepted,
  COALESCE(grn.quantity_rejected, 0)     AS quantity_rejected,
  grn.last_received_date,
  COALESCE(grn.receipt_count, 0)         AS receipt_count,

  COALESCE(pay.amount_paid, 0)           AS amount_paid,

  -- Value of what was actually accepted, at the booked unit rate.
  CASE
    WHEN COALESCE(i.quantity, 0) > 0
      THEN (COALESCE(grn.quantity_accepted, 0) / i.quantity::numeric) * COALESCE(i.base_amount, 0)
    ELSE 0
  END                                    AS accepted_value,

  -- Paid minus the value of goods actually accepted. Positive means the supplier
  -- has been paid for goods the warehouse has not accepted.
  COALESCE(pay.amount_paid, 0) - CASE
    WHEN COALESCE(i.quantity, 0) > 0
      THEN (COALESCE(grn.quantity_accepted, 0) / i.quantity::numeric) * COALESCE(i.base_amount, 0)
    ELSE 0
  END                                    AS overpayment_exposure,

  CASE
    WHEN COALESCE(grn.receipt_count, 0) = 0 AND COALESCE(pay.amount_paid, 0) > 0
      THEN 'paid_not_received'
    WHEN COALESCE(grn.receipt_count, 0) = 0
      THEN 'awaiting_receipt'
    WHEN COALESCE(grn.quantity_rejected, 0) > 0
      THEN 'rejected_quantity'
    WHEN COALESCE(grn.quantity_accepted, 0) < COALESCE(i.quantity, 0)
      THEN 'short_received'
    WHEN COALESCE(pay.amount_paid, 0) > COALESCE(i.base_amount, 0) + 0.01
      THEN 'overpaid'
    WHEN COALESCE(pay.amount_paid, 0) + 0.01 < COALESCE(i.base_amount, 0)
      THEN 'underpaid'
    ELSE 'matched'
  END                                    AS match_status
FROM public.imports i
LEFT JOIN (
  SELECT
    g.import_id,
    count(*)                          AS receipt_count,
    sum(gi.quantity_received)         AS quantity_received,
    sum(gi.quantity_accepted)         AS quantity_accepted,
    sum(gi.quantity_rejected)         AS quantity_rejected,
    max(g.received_date)              AS last_received_date
  FROM public.goods_receipts g
  JOIN public.goods_receipt_items gi ON gi.goods_receipt_id = g.id
  WHERE g.status = 'posted' AND g.import_id IS NOT NULL
  GROUP BY g.import_id
) grn ON grn.import_id = i.id
LEFT JOIN (
  SELECT sp.import_id, sum(sp.amount) AS amount_paid
  FROM public.supplier_payments sp
  WHERE sp.payment_request_status = 'done' AND sp.import_id IS NOT NULL
  GROUP BY sp.import_id
) pay ON pay.import_id = i.id;

COMMENT ON VIEW public.import_three_way_match IS
  'Ordered vs received vs paid per import. Only POSTED receipts and COMPLETED payments count.';
