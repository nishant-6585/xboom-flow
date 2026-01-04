-- Add payment_due_date field to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_due_date DATE;

-- Add last_reminder_sent_at to track when reminders were sent
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE;