-- Create trigger function to notify admins on new payment submission
CREATE OR REPLACE FUNCTION public.notify_admin_on_payment_submission()
RETURNS TRIGGER AS $$
DECLARE
  order_record RECORD;
BEGIN
  -- Get order details
  SELECT customer_name, customer_company, product_name
  INTO order_record
  FROM public.orders
  WHERE id = NEW.order_id;

  -- Create notification for admins
  INSERT INTO public.notifications (order_id, type, title, message, target_role)
  VALUES (
    NEW.order_id,
    'payment_submission',
    'New Payment Submitted',
    format(
      'Payment of ₹%s submitted for %s (%s) - %s. Awaiting approval.',
      NEW.amount::text,
      COALESCE(order_record.customer_name, 'Unknown'),
      COALESCE(order_record.customer_company, 'Unknown'),
      COALESCE(order_record.product_name, 'Unknown')
    ),
    'admin'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on payment_records table
DROP TRIGGER IF EXISTS on_payment_submission ON public.payment_records;
CREATE TRIGGER on_payment_submission
  AFTER INSERT ON public.payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_payment_submission();