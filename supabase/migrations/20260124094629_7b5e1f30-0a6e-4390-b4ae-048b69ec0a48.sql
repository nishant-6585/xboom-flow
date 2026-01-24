-- Auto-create inventory_procurements when an order is created
CREATE OR REPLACE FUNCTION public.auto_create_procurement_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert a procurement record for this new order
  INSERT INTO public.inventory_procurements (
    product_name,
    product_category,
    product_code,
    quantity,
    supplier_id,
    supplier_name,
    payment_status,
    procurement_date,
    order_id,
    created_by
  )
  VALUES (
    NEW.product_name,
    COALESCE(NEW.product_category, 'Consumer Drones'),
    NEW.product_code,
    NEW.quantity,
    NEW.supplier_id,
    NEW.supplier_name,
    'pending',
    COALESCE(NEW.procurement_date, CURRENT_DATE)::date,
    NEW.id,
    NEW.created_by
  );
  
  RETURN NEW;
END;
$function$;

-- Create the trigger
DROP TRIGGER IF EXISTS create_procurement_on_order ON public.orders;
CREATE TRIGGER create_procurement_on_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_procurement_on_order();