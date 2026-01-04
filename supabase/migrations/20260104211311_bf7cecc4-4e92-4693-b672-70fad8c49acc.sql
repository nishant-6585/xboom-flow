-- Create notifications table for in-app payment reminders
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'payment_reminder',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  target_role TEXT -- null means visible to all, otherwise restrict to specific role
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admin can see all notifications
CREATE POLICY "Admins can view all notifications" 
ON public.notifications 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admin can update notifications (mark as read)
CREATE POLICY "Admins can update notifications" 
ON public.notifications 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Supply chain can see notifications targeted to them or all
CREATE POLICY "Supply chain can view relevant notifications" 
ON public.notifications 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'supply_chain'
  ) AND (target_role IS NULL OR target_role = 'supply_chain')
);

-- Create function to generate payment reminder notifications
CREATE OR REPLACE FUNCTION public.generate_payment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_record RECORD;
BEGIN
  -- Find orders with pending/partial payments due within 7 days or overdue
  FOR order_record IN 
    SELECT 
      o.id,
      o.customer_name,
      o.customer_company,
      o.product_name,
      o.payment_due_date,
      o.payment_status,
      o.total_sales_amount,
      o.amount_paid,
      o.last_reminder_sent_at
    FROM public.orders o
    WHERE o.payment_status IN ('pending', 'partial')
      AND o.payment_due_date IS NOT NULL
      AND o.status NOT IN ('cancelled', 'delivered')
      AND (o.last_reminder_sent_at IS NULL OR o.last_reminder_sent_at < now() - interval '1 day')
      AND o.payment_due_date <= now() + interval '7 days'
  LOOP
    -- Create notification
    INSERT INTO public.notifications (order_id, type, title, message, target_role)
    VALUES (
      order_record.id,
      'payment_reminder',
      CASE 
        WHEN order_record.payment_due_date < now()::date THEN 'OVERDUE: Payment Required'
        WHEN order_record.payment_due_date = now()::date THEN 'Due Today: Payment Required'
        ELSE 'Upcoming: Payment Due Soon'
      END,
      format(
        'Order for %s (%s) - %s. Amount: ₹%s, Paid: ₹%s, Due: %s',
        order_record.customer_name,
        order_record.customer_company,
        order_record.product_name,
        COALESCE(order_record.total_sales_amount, 0)::text,
        COALESCE(order_record.amount_paid, 0)::text,
        to_char(order_record.payment_due_date, 'DD Mon YYYY')
      ),
      'admin'
    );
    
    -- Update last reminder sent timestamp
    UPDATE public.orders 
    SET last_reminder_sent_at = now() 
    WHERE id = order_record.id;
  END LOOP;
END;
$$;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;