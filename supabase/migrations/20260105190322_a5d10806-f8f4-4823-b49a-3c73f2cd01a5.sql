-- Create inventory table to track stock levels
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  product_category text NOT NULL DEFAULT 'Consumer Drones',
  current_stock integer NOT NULL DEFAULT 0,
  min_stock_level integer DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_name, product_category)
);

-- Create inventory_transactions table to track all stock movements
CREATE TABLE public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  transaction_type text NOT NULL, -- 'procurement_in', 'order_fulfilled', 'customer_return', 'adjustment'
  quantity integer NOT NULL, -- positive for in, negative for out
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  reference_number text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory (all can view, supply_chain and admin can manage)
CREATE POLICY "All approved users can view inventory"
ON public.inventory FOR SELECT
USING (is_user_approved(auth.uid()));

CREATE POLICY "Supply chain can manage inventory"
ON public.inventory FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can manage inventory"
ON public.inventory FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for inventory_transactions
CREATE POLICY "All approved users can view inventory transactions"
ON public.inventory_transactions FOR SELECT
USING (is_user_approved(auth.uid()));

CREATE POLICY "Supply chain can create inventory transactions"
ON public.inventory_transactions FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can manage inventory transactions"
ON public.inventory_transactions FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Create indexes
CREATE INDEX idx_inventory_product ON public.inventory(product_name, product_category);
CREATE INDEX idx_inventory_transactions_inventory_id ON public.inventory_transactions(inventory_id);
CREATE INDEX idx_inventory_transactions_order_id ON public.inventory_transactions(order_id);
CREATE INDEX idx_inventory_transactions_type ON public.inventory_transactions(transaction_type);

-- Create trigger to update inventory stock on transaction insert
CREATE OR REPLACE FUNCTION public.update_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventory
  SET current_stock = current_stock + NEW.quantity,
      updated_at = now()
  WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_inventory_transaction_insert
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_inventory_stock();

-- Create trigger to update inventory on delete
CREATE OR REPLACE FUNCTION public.revert_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventory
  SET current_stock = current_stock - OLD.quantity,
      updated_at = now()
  WHERE id = OLD.inventory_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_inventory_transaction_delete
AFTER DELETE ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.revert_inventory_stock();

-- Add fulfilled_from_stock column to order_items to track if fulfilled from inventory
ALTER TABLE public.order_items ADD COLUMN fulfilled_from_stock boolean DEFAULT false;