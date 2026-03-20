-- Update the employee number generation function to start from 1 instead of 110
CREATE OR REPLACE FUNCTION public.generate_employee_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  new_emp_number TEXT;
BEGIN
  IF NEW.employee_number IS NULL THEN
    SELECT COALESCE(MAX(
      CASE 
        WHEN employee_number ~ '^\d+$' THEN CAST(employee_number AS INTEGER)
        WHEN employee_number ~ '^EMP-[0-9]+$' THEN CAST(SUBSTRING(employee_number FROM 5) AS INTEGER)
        ELSE 0 
      END
    ), 0) INTO next_num FROM public.employees;
    
    next_num := GREATEST(next_num + 1, 1);
    
    new_emp_number := next_num::TEXT;
    
    WHILE EXISTS (SELECT 1 FROM public.employees WHERE employee_number = new_emp_number) LOOP
      next_num := next_num + 1;
      new_emp_number := next_num::TEXT;
    END LOOP;
    
    NEW.employee_number := new_emp_number;
  END IF;
  RETURN NEW;
END;
$$;