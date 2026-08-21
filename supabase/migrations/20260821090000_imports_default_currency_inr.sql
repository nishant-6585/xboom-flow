-- =====================================================
-- Imports: make INR the base currency
-- =====================================================
-- The imports table shipped with DEFAULT 'USD' while every other money column in
-- the product is rupees. Combined with a hardcoded '$' in the Imports stat card
-- this produced INR amounts rendered as dollars. The UI now formats per-row
-- currency; this aligns the column default with the rest of the system.

-- 1. Backfill NULLs to 'USD' — NOT to 'INR'. A row with no currency was written
--    while the column default was 'USD', so 'USD' is what it actually meant.
--    Rewriting it to 'INR' would silently restate historical amounts.
UPDATE public.imports
SET currency = 'USD'
WHERE currency IS NULL;

-- 2. Currency is now mandatory and defaults to the base currency.
ALTER TABLE public.imports
  ALTER COLUMN currency SET DEFAULT 'INR',
  ALTER COLUMN currency SET NOT NULL;

-- 3. Constrain to the codes the UI offers, so a typo cannot create a currency
--    bucket nothing knows how to format. NOT VALID: applies to new and updated
--    rows without failing the migration on unexpected legacy data.
ALTER TABLE public.imports
  DROP CONSTRAINT IF EXISTS imports_currency_check;

ALTER TABLE public.imports
  ADD CONSTRAINT imports_currency_check
  CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP', 'CNY', 'AED'))
  NOT VALID;

-- Note: import_items carries no currency of its own — line items are always
-- denominated in the parent import's currency.
