-- Create ticket status enum
CREATE TYPE public.ticket_status AS ENUM ('open', 'assigned', 'in_progress', 'pending', 'resolved', 'closed');

-- Create ticket priority enum
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Create ticket category enum
CREATE TYPE public.ticket_category AS ENUM (
  'general_inquiry',
  'order_issue',
  'payment_issue',
  'delivery_issue',
  'supplier_issue',
  'procurement_request',
  'refund_request',
  'technical_support',
  'documentation',
  'other'
);

-- Create tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category ticket_category NOT NULL DEFAULT 'general_inquiry',
  priority ticket_priority NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'open',
  
  -- Requester info
  raised_by UUID NOT NULL,
  raised_by_name TEXT NOT NULL,
  raised_by_department app_role NOT NULL,
  
  -- Assignment
  assigned_to UUID,
  assigned_to_name TEXT,
  assigned_department app_role NOT NULL,
  assigned_at TIMESTAMPTZ,
  
  -- Linked entities
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE SET NULL,
  
  -- SLA tracking
  sla_due_at TIMESTAMPTZ,
  sla_response_at TIMESTAMPTZ,
  sla_status TEXT DEFAULT 'on_track',
  
  -- Resolution
  resolution_notes TEXT,
  resolved_by UUID,
  resolved_by_name TEXT,
  resolved_at TIMESTAMPTZ,
  
  -- Attachments
  attachment_urls TEXT[],
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ticket comments table
CREATE TABLE public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  commented_by UUID NOT NULL,
  commented_by_name TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  attachment_urls TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- Generate ticket number function
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
  new_ticket_number TEXT;
BEGIN
  IF NEW.ticket_number IS NULL THEN
    year_prefix := TO_CHAR(NOW(), 'YY');
    
    LOCK TABLE public.tickets IN SHARE ROW EXCLUSIVE MODE;
    
    SELECT COALESCE(
      MAX(
        CASE 
          WHEN ticket_number ~ ('^TKT' || year_prefix || '[0-9]+$') 
          THEN CAST(SUBSTRING(ticket_number FROM 6) AS INTEGER)
          ELSE 0
        END
      ), 0
    ) + 1
    INTO next_num
    FROM public.tickets
    WHERE ticket_number LIKE 'TKT' || year_prefix || '%';
    
    new_ticket_number := 'TKT' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    
    WHILE EXISTS (SELECT 1 FROM public.tickets WHERE ticket_number = new_ticket_number) LOOP
      next_num := next_num + 1;
      new_ticket_number := 'TKT' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    END LOOP;
    
    NEW.ticket_number := new_ticket_number;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for ticket number generation
CREATE TRIGGER generate_ticket_number_trigger
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_ticket_number();

-- Update timestamp trigger
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Calculate SLA due date based on priority
CREATE OR REPLACE FUNCTION public.calculate_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := CASE NEW.priority
      WHEN 'critical' THEN now() + interval '3 hours'
      WHEN 'high' THEN now() + interval '6 hours'
      WHEN 'medium' THEN now() + interval '24 hours'
      WHEN 'low' THEN now() + interval '48 hours'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_ticket_sla_trigger
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_ticket_sla();

-- RLS Policies for tickets
-- Users can view tickets they raised or are assigned to, admins can see all
CREATE POLICY "Users can view their tickets"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    raised_by = auth.uid()
    OR assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), assigned_department)
  );

CREATE POLICY "Authenticated users can create tickets"
  ON public.tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())
    AND raised_by = auth.uid()
  );

CREATE POLICY "Assigned users and admins can update tickets"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    raised_by = auth.uid()
    OR assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), assigned_department)
  );

-- Only admins can delete tickets
CREATE POLICY "Admins can delete tickets"
  ON public.tickets
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for comments
CREATE POLICY "Users can view comments on accessible tickets"
  ON public.ticket_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (
        t.raised_by = auth.uid()
        OR t.assigned_to = auth.uid()
        OR has_role(auth.uid(), 'admin')
        OR has_role(auth.uid(), t.assigned_department)
      )
    )
  );

CREATE POLICY "Authenticated users can add comments"
  ON public.ticket_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())
    AND commented_by = auth.uid()
  );

-- Create storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ticket attachments
CREATE POLICY "Authenticated users can upload ticket attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments' AND is_user_approved(auth.uid()));

CREATE POLICY "Users can view ticket attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'ticket-attachments' AND is_user_approved(auth.uid()));

CREATE POLICY "Users can delete their own ticket attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'ticket-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Create index for performance
CREATE INDEX idx_tickets_raised_by ON public.tickets(raised_by);
CREATE INDEX idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_assigned_department ON public.tickets(assigned_department);
CREATE INDEX idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);