-- =====================================================
-- Imports: FX conversion + landed cost
-- =====================================================
-- Two gaps this closes:
--
--   FX. `imports.total_amount` is denominated in `imports.currency`, but nothing
--   recorded the rate. Every rollup therefore either summed mixed currencies as
--   if they were one number, or had to show them in separate buckets. Capturing
--   the rate AT BOOKING (not at report time) is what makes a single comparable
--   INR figure possible, and it is the only way the number stays stable when the
--   rate moves next week.
--
--   Landed cost. `total_amount` is the FOB goods value only. Freight, insurance,
--   duty, clearing and port charges were nowhere, so true per-unit cost was
--   unknown and every margin computed against a procurement rate was overstated.

-- ---------- FX ----------
ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'INR',
  -- Units of base_currency per 1 unit of `currency`. 1.0 when they are the same.
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fx_rate_date DATE;

ALTER TABLE public.imports
  DROP CONSTRAINT IF EXISTS imports_fx_rate_positive;
ALTER TABLE public.imports
  ADD CONSTRAINT imports_fx_rate_positive CHECK (fx_rate > 0) NOT VALID;

-- A same-currency import cannot have a rate other than 1 — that combination is
-- always a data-entry error and it silently doubles the reported value.
ALTER TABLE public.imports
  DROP CONSTRAINT IF EXISTS imports_fx_rate_identity;
ALTER TABLE public.imports
  ADD CONSTRAINT imports_fx_rate_identity
  CHECK (currency <> base_currency OR fx_rate = 1) NOT VALID;

-- ---------- Landed cost components ----------
-- All of these are LOCAL charges, incurred and paid in base_currency (INR).
-- They are deliberately NOT multiplied by fx_rate.
ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS freight_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customs_duty NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clearing_agent_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS port_charges NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_landed_costs NUMERIC NOT NULL DEFAULT 0,
  -- IGST paid at the port is recorded for the return, but is an input tax
  -- credit — NOT a cost. It is excluded from total_landed_cost on purpose.
  ADD COLUMN IF NOT EXISTS igst_amount NUMERIC NOT NULL DEFAULT 0,
  -- Assessable value the duty was actually computed on. Customs uses CIF plus
  -- statutory loading, which is not the invoice value, so it cannot be derived.
  ADD COLUMN IF NOT EXISTS assessable_value NUMERIC;

-- Goods value expressed in the base currency.
ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC
  GENERATED ALWAYS AS (COALESCE(total_amount, 0) * COALESCE(fx_rate, 1)) STORED;

-- Everything it actually cost to get the goods on the shelf, in base currency.
ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS total_landed_cost NUMERIC
  GENERATED ALWAYS AS (
    COALESCE(total_amount, 0) * COALESCE(fx_rate, 1)
    + COALESCE(freight_cost, 0)
    + COALESCE(insurance_cost, 0)
    + COALESCE(customs_duty, 0)
    + COALESCE(clearing_agent_fee, 0)
    + COALESCE(port_charges, 0)
    + COALESCE(other_landed_costs, 0)
  ) STORED;

-- Backfill: rows already in INR are 1:1 and need no conversion.
UPDATE public.imports
SET fx_rate = 1, fx_rate_date = COALESCE(order_date, created_at::date)
WHERE currency = base_currency AND fx_rate IS DISTINCT FROM 1;

COMMENT ON COLUMN public.imports.fx_rate IS
  'Units of base_currency per 1 unit of currency, captured at booking time.';
COMMENT ON COLUMN public.imports.base_amount IS
  'Goods value in base_currency. Generated: total_amount * fx_rate.';
COMMENT ON COLUMN public.imports.total_landed_cost IS
  'Base-currency goods value plus all local charges. Excludes IGST, which is an input tax credit.';
COMMENT ON COLUMN public.imports.igst_amount IS
  'IGST paid at import. Recorded for the GST return; not part of landed cost.';