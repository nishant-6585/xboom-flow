-- Create sales_daily_activities table to track daily work
CREATE TABLE public.sales_daily_activities (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
    leads_handled INTEGER DEFAULT 0,
    channel TEXT,
    pipeline_created INTEGER DEFAULT 0,
    orders_won INTEGER DEFAULT 0,
    payment_expected_today NUMERIC DEFAULT 0,
    sweet_pipeline NUMERIC DEFAULT 0,
    monthly_pipeline NUMERIC DEFAULT 0,
    bonus_earned NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, activity_date)
);

-- Create sales_points table for gamification
CREATE TABLE public.sales_points (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    description TEXT,
    reference_id UUID,
    earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales_suggestions table
CREATE TABLE public.sales_suggestions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    user_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_response TEXT,
    responded_by UUID,
    responded_by_name TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create outbound_activities table for outbound sales tracking
CREATE TABLE public.outbound_activities (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    user_name TEXT NOT NULL,
    activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
    calls_made INTEGER DEFAULT 0,
    emails_sent INTEGER DEFAULT 0,
    meetings_scheduled INTEGER DEFAULT 0,
    demos_given INTEGER DEFAULT 0,
    follow_ups INTEGER DEFAULT 0,
    new_contacts INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, activity_date)
);

-- Enable RLS
ALTER TABLE public.sales_daily_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sales_daily_activities
CREATE POLICY "Sales can view own activities" ON public.sales_daily_activities
    FOR SELECT USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Sales can create own activities" ON public.sales_daily_activities
    FOR INSERT WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Sales can update own activities" ON public.sales_daily_activities
    FOR UPDATE USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Admin and supply chain can view all activities" ON public.sales_daily_activities
    FOR SELECT USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

CREATE POLICY "Admin can manage all activities" ON public.sales_daily_activities
    FOR ALL USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for sales_points
CREATE POLICY "Sales can view own points" ON public.sales_points
    FOR SELECT USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Admin and supply chain can view all points" ON public.sales_points
    FOR SELECT USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

CREATE POLICY "Admin can manage all points" ON public.sales_points
    FOR ALL USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can create points" ON public.sales_points
    FOR INSERT WITH CHECK (is_user_approved(auth.uid()));

-- RLS Policies for sales_suggestions
CREATE POLICY "Sales can view own suggestions" ON public.sales_suggestions
    FOR SELECT USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Sales can create own suggestions" ON public.sales_suggestions
    FOR INSERT WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Admin can view all suggestions" ON public.sales_suggestions
    FOR SELECT USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage all suggestions" ON public.sales_suggestions
    FOR ALL USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for outbound_activities
CREATE POLICY "Sales can view own outbound activities" ON public.outbound_activities
    FOR SELECT USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Sales can create own outbound activities" ON public.outbound_activities
    FOR INSERT WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Sales can update own outbound activities" ON public.outbound_activities
    FOR UPDATE USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND user_id = auth.uid());

CREATE POLICY "Admin and supply chain can view all outbound activities" ON public.outbound_activities
    FOR SELECT USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

CREATE POLICY "Admin can manage all outbound activities" ON public.outbound_activities
    FOR ALL USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Create function to calculate sales leaderboard
CREATE OR REPLACE FUNCTION public.get_sales_leaderboard(start_date DATE DEFAULT NULL, end_date DATE DEFAULT NULL)
RETURNS TABLE (
    user_id UUID,
    user_name TEXT,
    total_points INTEGER,
    leads_handled INTEGER,
    orders_won INTEGER,
    pipeline_created INTEGER,
    total_pipeline_value NUMERIC,
    rank INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH user_stats AS (
        SELECT 
            p.user_id,
            MAX(p.name) as user_name,
            COALESCE(SUM(sp.points), 0)::INTEGER as total_points,
            COALESCE(SUM(sda.leads_handled), 0)::INTEGER as leads_handled,
            COALESCE(SUM(sda.orders_won), 0)::INTEGER as orders_won,
            COALESCE(SUM(sda.pipeline_created), 0)::INTEGER as pipeline_created,
            COALESCE(SUM(sda.monthly_pipeline), 0) as total_pipeline_value
        FROM profiles p
        INNER JOIN user_roles ur ON p.user_id = ur.user_id AND ur.role = 'sales'
        LEFT JOIN sales_points sp ON p.user_id = sp.user_id 
            AND (start_date IS NULL OR sp.earned_at >= start_date)
            AND (end_date IS NULL OR sp.earned_at <= end_date)
        LEFT JOIN sales_daily_activities sda ON p.user_id = sda.user_id
            AND (start_date IS NULL OR sda.activity_date >= start_date)
            AND (end_date IS NULL OR sda.activity_date <= end_date)
        WHERE p.is_approved = true
        GROUP BY p.user_id
    )
    SELECT 
        us.user_id,
        us.user_name,
        us.total_points,
        us.leads_handled,
        us.orders_won,
        us.pipeline_created,
        us.total_pipeline_value,
        ROW_NUMBER() OVER (ORDER BY us.total_points DESC, us.orders_won DESC)::INTEGER as rank
    FROM user_stats us
    ORDER BY rank;
END;
$$;