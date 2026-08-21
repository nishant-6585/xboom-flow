-- =====================================================
-- Backfill orders.supplier_id from supplier_name
-- =====================================================
-- orders.supplier_id has been a real FK to suppliers since 20260104220026, but
-- the procurement supplier picker only ever wrote supplier_name. The supplier
-- ledger therefore joined orders to suppliers on a name string, so a rename or a
-- typo silently dropped orders out of that supplier's payable balance.
--
-- The application now writes supplier_id. This backfills historical rows.

-- Only backfill where the trimmed, case-insensitive name resolves to EXACTLY ONE
-- supplier. Ambiguous names are deliberately left NULL rather than guessed —
-- the ledger falls back to name matching for those and flags them.
WITH unique_matches AS (
  SELECT lower(btrim(name)) AS norm_name, min(id) AS supplier_id
  FROM public.suppliers
  WHERE name IS NOT NULL AND btrim(name) <> ''
  GROUP BY lower(btrim(name))
  HAVING count(*) = 1
)
UPDATE public.orders o
SET supplier_id = m.supplier_id
FROM unique_matches m
WHERE o.supplier_id IS NULL
  AND o.supplier_name IS NOT NULL
  AND lower(btrim(o.supplier_name)) = m.norm_name;

-- The ledger and dashboards filter orders by supplier; without this the join
-- degrades to a sequential scan as the orders table grows.
CREATE INDEX IF NOT EXISTS idx_orders_supplier_id
  ON public.orders(supplier_id)
  WHERE supplier_id IS NOT NULL;
