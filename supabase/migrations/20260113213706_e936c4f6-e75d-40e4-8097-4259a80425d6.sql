-- Fix search_path for generate_order_number function
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
BEGIN
  year_prefix := TO_CHAR(NOW(), 'YY');
  
  -- Get the max order number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.orders
  WHERE order_number LIKE 'ORD' || year_prefix || '%';
  
  -- Generate the order number: ORD + YY + 5-digit sequence
  NEW.order_number := 'ORD' || year_prefix || LPAD(next_num::TEXT, 5, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;