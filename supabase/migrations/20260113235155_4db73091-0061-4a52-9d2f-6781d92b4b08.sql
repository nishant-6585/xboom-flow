-- Create customer_testimonials table
CREATE TABLE public.customer_testimonials (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_company TEXT,
    testimonial TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    is_approved BOOLEAN DEFAULT false,
    submitted_by UUID NOT NULL,
    submitted_by_name TEXT NOT NULL,
    approved_by UUID,
    approved_by_name TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_testimonials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Sales can view all testimonials" ON public.customer_testimonials
    FOR SELECT USING (is_user_approved(auth.uid()));

CREATE POLICY "Sales can create testimonials" ON public.customer_testimonials
    FOR INSERT WITH CHECK (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admin can manage testimonials" ON public.customer_testimonials
    FOR ALL USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Function to award points for order creation
CREATE OR REPLACE FUNCTION public.award_points_on_order_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    point_value INTEGER := 10;
    order_value NUMERIC;
BEGIN
    -- Base points for creating an order
    INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
    VALUES (
        NEW.sales_person_id,
        point_value,
        'order_created',
        'Points for creating order ' || COALESCE(NEW.order_number, NEW.id::TEXT),
        NEW.id
    );
    
    -- Bonus points based on order value (1 point per 10,000)
    order_value := COALESCE(NEW.total_sales_amount, 0);
    IF order_value > 0 THEN
        INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
        VALUES (
            NEW.sales_person_id,
            GREATEST(1, FLOOR(order_value / 10000))::INTEGER,
            'order_value',
            'Value bonus for order ' || COALESCE(NEW.order_number, NEW.id::TEXT) || ' (₹' || order_value::TEXT || ')',
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Function to award points on delivery completion
CREATE OR REPLACE FUNCTION public.award_points_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    point_value INTEGER := 25;
BEGIN
    -- Only award if status changed to delivery_done
    IF NEW.status = 'delivery_done' AND (OLD.status IS NULL OR OLD.status != 'delivery_done') THEN
        INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
        VALUES (
            NEW.sales_person_id,
            point_value,
            'delivery_completed',
            'Delivery completed for order ' || COALESCE(NEW.order_number, NEW.id::TEXT),
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Function to award points for testimonial submission
CREATE OR REPLACE FUNCTION public.award_points_on_testimonial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    point_value INTEGER;
BEGIN
    -- Award points based on rating
    point_value := COALESCE(NEW.rating, 3) * 10; -- 10-50 points based on rating
    
    INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
    VALUES (
        NEW.submitted_by,
        point_value,
        'testimonial',
        'Customer testimonial from ' || NEW.customer_name || ' (' || COALESCE(NEW.rating, 0)::TEXT || ' stars)',
        NEW.id
    );
    
    RETURN NEW;
END;
$$;

-- Function to award bonus points when testimonial is approved
CREATE OR REPLACE FUNCTION public.award_points_on_testimonial_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Award bonus when testimonial gets approved
    IF NEW.is_approved = true AND (OLD.is_approved IS NULL OR OLD.is_approved = false) THEN
        INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
        VALUES (
            NEW.submitted_by,
            15,
            'testimonial_approved',
            'Testimonial approved from ' || NEW.customer_name,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER trigger_award_points_on_order_create
    AFTER INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.award_points_on_order_create();

CREATE TRIGGER trigger_award_points_on_delivery
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.award_points_on_delivery();

CREATE TRIGGER trigger_award_points_on_testimonial
    AFTER INSERT ON public.customer_testimonials
    FOR EACH ROW
    EXECUTE FUNCTION public.award_points_on_testimonial();

CREATE TRIGGER trigger_award_points_on_testimonial_approval
    AFTER UPDATE ON public.customer_testimonials
    FOR EACH ROW
    EXECUTE FUNCTION public.award_points_on_testimonial_approval();