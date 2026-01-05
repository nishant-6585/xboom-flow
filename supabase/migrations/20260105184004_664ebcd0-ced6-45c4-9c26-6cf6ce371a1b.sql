-- Add priority and escalation fields to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS is_escalated boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS escalated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS escalated_by uuid,
ADD COLUMN IF NOT EXISTS escalation_reason text;

-- Create index for priority ordering
CREATE INDEX IF NOT EXISTS idx_orders_priority ON public.orders(priority);

-- Add RLS policy for sales to update escalation on their own orders
CREATE POLICY "Sales can escalate own orders"
ON public.orders
FOR UPDATE
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role) 
  AND sales_person_id = auth.uid()
)
WITH CHECK (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role) 
  AND sales_person_id = auth.uid()
);

-- Add notification insert policy for escalations
CREATE POLICY "System can create escalation notifications"
ON public.notifications
FOR INSERT
WITH CHECK (is_user_approved(auth.uid()));