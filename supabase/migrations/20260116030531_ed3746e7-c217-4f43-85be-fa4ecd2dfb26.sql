-- Create slack_settings table for storing Slack webhook configuration
CREATE TABLE public.slack_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_url TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  notify_new_orders BOOLEAN NOT NULL DEFAULT true,
  notify_hot_leads BOOLEAN NOT NULL DEFAULT true,
  notify_payment_reminders BOOLEAN NOT NULL DEFAULT true,
  notify_status_changes BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.slack_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write slack settings
CREATE POLICY "Admins can read slack settings"
ON public.slack_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_user_approved(auth.uid()));

CREATE POLICY "Admins can insert slack settings"
ON public.slack_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.is_user_approved(auth.uid()));

CREATE POLICY "Admins can update slack settings"
ON public.slack_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_user_approved(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.is_user_approved(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_slack_settings_updated_at
BEFORE UPDATE ON public.slack_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row
INSERT INTO public.slack_settings (id) VALUES (gen_random_uuid());