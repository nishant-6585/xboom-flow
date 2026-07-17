CREATE OR REPLACE FUNCTION public.generate_payment_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_record RECORD;
BEGIN
  FOR order_record IN 
    SELECT o.id, o.customer_name, o.customer_company, o.product_name,
           o.payment_due_date, o.payment_status, o.total_sales_amount,
           o.amount_paid, o.last_reminder_sent_at
    FROM public.orders o
    WHERE o.payment_status IN ('pending', 'partial')
      AND o.payment_due_date IS NOT NULL
      AND o.status NOT IN ('cancelled', 'delivery_done')
      AND (o.last_reminder_sent_at IS NULL OR o.last_reminder_sent_at < now() - interval '1 day')
      AND o.payment_due_date <= now() + interval '7 days'
  LOOP
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
    UPDATE public.orders SET last_reminder_sent_at = now() WHERE id = order_record.id;
  END LOOP;
END;
$function$;