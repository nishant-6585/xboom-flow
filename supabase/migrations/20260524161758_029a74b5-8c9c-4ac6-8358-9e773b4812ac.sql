
-- ============================================================
-- 1) GMAIL INTEGRATIONS: restrict tokens to admin only
-- ============================================================

DROP POLICY IF EXISTS "Admin and sales_manager can select gmail integrations" ON public.gmail_integrations;

CREATE POLICY "Admins can select gmail integrations (with tokens)"
  ON public.gmail_integrations
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_gmail_integrations_safe()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  is_active boolean,
  last_synced_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  token_expiry timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.user_id, g.email, g.is_active, g.last_synced_at,
         g.created_at, g.updated_at, g.token_expiry
  FROM public.gmail_integrations g
  WHERE has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'sales_manager'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_gmail_integrations_safe() FROM public;
GRANT EXECUTE ON FUNCTION public.get_gmail_integrations_safe() TO authenticated;

-- ============================================================
-- 2) SUPPLIERS: hide banking fields from supply_chain
-- ============================================================

DROP POLICY IF EXISTS "Supply chain can view all suppliers" ON public.suppliers;

CREATE OR REPLACE FUNCTION public.get_suppliers_safe()
RETURNS TABLE (
  id uuid,
  name text,
  contact_name text,
  phone text,
  email text,
  city text,
  address text,
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_account_holder text,
  product_category text,
  products text,
  preference text,
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  brand_name text,
  gst_number text,
  mobile text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.name, s.contact_name, s.phone, s.email, s.city, s.address,
    CASE WHEN has_role(auth.uid(),'admin'::app_role)
           OR has_role(auth.uid(),'finance'::app_role)
         THEN s.bank_name ELSE NULL END,
    CASE WHEN has_role(auth.uid(),'admin'::app_role)
           OR has_role(auth.uid(),'finance'::app_role)
         THEN s.bank_account_number ELSE NULL END,
    CASE WHEN has_role(auth.uid(),'admin'::app_role)
           OR has_role(auth.uid(),'finance'::app_role)
         THEN s.bank_ifsc ELSE NULL END,
    CASE WHEN has_role(auth.uid(),'admin'::app_role)
           OR has_role(auth.uid(),'finance'::app_role)
         THEN s.bank_account_holder ELSE NULL END,
    s.product_category, s.products, s.preference, s.notes, s.is_active,
    s.created_at, s.updated_at, s.created_by, s.brand_name, s.gst_number,
    s.mobile, s.status
  FROM public.suppliers s
  WHERE is_user_approved(auth.uid())
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'finance'::app_role)
      OR has_role(auth.uid(),'supply_chain'::app_role)
    );
$$;

REVOKE ALL ON FUNCTION public.get_suppliers_safe() FROM public;
GRANT EXECUTE ON FUNCTION public.get_suppliers_safe() TO authenticated;
