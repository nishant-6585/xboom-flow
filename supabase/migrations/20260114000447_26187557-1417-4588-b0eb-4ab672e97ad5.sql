-- Create trigger function to award points when pipeline order is created
CREATE OR REPLACE FUNCTION public.award_points_on_pipeline_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    point_value INTEGER := 5;
    pipeline_value NUMERIC;
BEGIN
    -- Base points for creating a pipeline order
    INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
    VALUES (
        NEW.sales_person_id,
        point_value,
        'pipeline_created',
        'Points for adding pipeline: ' || NEW.product_name || ' for ' || NEW.customer_name,
        NEW.id
    );
    
    -- Bonus points based on expected pipeline value (1 point per 25,000)
    pipeline_value := COALESCE(NEW.expected_price, 0);
    IF pipeline_value > 0 THEN
        INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
        VALUES (
            NEW.sales_person_id,
            GREATEST(1, FLOOR(pipeline_value / 25000))::INTEGER,
            'pipeline_value',
            'Pipeline value bonus (₹' || pipeline_value::TEXT || ') for ' || NEW.customer_name,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on pipeline_orders table
DROP TRIGGER IF EXISTS trigger_award_points_on_pipeline_create ON public.pipeline_orders;
CREATE TRIGGER trigger_award_points_on_pipeline_create
    AFTER INSERT ON public.pipeline_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.award_points_on_pipeline_create();