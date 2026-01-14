-- 1. Create sales_targets table for monthly/quarterly targets
CREATE TABLE public.sales_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_name TEXT NOT NULL,
    target_period TEXT NOT NULL CHECK (target_period IN ('monthly', 'quarterly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    revenue_target NUMERIC DEFAULT 0,
    orders_target INTEGER DEFAULT 0,
    pipeline_target NUMERIC DEFAULT 0,
    revenue_achieved NUMERIC DEFAULT 0,
    orders_achieved INTEGER DEFAULT 0,
    pipeline_achieved NUMERIC DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, target_period, period_start)
);

-- Enable RLS
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sales_targets
CREATE POLICY "Sales can view their own targets"
ON public.sales_targets FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE POLICY "Admins can manage all targets"
ON public.sales_targets FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_sales_targets_updated_at
BEFORE UPDATE ON public.sales_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add state field to enquiries and pipeline_orders
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS customer_state TEXT;
ALTER TABLE public.pipeline_orders ADD COLUMN IF NOT EXISTS customer_state TEXT;

-- 3. Create lead_tags table (predefined tags by admin)
CREATE TABLE public.lead_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT 'blue',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

-- Everyone can view tags
CREATE POLICY "Everyone can view active tags"
ON public.lead_tags FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

-- Only admins can manage tags
CREATE POLICY "Admins can manage tags"
ON public.lead_tags FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Create enquiry_tags junction table (for tagging enquiries)
CREATE TABLE public.enquiry_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES public.lead_tags(id) ON DELETE CASCADE,
    custom_tag TEXT,
    added_by UUID,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (enquiry_id, tag_id),
    UNIQUE (enquiry_id, custom_tag)
);

-- Enable RLS
ALTER TABLE public.enquiry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view enquiry tags"
ON public.enquiry_tags FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can manage enquiry tags"
ON public.enquiry_tags FOR ALL TO authenticated
USING (true);

-- 5. Add tags to pipeline_orders as well
CREATE TABLE public.pipeline_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_order_id UUID REFERENCES public.pipeline_orders(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES public.lead_tags(id) ON DELETE CASCADE,
    custom_tag TEXT,
    added_by UUID,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (pipeline_order_id, tag_id),
    UNIQUE (pipeline_order_id, custom_tag)
);

-- Enable RLS
ALTER TABLE public.pipeline_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pipeline tags"
ON public.pipeline_tags FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can manage pipeline tags"
ON public.pipeline_tags FOR ALL TO authenticated
USING (true);

-- 6. Create sales_faqs table for FAQ repository
CREATE TABLE public.sales_faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    answer TEXT,
    asked_by UUID NOT NULL,
    asked_by_name TEXT NOT NULL,
    answered_by UUID,
    answered_by_name TEXT,
    answered_at TIMESTAMP WITH TIME ZONE,
    is_approved BOOLEAN DEFAULT false,
    approved_by UUID,
    approved_by_name TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    category TEXT,
    is_pinned BOOLEAN DEFAULT false,
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approved FAQs or their own"
ON public.sales_faqs FOR SELECT TO authenticated
USING (is_approved = true OR asked_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can create FAQs"
ON public.sales_faqs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update their own questions or admins can update all"
ON public.sales_faqs FOR UPDATE TO authenticated
USING (asked_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete FAQs"
ON public.sales_faqs FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_sales_faqs_updated_at
BEFORE UPDATE ON public.sales_faqs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Add marketing collateral field to pricelist
ALTER TABLE public.pricelist ADD COLUMN IF NOT EXISTS marketing_collateral_url TEXT;
ALTER TABLE public.pricelist ADD COLUMN IF NOT EXISTS marketing_collateral_name TEXT;

-- Insert some default lead tags
INSERT INTO public.lead_tags (name, color, description) VALUES
('Urgent', 'red', 'Time-sensitive requirement'),
('Repeat Customer', 'green', 'Customer has ordered before'),
('Government', 'blue', 'Government/PSU customer'),
('Enterprise', 'purple', 'Large enterprise deal'),
('Demo Required', 'orange', 'Customer needs product demonstration'),
('Price Sensitive', 'yellow', 'Customer focused on pricing'),
('Training Required', 'cyan', 'Customer needs training along with product'),
('Tender', 'indigo', 'Tender/RFP based enquiry'),
('Agriculture', 'green', 'Agricultural use case'),
('Survey/Mapping', 'blue', 'Survey and mapping application')
ON CONFLICT (name) DO NOTHING;