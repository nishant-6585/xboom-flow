
-- Create abandoned_carts table
CREATE TABLE public.abandoned_carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT,
  customer_name TEXT NOT NULL DEFAULT 'Unknown',
  customer_email TEXT,
  customer_phone TEXT,
  cart_items JSONB DEFAULT '[]'::jsonb,
  cart_value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  source TEXT DEFAULT 'xboom_website',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'recovered', 'expired')),
  recovered_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can view abandoned carts"
  ON public.abandoned_carts FOR SELECT TO authenticated USING (true);

-- Service role handles inserts/updates (via webhook edge function)
-- No insert/update policy for anon/authenticated - only service role

-- Index for lookups
CREATE INDEX idx_abandoned_carts_status ON public.abandoned_carts (status);
CREATE INDEX idx_abandoned_carts_email ON public.abandoned_carts (customer_email);
CREATE INDEX idx_abandoned_carts_created ON public.abandoned_carts (created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.abandoned_carts;

-- Trigger: on new abandoned cart → create follow-up + domain event
CREATE OR REPLACE FUNCTION public.handle_abandoned_cart_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create follow-up task for sales team
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

  -- Log domain event
  INSERT INTO public.domain_events (entity_type, entity_id, event_type, payload)
  VALUES (
    'abandoned_cart',
    NEW.id::text,
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
  -- Log error but don't block insert
  INSERT INTO public.domain_events (entity_type, entity_id, event_type, payload)
  VALUES ('abandoned_cart', NEW.id::text, 'abandoned_cart_automation_error', jsonb_build_object('error', SQLERRM));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abandoned_cart_automation ON public.abandoned_carts;
CREATE TRIGGER trg_abandoned_cart_automation
  AFTER INSERT ON public.abandoned_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_abandoned_cart_automation();

-- Recovery detection: when a paid WooCommerce order arrives, check for matching abandoned cart
CREATE OR REPLACE FUNCTION public.handle_abandoned_cart_recovery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  -- Only process paid orders
  IF NEW.payment_status = 'paid' AND NEW.customer_email IS NOT NULL AND NEW.customer_email != '' THEN
    -- Find matching active abandoned cart by email
    UPDATE public.abandoned_carts
    SET status = 'recovered',
        recovered_order_id = NEW.woo_order_id,
        updated_at = now()
    WHERE customer_email = NEW.customer_email
      AND status = 'active'
    RETURNING id INTO v_cart_id;

    IF v_cart_id IS NOT NULL THEN
      INSERT INTO public.domain_events (entity_type, entity_id, event_type, payload)
      VALUES (
        'abandoned_cart',
        v_cart_id::text,
        'abandoned_cart_recovered',
        jsonb_build_object(
          'order_id', NEW.woo_order_id,
          'customer_email', NEW.customer_email,
          'order_total', NEW.total_sales_amount
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abandoned_cart_recovery ON public.woocommerce_orders;
CREATE TRIGGER trg_abandoned_cart_recovery
  AFTER INSERT ON public.woocommerce_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_abandoned_cart_recovery();

-- Updated_at trigger
CREATE TRIGGER update_abandoned_carts_updated_at
  BEFORE UPDATE ON public.abandoned_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
