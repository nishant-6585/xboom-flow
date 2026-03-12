
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS personal_email TEXT,
  ADD COLUMN IF NOT EXISTS xboom_email TEXT,
  ADD COLUMN IF NOT EXISTS employee_type TEXT DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- Auto-generate employee numbers for existing rows
DO $$
DECLARE
  emp RECORD;
  counter INTEGER := 1;
BEGIN
  FOR emp IN SELECT id FROM public.employees WHERE employee_number IS NULL ORDER BY created_at LOOP
    UPDATE public.employees SET employee_number = 'EMP-' || LPAD(counter::TEXT, 4, '0') WHERE id = emp.id;
    counter := counter + 1;
  END LOOP;
END $$;

-- Create trigger to auto-generate employee_number on insert
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
      CASE WHEN employee_number ~ '^EMP-[0-9]+$'
        THEN CAST(SUBSTRING(employee_number FROM 5) AS INTEGER) ELSE 0 END
    ), 0) + 1 INTO next_num FROM public.employees;
    new_emp_number := 'EMP-' || LPAD(next_num::TEXT, 4, '0');
    WHILE EXISTS (SELECT 1 FROM public.employees WHERE employee_number = new_emp_number) LOOP
      next_num := next_num + 1;
      new_emp_number := 'EMP-' || LPAD(next_num::TEXT, 4, '0');
    END LOOP;
    NEW.employee_number := new_emp_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_employee_number ON public.employees;
CREATE TRIGGER trg_generate_employee_number
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.generate_employee_number();
