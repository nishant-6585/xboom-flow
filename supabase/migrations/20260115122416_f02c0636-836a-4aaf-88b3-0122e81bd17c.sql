-- Drop and recreate the generate_order_number function with proper sequential logic
CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
  new_order_number TEXT;
BEGIN
  year_prefix := TO_CHAR(NOW(), 'YY');
  
  -- Lock to prevent race conditions
  LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
  
  -- Get the max sequence number for this year (extract numeric part after ORD + YY)
  SELECT COALESCE(
    MAX(
      CASE 
        WHEN order_number ~ ('^ORD' || year_prefix || '[0-9]+$') 
        THEN CAST(SUBSTRING(order_number FROM 6) AS INTEGER)
        ELSE 0
      END
    ), 0
  ) + 1
  INTO next_num
  FROM public.orders
  WHERE order_number LIKE 'ORD' || year_prefix || '%';
  
  -- Generate the order number: ORD + YY + 5-digit sequence
  new_order_number := 'ORD' || year_prefix || LPAD(next_num::TEXT, 5, '0');
  
  -- Ensure uniqueness by checking if this number already exists
  WHILE EXISTS (SELECT 1 FROM public.orders WHERE order_number = new_order_number) LOOP
    next_num := next_num + 1;
    new_order_number := 'ORD' || year_prefix || LPAD(next_num::TEXT, 5, '0');
  END LOOP;
  
  NEW.order_number := new_order_number;
  
  RETURN NEW;
END;
$function$;