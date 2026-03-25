ALTER TABLE public.call_logs 
  ADD COLUMN IF NOT EXISTS recording_stream_url text,
  ADD COLUMN IF NOT EXISTS recording_fetched_at timestamptz;