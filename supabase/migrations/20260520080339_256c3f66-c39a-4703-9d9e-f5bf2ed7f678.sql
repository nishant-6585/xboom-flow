
-- ============================================================
-- Spare Parts Inventory Module
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.spare_part_stock_status AS ENUM ('IN_STOCK', 'LOW_STOCK', 'SOLD_OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.spare_part_change_type AS ENUM ('ADD', 'REMOVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.spare_part_change_reason AS ENUM ('PURCHASE', 'SALE', 'DAMAGE', 'MANUAL_ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sequence for part codes
CREATE SEQUENCE IF NOT EXISTS public.spare_parts_code_seq START 1000;

-- Main inventory table
CREATE TABLE IF NOT EXISTS public.spare_parts_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name TEXT NOT NULL,
  part_code TEXT UNIQUE,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  minimum_stock_threshold INTEGER NOT NULL DEFAULT 5,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendor_name TEXT,
  vendor_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  stock_status public.spare_part_stock_status NOT NULL DEFAULT 'IN_STOCK',
  profit_per_unit NUMERIC(12,2) GENERATED ALWAYS AS (selling_price - cost_price) STORED,
  profit_margin_percent NUMERIC(8,2) GENERATED ALWAYS AS (
    CASE WHEN cost_price > 0 THEN ((selling_price - cost_price) / cost_price) * 100 ELSE 0 END
  ) STORED,
  last_purchase_date DATE,
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spare_parts_status ON public.spare_parts_inventory(stock_status);
CREATE INDEX IF NOT EXISTS idx_spare_parts_vendor ON public.spare_parts_inventory(vendor_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_category ON public.spare_parts_inventory(category);

-- Transactions / movement log
CREATE TABLE IF NOT EXISTS public.spare_parts_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.spare_parts_inventory(id) ON DELETE CASCADE,
  change_type public.spare_part_change_type NOT NULL,
  quantity_change INTEGER NOT NULL CHECK (quantity_change > 0),
  reason public.spare_part_change_reason NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spare_parts_tx_part ON public.spare_parts_transactions(part_id);

-- ============================================================
-- Triggers / functions
-- ============================================================

-- Validation + auto part_code + auto stock_status + updated_at
CREATE OR REPLACE FUNCTION public.spare_parts_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- validations
  IF NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;
  IF NEW.cost_price < 0 OR NEW.selling_price < 0 THEN
    RAISE EXCEPTION 'Prices cannot be negative';
  END IF;
  IF NEW.selling_price < NEW.cost_price THEN
    RAISE EXCEPTION 'Selling price must be greater than or equal to cost price';
  END IF;
  IF NEW.minimum_stock_threshold < 0 THEN
    RAISE EXCEPTION 'Minimum stock threshold cannot be negative';
  END IF;

  -- auto part_code
  IF NEW.part_code IS NULL OR length(trim(NEW.part_code)) = 0 THEN
    NEW.part_code := 'SP-' || lpad(nextval('public.spare_parts_code_seq')::text, 6, '0');
  END IF;

  -- stock status
  IF NEW.quantity = 0 THEN
    NEW.stock_status := 'SOLD_OUT';
  ELSIF NEW.quantity <= NEW.minimum_stock_threshold THEN
    NEW.stock_status := 'LOW_STOCK';
  ELSE
    NEW.stock_status := 'IN_STOCK';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_spare_parts_before_write ON public.spare_parts_inventory;
CREATE TRIGGER trg_spare_parts_before_write
BEFORE INSERT OR UPDATE ON public.spare_parts_inventory
FOR EACH ROW EXECUTE FUNCTION public.spare_parts_before_write();

-- Notification on low/sold_out status change
CREATE OR REPLACE FUNCTION public.spare_parts_after_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  msg TEXT;
  title TEXT;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stock_status IS DISTINCT FROM OLD.stock_status THEN
    IF NEW.stock_status IN ('LOW_STOCK', 'SOLD_OUT') THEN
      title := CASE NEW.stock_status
        WHEN 'SOLD_OUT' THEN 'Spare part sold out'
        ELSE 'Spare part low on stock'
      END;
      msg := format('%s (%s) — %s units remaining',
        NEW.part_name, COALESCE(NEW.part_code, '—'), NEW.quantity);

      -- notify admin
      INSERT INTO public.notifications (type, title, message, target_role)
      VALUES ('spare_part_stock_alert', title, msg, 'admin');
      -- notify supply chain
      INSERT INTO public.notifications (type, title, message, target_role)
      VALUES ('spare_part_stock_alert', title, msg, 'supply_chain');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_spare_parts_after_status_change ON public.spare_parts_inventory;
CREATE TRIGGER trg_spare_parts_after_status_change
AFTER INSERT OR UPDATE OF stock_status ON public.spare_parts_inventory
FOR EACH ROW EXECUTE FUNCTION public.spare_parts_after_status_change();

-- Apply transaction to parent quantity
CREATE OR REPLACE FUNCTION public.spare_parts_apply_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  current_qty INTEGER;
  new_qty INTEGER;
BEGIN
  SELECT quantity INTO current_qty FROM public.spare_parts_inventory WHERE id = NEW.part_id FOR UPDATE;
  IF current_qty IS NULL THEN
    RAISE EXCEPTION 'Spare part not found';
  END IF;

  IF NEW.change_type = 'ADD' THEN
    new_qty := current_qty + NEW.quantity_change;
  ELSE
    new_qty := current_qty - NEW.quantity_change;
    IF new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: have % units, tried to remove %', current_qty, NEW.quantity_change;
    END IF;
  END IF;

  UPDATE public.spare_parts_inventory
    SET quantity = new_qty,
        last_purchase_date = CASE WHEN NEW.reason = 'PURCHASE' THEN CURRENT_DATE ELSE last_purchase_date END
    WHERE id = NEW.part_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_spare_parts_apply_transaction ON public.spare_parts_transactions;
CREATE TRIGGER trg_spare_parts_apply_transaction
AFTER INSERT ON public.spare_parts_transactions
FOR EACH ROW EXECUTE FUNCTION public.spare_parts_apply_transaction();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.spare_parts_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_parts_transactions ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, supply_chain, finance, sales
DROP POLICY IF EXISTS "spare_parts_select" ON public.spare_parts_inventory;
CREATE POLICY "spare_parts_select" ON public.spare_parts_inventory
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
);

-- INSERT / UPDATE / DELETE: admin + supply_chain
DROP POLICY IF EXISTS "spare_parts_insert" ON public.spare_parts_inventory;
CREATE POLICY "spare_parts_insert" ON public.spare_parts_inventory
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
);

DROP POLICY IF EXISTS "spare_parts_update" ON public.spare_parts_inventory;
CREATE POLICY "spare_parts_update" ON public.spare_parts_inventory
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
);

DROP POLICY IF EXISTS "spare_parts_delete" ON public.spare_parts_inventory;
CREATE POLICY "spare_parts_delete" ON public.spare_parts_inventory
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
);

-- Transactions: same SELECT scope as the part; INSERT by admin/supply_chain
DROP POLICY IF EXISTS "spare_parts_tx_select" ON public.spare_parts_transactions;
CREATE POLICY "spare_parts_tx_select" ON public.spare_parts_transactions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
);

DROP POLICY IF EXISTS "spare_parts_tx_insert" ON public.spare_parts_transactions;
CREATE POLICY "spare_parts_tx_insert" ON public.spare_parts_transactions
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
);
