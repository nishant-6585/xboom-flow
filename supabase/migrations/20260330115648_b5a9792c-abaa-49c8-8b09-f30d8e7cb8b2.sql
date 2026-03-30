
-- Update trigger to also set order_outcome = 'won' and status = 'order_won' on conversion
CREATE OR REPLACE FUNCTION public.mark_enquiry_converted_on_order()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.enquiry_id IS NOT NULL THEN
    UPDATE public.enquiries
    SET is_converted = true,
        conversion_value = COALESCE(NEW.total_sales_amount, NEW.selling_price, 0),
        conversion_date = NOW(),
        order_outcome = 'won',
        status = 'order_won',
        outcome_updated_at = NOW()
    WHERE id = NEW.enquiry_id
      AND is_converted = false;
    
    -- Copy campaign_id to order if not set
    IF NEW.campaign_id IS NULL THEN
      NEW.campaign_id := (SELECT campaign_id FROM public.enquiries WHERE id = NEW.enquiry_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
