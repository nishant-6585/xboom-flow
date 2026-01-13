-- Add supplier payment terms column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS supplier_payment_terms text DEFAULT NULL;

-- Add supplier payment due date column to orders table  
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS supplier_payment_due_date date DEFAULT NULL;

-- Create index for efficient querying of supplier payment due dates
CREATE INDEX IF NOT EXISTS idx_orders_supplier_payment_due_date ON public.orders(supplier_payment_due_date);

-- Add comment for documentation
COMMENT ON COLUMN public.orders.supplier_payment_terms IS 'Payment terms for supplier (e.g., Advance, Net 7, Net 30)';
COMMENT ON COLUMN public.orders.supplier_payment_due_date IS 'Due date for supplier payment based on payment terms';