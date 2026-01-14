-- Create function to notify on hot lead creation
CREATE OR REPLACE FUNCTION public.notify_on_hot_lead_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if this is a hot lead or mega deal
  IF NEW.lead_temperature = 'hot' OR NEW.is_mega_deal = true THEN
    INSERT INTO public.notifications (type, title, message, target_role)
    VALUES (
      CASE 
        WHEN NEW.is_mega_deal = true THEN 'mega_deal'
        ELSE 'hot_lead'
      END,
      CASE 
        WHEN NEW.is_mega_deal = true THEN '🌟 New Mega Deal!'
        ELSE '🔥 New Hot Lead!'
      END,
      format(
        '%s from %s - %s (%s qty). Sales: %s',
        NEW.customer_name,
        NEW.customer_company,
        NEW.product_name,
        NEW.quantity::text,
        NEW.sales_person_name
      ),
      NULL -- Visible to all roles
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create function to notify on hot pipeline order creation
CREATE OR REPLACE FUNCTION public.notify_on_hot_lead_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if this is a hot lead or mega deal
  IF NEW.lead_temperature = 'hot' OR NEW.is_mega_deal = true THEN
    INSERT INTO public.notifications (type, title, message, target_role)
    VALUES (
      CASE 
        WHEN NEW.is_mega_deal = true THEN 'mega_deal'
        ELSE 'hot_lead'
      END,
      CASE 
        WHEN NEW.is_mega_deal = true THEN '🌟 New Mega Deal in Pipeline!'
        ELSE '🔥 New Hot Lead in Pipeline!'
      END,
      format(
        '%s from %s - %s (%s qty). Expected: ₹%s. Sales: %s',
        NEW.customer_name,
        NEW.customer_company,
        NEW.product_name,
        NEW.quantity::text,
        COALESCE(NEW.expected_price, 0)::text,
        NEW.sales_person_name
      ),
      NULL -- Visible to all roles
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create function to notify when lead is marked as hot or mega deal (update)
CREATE OR REPLACE FUNCTION public.notify_on_lead_upgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if lead was just marked as hot (wasn't hot before)
  IF (NEW.lead_temperature = 'hot' AND (OLD.lead_temperature IS NULL OR OLD.lead_temperature != 'hot')) THEN
    INSERT INTO public.notifications (type, title, message, target_role)
    VALUES (
      'hot_lead',
      '🔥 Lead Upgraded to Hot!',
      format(
        '%s from %s - %s. Sales: %s',
        NEW.customer_name,
        NEW.customer_company,
        NEW.product_name,
        NEW.sales_person_name
      ),
      NULL
    );
  END IF;
  
  -- Check if lead was just marked as mega deal (wasn't mega deal before)
  IF (NEW.is_mega_deal = true AND (OLD.is_mega_deal IS NULL OR OLD.is_mega_deal = false)) THEN
    INSERT INTO public.notifications (type, title, message, target_role)
    VALUES (
      'mega_deal',
      '🌟 Marked as Mega Deal!',
      format(
        '%s from %s - %s. Sales: %s',
        NEW.customer_name,
        NEW.customer_company,
        NEW.product_name,
        NEW.sales_person_name
      ),
      NULL
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create triggers for enquiries table
DROP TRIGGER IF EXISTS notify_hot_lead_enquiry_insert ON public.enquiries;
CREATE TRIGGER notify_hot_lead_enquiry_insert
  AFTER INSERT ON public.enquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_hot_lead_enquiry();

DROP TRIGGER IF EXISTS notify_lead_upgrade_enquiry ON public.enquiries;
CREATE TRIGGER notify_lead_upgrade_enquiry
  AFTER UPDATE ON public.enquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_lead_upgrade();

-- Create triggers for pipeline_orders table
DROP TRIGGER IF EXISTS notify_hot_lead_pipeline_insert ON public.pipeline_orders;
CREATE TRIGGER notify_hot_lead_pipeline_insert
  AFTER INSERT ON public.pipeline_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_hot_lead_pipeline();

DROP TRIGGER IF EXISTS notify_lead_upgrade_pipeline ON public.pipeline_orders;
CREATE TRIGGER notify_lead_upgrade_pipeline
  AFTER UPDATE ON public.pipeline_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_lead_upgrade();