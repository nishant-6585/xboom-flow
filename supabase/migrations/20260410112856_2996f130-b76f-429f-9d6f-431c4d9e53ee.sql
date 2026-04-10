
-- Create enquiry_messages table for back-and-forth communication
CREATE TABLE public.enquiry_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_role TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiry_messages_enquiry_id ON public.enquiry_messages(enquiry_id);
CREATE INDEX idx_enquiry_messages_created_at ON public.enquiry_messages(created_at);

ALTER TABLE public.enquiry_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view enquiry messages"
ON public.enquiry_messages FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Approved users can create enquiry messages"
ON public.enquiry_messages FOR INSERT TO authenticated
WITH CHECK (public.is_user_approved(auth.uid()) AND sender_id = auth.uid());

CREATE POLICY "Approved users can update own messages"
ON public.enquiry_messages FOR UPDATE TO authenticated
USING (sender_id = auth.uid() AND public.is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete enquiry messages"
ON public.enquiry_messages FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: auto-update updated_at
CREATE TRIGGER update_enquiry_messages_updated_at
BEFORE UPDATE ON public.enquiry_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for enquiry_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.enquiry_messages;

-- Function: notify salesperson when supply chain responds to enquiry
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- When enquiry status changes to 'responded' and responded_by is set
  IF NEW.status = 'responded' AND (OLD.status IS NULL OR OLD.status != 'responded') AND NEW.responded_by IS NOT NULL THEN
    INSERT INTO public.notifications (type, title, message, target_role, order_id)
    VALUES (
      'enquiry_response',
      '📋 Enquiry Response: ' || NEW.product_name,
      NEW.responded_by_name || ' has responded to your enquiry for ' || NEW.product_name || ' (Customer: ' || NEW.customer_name || '). Pricing: ' || COALESCE(NEW.response_pricing, 'N/A') || ', Availability: ' || COALESCE(NEW.response_availability, 'N/A'),
      'sales',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_enquiry_response
AFTER UPDATE ON public.enquiries
FOR EACH ROW EXECUTE FUNCTION public.notify_on_enquiry_response();

-- Function: notify on new enquiry message
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_enquiry RECORD;
  v_target_role TEXT;
BEGIN
  SELECT product_name, customer_name, sales_person_id, sales_person_name INTO v_enquiry
  FROM public.enquiries WHERE id = NEW.enquiry_id;

  -- If sender is sales, notify supply_chain. If sender is supply_chain/admin, notify sales
  IF NEW.sender_role = 'sales' THEN
    v_target_role := 'supply_chain';
  ELSE
    v_target_role := 'sales';
  END IF;

  INSERT INTO public.notifications (type, title, message, target_role, order_id)
  VALUES (
    'enquiry_message',
    '💬 New message on: ' || v_enquiry.product_name,
    NEW.sender_name || ' sent a message regarding ' || v_enquiry.product_name || ' (Customer: ' || v_enquiry.customer_name || ')',
    v_target_role,
    NULL
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_enquiry_message
AFTER INSERT ON public.enquiry_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_enquiry_message();
