
CREATE OR REPLACE FUNCTION public.validate_order_customer_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw text;
  v_has_plus boolean;
  v_digits text;
  v_len int;
BEGIN
  -- Only run when phone is being set/changed
  IF TG_OP = 'UPDATE'
     AND NEW.customer_phone IS NOT DISTINCT FROM OLD.customer_phone THEN
    RETURN NEW;
  END IF;

  v_raw := NULLIF(btrim(COALESCE(NEW.customer_phone, '')), '');
  IF v_raw IS NULL THEN
    NEW.customer_phone := NULL;
    RETURN NEW;
  END IF;

  -- Reject obvious junk characters
  IF v_raw !~ '^[+\d\s\-\(\)]+$' THEN
    RAISE EXCEPTION 'Invalid mobile number: only digits, spaces, +, -, () allowed'
      USING ERRCODE = '22023';
  END IF;

  v_has_plus := left(v_raw, 1) = '+';
  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  v_len := length(v_digits);

  IF v_len < 7 OR v_len > 15 THEN
    RAISE EXCEPTION 'Invalid mobile number: must contain 7 to 15 digits (got %)', v_len
      USING ERRCODE = '22023';
  END IF;

  -- Normalize: keep leading + when present
  NEW.customer_phone := CASE WHEN v_has_plus THEN '+' || v_digits ELSE v_digits END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_customer_phone ON public.orders;
CREATE TRIGGER trg_validate_order_customer_phone
BEFORE INSERT OR UPDATE OF customer_phone ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_customer_phone();
