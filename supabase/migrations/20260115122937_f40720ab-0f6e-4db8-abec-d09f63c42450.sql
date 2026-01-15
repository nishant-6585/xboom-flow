-- Add unique constraint on order_number to prevent duplicates
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);

-- Add unique constraint on procurement_number to prevent duplicates  
ALTER TABLE public.inventory_procurements ADD CONSTRAINT inventory_procurements_procurement_number_unique UNIQUE (procurement_number);

-- Update the procurement number generation function to be more robust
CREATE OR REPLACE FUNCTION public.generate_procurement_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
  new_proc_number TEXT;
BEGIN
  IF NEW.procurement_number IS NULL THEN
    year_prefix := TO_CHAR(NOW(), 'YY');
    
    -- Lock to prevent race conditions
    LOCK TABLE public.inventory_procurements IN SHARE ROW EXCLUSIVE MODE;
    
    -- Get the max sequence number for this year
    SELECT COALESCE(
      MAX(
        CASE 
          WHEN procurement_number ~ ('^PROC' || year_prefix || '[0-9]+$') 
          THEN CAST(SUBSTRING(procurement_number FROM 7) AS INTEGER)
          ELSE 0
        END
      ), 0
    ) + 1
    INTO next_num
    FROM public.inventory_procurements
    WHERE procurement_number LIKE 'PROC' || year_prefix || '%';
    
    -- Generate the procurement number: PROC + YY + 5-digit sequence
    new_proc_number := 'PROC' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM public.inventory_procurements WHERE procurement_number = new_proc_number) LOOP
      next_num := next_num + 1;
      new_proc_number := 'PROC' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    END LOOP;
    
    NEW.procurement_number := new_proc_number;
  END IF;
  RETURN NEW;
END;
$function$;