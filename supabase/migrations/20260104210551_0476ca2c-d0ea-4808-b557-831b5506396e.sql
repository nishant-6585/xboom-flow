-- Add new columns for order enhancements
ALTER TABLE public.orders 
ADD COLUMN shipping_address TEXT,
ADD COLUMN order_type TEXT DEFAULT 'prepaid' CHECK (order_type IN ('prepaid', 'postpaid')),
ADD COLUMN amount_paid DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN total_sales_amount DECIMAL(12, 2),
ADD COLUMN payment_terms TEXT,
ADD COLUMN customer_type TEXT DEFAULT 'b2b' CHECK (customer_type IN ('b2b', 'b2c')),
ADD COLUMN sales_notes TEXT,
ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'full'));

-- Add comments for clarity
COMMENT ON COLUMN public.orders.shipping_address IS 'Customer shipping address';
COMMENT ON COLUMN public.orders.order_type IS 'Order payment type: prepaid or postpaid';
COMMENT ON COLUMN public.orders.amount_paid IS 'Amount already paid by customer';
COMMENT ON COLUMN public.orders.total_sales_amount IS 'Total sales amount for the order';
COMMENT ON COLUMN public.orders.payment_terms IS 'Payment terms agreed with customer';
COMMENT ON COLUMN public.orders.customer_type IS 'Customer type: B2B or B2C';
COMMENT ON COLUMN public.orders.sales_notes IS 'Notes from sales team';
COMMENT ON COLUMN public.orders.payment_status IS 'Payment status: pending, partial, or full';