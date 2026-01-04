-- Add escalation fields to enquiries table
ALTER TABLE public.enquiries
ADD COLUMN is_escalated boolean NOT NULL DEFAULT false,
ADD COLUMN escalated_at timestamp with time zone,
ADD COLUMN escalated_by uuid,
ADD COLUMN escalation_reason text;