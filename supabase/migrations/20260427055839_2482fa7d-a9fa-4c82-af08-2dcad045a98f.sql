CREATE OR REPLACE FUNCTION public.handle_woocommerce_order_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_followup_id uuid;
BEGIN
  -- CASE 1: Payment pending → create follow-up for sales team
  IF NEW.payment_status = 'pending' THEN
    INSERT INTO public.followups (
      user_id, source_type, source_id, customer_name, customer_company,
      product_name, phone, email, is_a_category, followup_at, status,
      remark, created_by, created_by_name
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'lead', NEW.id::text,
      COALESCE(NEW.customer_name, 'Unknown'),
      COALESCE(NEW.customer_company, ''),
      COALESCE(NEW.product_name, 'WooCommerce Order'),
      NEW.customer_phone, NEW.customer_email, false,
      NOW() + INTERVAL '2 hours', 'pending',
      'Auto-created: Follow up on WooCommerce Order #' || COALESCE(NEW.order_number, NEW.woo_order_id) || ' (Payment Pending, Amount: ' || COALESCE(NEW.total_sales_amount::text, '0') || ' ' || COALESCE(NEW.currency, 'INR') || ')',
      '00000000-0000-0000-0000-000000000000',
      'System Automation'
    )
    RETURNING id INTO v_followup_id;

    INSERT INTO public.domain_events (entity_type, entity_id, event_type, payload)
    VALUES (
      'woocommerce_order', NEW.id, 'woo_order_followup_created',
      jsonb_build_object(
        'order_id', NEW.woo_order_id,
        'order_number', NEW.order_number,
        'followup_id', v_followup_id,
        'customer_name', NEW.customer_name,
        'payment_status', NEW.payment_status,
        'amount', NEW.total_sales_amount
      )
    );
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.domain_events (entity_type, entity_id, event_type, payload)
  VALUES (
    'woocommerce_order', NEW.id, 'woo_order_automation_error',
    jsonb_build_object('order_id', NEW.woo_order_id, 'error', SQLERRM)
  );
  RETURN NEW;
END;
$function$;