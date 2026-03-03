
ALTER TABLE public.leave_requests DROP CONSTRAINT leave_requests_leave_type_check;

ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_leave_type_check 
  CHECK (leave_type = ANY (ARRAY['casual'::text, 'sick'::text, 'paid'::text, 'unpaid'::text, 'half_day'::text, 'half_day_casual'::text, 'half_day_sick'::text, 'wfh'::text]));
