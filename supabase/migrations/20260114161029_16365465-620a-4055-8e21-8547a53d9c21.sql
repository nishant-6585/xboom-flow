-- Add meeting_link column to meetings table
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS meeting_link TEXT;