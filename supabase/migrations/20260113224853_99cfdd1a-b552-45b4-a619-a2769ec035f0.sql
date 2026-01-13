-- Add order_id column to inventory_procurements for linking procurements to orders
ALTER TABLE public.inventory_procurements 
ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_inventory_procurements_order_id 
ON public.inventory_procurements(order_id);

-- Add comment for documentation
COMMENT ON COLUMN public.inventory_procurements.order_id IS 'Optional link to an order - mandatory for non-inventory procurements';