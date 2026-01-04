-- Create order status enum
CREATE TYPE public.order_status AS ENUM (
  'pending',
  'confirmed',
  'procuring',
  'in_transit',
  'customs',
  'delivered',
  'cancelled'
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Link to enquiry (optional)
  enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE SET NULL,
  
  -- Order details
  product_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  
  -- Customer/Sales info
  customer_name TEXT NOT NULL,
  customer_company TEXT NOT NULL,
  sales_person_id UUID NOT NULL,
  sales_person_name TEXT NOT NULL,
  
  -- Procurement details (hidden from sales)
  supplier_name TEXT,
  supplier_contact TEXT,
  procurement_rate DECIMAL(12, 2),
  procurement_currency TEXT DEFAULT 'INR',
  
  -- Tracking and status
  status order_status NOT NULL DEFAULT 'pending',
  tracking_number TEXT,
  tracking_url TEXT,
  estimated_delivery DATE,
  actual_delivery DATE,
  
  -- Notes
  internal_notes TEXT,  -- Only visible to supply chain/admin
  customer_notes TEXT,  -- Visible to sales
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies

-- Supply chain and admin can view all orders
CREATE POLICY "Supply chain can view all orders"
ON public.orders
FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'supply_chain'::app_role)
);

CREATE POLICY "Admin can view all orders"
ON public.orders
FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Sales can only view their own orders (limited columns handled in app)
CREATE POLICY "Sales can view own orders"
ON public.orders
FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role)
  AND sales_person_id = auth.uid()
);

-- Supply chain and admin can create orders
CREATE POLICY "Supply chain can create orders"
ON public.orders
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'supply_chain'::app_role)
);

CREATE POLICY "Admin can create orders"
ON public.orders
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Supply chain and admin can update orders
CREATE POLICY "Supply chain can update orders"
ON public.orders
FOR UPDATE
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'supply_chain'::app_role)
);

CREATE POLICY "Admin can update orders"
ON public.orders
FOR UPDATE
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Only admin can delete orders
CREATE POLICY "Admin can delete orders"
ON public.orders
FOR DELETE
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);