
-- Add partial unique index to prevent duplicate pending correction requests for same attendance log
CREATE UNIQUE INDEX idx_unique_pending_correction_per_log
ON public.attendance_correction_requests (attendance_log_id)
WHERE status = 'pending';
