ALTER TABLE public.leave_requests
ALTER COLUMN total_days
SET EXPRESSION AS (
  CASE
    WHEN leave_type IN ('half_day', 'half_day_casual', 'half_day_sick', 'half_day_paid', 'half_day_EL', 'half_day_unpaid') THEN 0.5
    ELSE ((end_date - start_date) + 1)::numeric
  END
);