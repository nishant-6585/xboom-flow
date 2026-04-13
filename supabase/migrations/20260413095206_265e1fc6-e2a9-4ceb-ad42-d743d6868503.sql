CREATE OR REPLACE FUNCTION public.handle_abandoned_cart_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.followups (
    user_id, source_type, source_id, customer_name, customer_company,
    product_name, phone, email, is_a_category, followup_at,
    status, remark, created_by, created_by_name
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'lead',
    NEW.id::text,
    COALESCE(NEW.customer_name, 'Unknown'),
    '',
    'Abandoned Cart (₹' || COALESCE(NEW.cart_value::text, '0') || ')',
    NEW.customer_phone,
    NEW.customer_email,
    false,
    NOW() + INTERVAL '30 minutes',
    'pending',
    'Auto-created: Recover abandoned cart for ' || COALESCE(NEW.customer_name, 'Unknown') || ' — Cart value: ₹' || COALESCE(NEW.cart_value::text, '0'),
    '00000000-0000-0000-0000-000000000000',
    'System Automation'
  );

  INSERT INTO public.domain_events (entity_type, entity_id, event_type, payload)
  VALUES (
    'abandoned_cart',
    NEW.id,
    'abandoned_cart_created',
    jsonb_build_object(
      'customer_name', NEW.customer_name,
      'customer_email', NEW.customer_email,
      'customer_phone', NEW.customer_phone,
      'cart_value', NEW.cart_value,
      'cart_items', NEW.cart_items
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;