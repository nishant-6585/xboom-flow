-- Add 'hr' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';

-- Add 'hr' to notice_visibility enum
ALTER TYPE public.notice_visibility ADD VALUE IF NOT EXISTS 'hr';