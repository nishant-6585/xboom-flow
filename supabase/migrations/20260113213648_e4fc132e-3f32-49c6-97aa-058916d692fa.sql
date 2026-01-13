-- Add order_number column to orders table
ALTER TABLE public.orders 
ADD COLUMN order_number TEXT UNIQUE;

-- Create a function to generate the next order number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
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

-- Create trigger to auto-generate order number on insert
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL)
  EXECUTE FUNCTION public.generate_order_number();

-- Backfill existing orders with order numbers
DO $$
DECLARE
  order_rec RECORD;
  counter INTEGER := 1;
  year_prefix TEXT;
BEGIN
  year_prefix := TO_CHAR(NOW(), 'YY');
  
  FOR order_rec IN 
    SELECT id FROM public.orders 
    WHERE order_number IS NULL 
    ORDER BY created_at ASC
  LOOP
    UPDATE public.orders 
    SET order_number = 'ORD' || year_prefix || LPAD(counter::TEXT, 5, '0')
    WHERE id = order_rec.id;
    counter := counter + 1;
  END LOOP;
END $$;