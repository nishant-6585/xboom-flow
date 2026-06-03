CREATE OR REPLACE FUNCTION public.enforce_woo_website_lead_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pick uuid := '74930912-193a-4081-a87f-46902ee96c4d'::uuid;
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.profiles WHERE user_id = v_pick;
  NEW.assigned_to := v_pick;
  NEW.assigned_to_name := COALESCE(v_name, 'Srishti Suman');
  NEW.assigned_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_woo_website_lead_assignment ON public.woocommerce_orders;
CREATE TRIGGER trg_enforce_woo_website_lead_assignment
BEFORE INSERT ON public.woocommerce_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_woo_website_lead_assignment();