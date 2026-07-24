
-- Harden public drone repair enquiry submissions: enforce field-level constraints
-- server-side so anon spam / oversized-PII inserts are rejected at RLS layer.
DROP POLICY IF EXISTS "Anyone can submit drone repair enquiry" ON public.drone_repair_enquiries;

CREATE POLICY "Public can submit validated drone repair enquiry"
ON public.drone_repair_enquiries
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Required, length-capped fields
  customer_name IS NOT NULL AND length(btrim(customer_name)) BETWEEN 2 AND 120
  AND phone IS NOT NULL AND length(btrim(phone)) BETWEEN 6 AND 20
  AND phone ~ '^[0-9+()\-\s]{6,20}$'
  AND drone_model IS NOT NULL AND length(btrim(drone_model)) BETWEEN 1 AND 120
  AND drone_category IS NOT NULL AND length(btrim(drone_category)) BETWEEN 1 AND 60
  AND issue_type IS NOT NULL AND length(btrim(issue_type)) BETWEEN 1 AND 80
  AND issue_description IS NOT NULL AND length(btrim(issue_description)) BETWEEN 5 AND 2000
  -- Optional fields: length-capped + basic email shape
  AND (email IS NULL OR (length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  AND (serial_number IS NULL OR length(serial_number) <= 120)
  AND (city IS NULL OR length(city) <= 80)
);
