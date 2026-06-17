ALTER TABLE public.pricelist
  ADD COLUMN IF NOT EXISTS woo_stock_status text;

COMMENT ON COLUMN public.pricelist.woo_stock_status IS
  'Raw stock_status value from WooCommerce (instock/outofstock/onbackorder). NULL for rows never synced from the website.';

CREATE INDEX IF NOT EXISTS pricelist_woo_stock_status_idx
  ON public.pricelist (woo_stock_status)
  WHERE woo_stock_status IS NOT NULL;