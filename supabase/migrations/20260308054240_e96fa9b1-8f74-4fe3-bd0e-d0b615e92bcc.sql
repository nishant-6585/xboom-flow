-- RLS policies for sales_manager on pipeline_orders
CREATE POLICY "Sales manager can view all pipeline orders"
  ON public.pipeline_orders FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));

CREATE POLICY "Sales manager can create pipeline orders"
  ON public.pipeline_orders FOR INSERT
  WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));

CREATE POLICY "Sales manager can update pipeline orders"
  ON public.pipeline_orders FOR UPDATE
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));

CREATE POLICY "Sales manager can delete pipeline orders"
  ON public.pipeline_orders FOR DELETE
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));

-- RLS policies for sales_manager on orders
CREATE POLICY "Sales manager can view all orders"
  ON public.orders FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));

CREATE POLICY "Sales manager can update orders"
  ON public.orders FOR UPDATE
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));

-- RLS policies for sales_manager on enquiries
CREATE POLICY "Sales manager can view all enquiries"
  ON public.enquiries FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));

CREATE POLICY "Sales manager can update enquiries"
  ON public.enquiries FOR UPDATE
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales_manager'::app_role));