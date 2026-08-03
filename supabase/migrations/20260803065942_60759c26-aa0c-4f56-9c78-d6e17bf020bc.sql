ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;

ALTER TABLE public.leave_requests
ADD CONSTRAINT leave_requests_leave_type_check
CHECK (leave_type = ANY (ARRAY[
  'casual','sick','paid','EL','unpaid','half_day',
  'half_day_casual','half_day_sick','half_day_paid','half_day_EL','half_day_unpaid',
  'wfh','compoff','maternity'
]));

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_maternity_max_duration;

ALTER TABLE public.leave_requests
ADD CONSTRAINT leave_requests_maternity_max_duration
CHECK (leave_type <> 'maternity' OR end_date <= (start_date + INTERVAL '6 months'));