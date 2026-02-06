-- Add new role values to app_role enum
ALTER TYPE app_role ADD VALUE 'it';
ALTER TYPE app_role ADD VALUE 'marketing';

-- Add new visibility values to notice_visibility enum
ALTER TYPE notice_visibility ADD VALUE 'it';
ALTER TYPE notice_visibility ADD VALUE 'marketing';