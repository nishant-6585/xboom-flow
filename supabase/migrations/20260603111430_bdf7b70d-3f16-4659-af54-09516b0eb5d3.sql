-- Trim trailing/leading whitespace causing duplicate "Narasimha" entries in dropdowns
UPDATE public.profiles SET name = trim(name) WHERE name IS NOT NULL AND name <> trim(name);
UPDATE public.call_logs SET sales_person_name = trim(sales_person_name) WHERE sales_person_name IS NOT NULL AND sales_person_name <> trim(sales_person_name);