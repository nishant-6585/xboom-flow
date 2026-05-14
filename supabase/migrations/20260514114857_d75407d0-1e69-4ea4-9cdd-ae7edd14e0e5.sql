
-- =========================================================
-- PHASE 1 — B2B Customer Portal: schema, roles, RLS
-- =========================================================

-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'b2b_customer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';

COMMIT;
BEGIN;

-- 2. Tables (all prefixed portal_*)

-- ACCOUNTS
CREATE TABLE public.portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  gstin text,
  industry text,
  billing_address text,
  shipping_address text,
  primary_contact_name text,
  assigned_rep_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_accounts_rep ON public.portal_accounts(assigned_rep_id);

-- CONTACTS
CREATE TABLE public.portal_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  whatsapp_number text,
  role text NOT NULL CHECK (role IN ('buyer','technician','admin','finance')),
  is_active boolean NOT NULL DEFAULT true,
  invited_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_contacts_account ON public.portal_contacts(account_id);
CREATE INDEX idx_portal_contacts_auth ON public.portal_contacts(auth_user_id);
CREATE UNIQUE INDEX idx_portal_contacts_email_per_account ON public.portal_contacts(account_id, lower(email));

-- PRODUCTS
CREATE TABLE public.portal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  domain text CHECK (domain IN ('drone','robot','underwater','accessory','service')),
  description text,
  catalog_price numeric(12,2),
  unit text DEFAULT 'unit',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ORDERS
CREATE TABLE public.portal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE RESTRICT,
  assigned_rep_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_state text NOT NULL DEFAULT 'draft' CHECK (current_state IN (
    'draft','quote_sent','quote_revised','approved','po_received',
    'confirmed','in_production','qc_ready','dispatched','delivered','closed','cancelled'
  )),
  customer_facing_eta date,
  subtotal numeric(12,2),
  discount_amount numeric(12,2) DEFAULT 0,
  discount_reason text,
  gst_amount numeric(12,2),
  total numeric(12,2),
  payment_terms text,
  delivery_commitment text,
  portal_visible boolean NOT NULL DEFAULT true,
  courier_name text,
  awb_number text,
  tracking_url text,
  customer_po_number text,
  daas_tier text CHECK (daas_tier IN ('mission','monthly','annual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_orders_account ON public.portal_orders(account_id);
CREATE INDEX idx_portal_orders_rep ON public.portal_orders(assigned_rep_id);
CREATE INDEX idx_portal_orders_state ON public.portal_orders(current_state);

-- LINE ITEMS
CREATE TABLE public.portal_order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.portal_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.portal_products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  description text,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_state text NOT NULL DEFAULT 'pending' CHECK (line_state IN (
    'pending','in_production','qc_ready','dispatched','delivered'
  )),
  serial_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_lineitems_order ON public.portal_order_line_items(order_id);

-- RFQs
CREATE TABLE public.portal_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number text UNIQUE NOT NULL,
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  submitted_by_contact_id uuid REFERENCES public.portal_contacts(id) ON DELETE SET NULL,
  domains text[] NOT NULL DEFAULT '{}',
  use_case text NOT NULL,
  desired_date date,
  budget_range text,
  daas_interest text CHECK (daas_interest IN ('buy_only','open','daas_preferred')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_quote','converted','closed')),
  assigned_rep_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_to_order_id uuid REFERENCES public.portal_orders(id) ON DELETE SET NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_rfqs_account ON public.portal_rfqs(account_id);
CREATE INDEX idx_portal_rfqs_rep ON public.portal_rfqs(assigned_rep_id);

-- STATE TRANSITIONS
CREATE TABLE public.portal_state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.portal_orders(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name_snapshot text,
  customer_facing_note text,
  internal_note text,
  transitioned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_transitions_order ON public.portal_state_transitions(order_id, transitioned_at);

-- DOCUMENTS
CREATE TABLE public.portal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.portal_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.portal_products(id) ON DELETE SET NULL,
  doc_type text NOT NULL CHECK (doc_type IN (
    'quote_pdf','customer_po','sales_invoice','gst_invoice',
    'packing_list','awb_courier','calibration_cert','serial_number_card',
    'user_manual','training_video','amc_warranty','spare_parts_list',
    'dgca_compliance','pilot_license','other'
  )),
  title text NOT NULL,
  file_url text,
  external_url text,
  file_size_bytes int,
  version int NOT NULL DEFAULT 1,
  is_master boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_documents_order ON public.portal_documents(order_id);
CREATE INDEX idx_portal_documents_product_master ON public.portal_documents(product_id) WHERE is_master = true;

-- TICKETS
CREATE TABLE public.portal_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  account_id uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  raised_by_contact_id uuid REFERENCES public.portal_contacts(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.portal_orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.portal_products(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('technical','documentation','spare_parts','training','billing','other')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','awaiting_customer','resolved','closed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_response_at timestamptz,
  resolved_at timestamptz,
  sla_first_response_due_at timestamptz,
  sla_resolution_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_tickets_account ON public.portal_tickets(account_id);
CREATE INDEX idx_portal_tickets_assigned ON public.portal_tickets(assigned_to);
CREATE INDEX idx_portal_tickets_status ON public.portal_tickets(status);

-- TICKET MESSAGES
CREATE TABLE public.portal_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.portal_tickets(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name_snapshot text,
  is_internal boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_messages_ticket ON public.portal_ticket_messages(ticket_id, created_at);

-- NOTIFICATIONS LOG
CREATE TABLE public.portal_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_contact_id uuid REFERENCES public.portal_contacts(id) ON DELETE SET NULL,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','in_app')),
  template_id text NOT NULL,
  related_entity_type text,
  related_entity_id uuid,
  payload jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed','opened')),
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_notifs_recipient ON public.portal_notifications_log(recipient_contact_id);
CREATE INDEX idx_portal_notifs_entity ON public.portal_notifications_log(related_entity_type, related_entity_id);

-- NOTIFICATION PREFERENCES
CREATE TABLE public.portal_notification_preferences (
  contact_id uuid PRIMARY KEY REFERENCES public.portal_contacts(id) ON DELETE CASCADE,
  email_order_status boolean NOT NULL DEFAULT true,
  email_supply_chain_notes boolean NOT NULL DEFAULT true,
  email_new_docs boolean NOT NULL DEFAULT true,
  email_ticket_replies boolean NOT NULL DEFAULT true,
  email_renewals boolean NOT NULL DEFAULT true,
  whatsapp_order_status boolean NOT NULL DEFAULT true,
  whatsapp_supply_chain_notes boolean NOT NULL DEFAULT true,
  whatsapp_new_docs boolean NOT NULL DEFAULT false,
  whatsapp_ticket_replies boolean NOT NULL DEFAULT true,
  whatsapp_renewals boolean NOT NULL DEFAULT true
);

-- 3. Helper function (security definer to avoid RLS recursion on contacts)
CREATE OR REPLACE FUNCTION public.get_my_portal_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id
  FROM public.portal_contacts
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

-- 4. updated_at triggers (reuse public.update_updated_at_column if present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $f$;
  END IF;
END$$;

CREATE TRIGGER trg_portal_accounts_updated BEFORE UPDATE ON public.portal_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_orders_updated BEFORE UPDATE ON public.portal_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_tickets_updated BEFORE UPDATE ON public.portal_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5. RLS
-- =========================================================
ALTER TABLE public.portal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_notification_preferences ENABLE ROW LEVEL SECURITY;

-- ===== ACCOUNTS =====
CREATE POLICY "portal_accounts: customer reads own" ON public.portal_accounts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'b2b_customer') AND id = public.get_my_portal_account_id());

CREATE POLICY "portal_accounts: rep manages assigned" ON public.portal_accounts
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager')) AND assigned_rep_id = auth.uid())
  WITH CHECK ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager')) AND assigned_rep_id = auth.uid());

CREATE POLICY "portal_accounts: internal full" ON public.portal_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support') OR public.has_role(auth.uid(),'finance'));

-- ===== CONTACTS =====
CREATE POLICY "portal_contacts: customer reads own account" ON public.portal_contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id());

CREATE POLICY "portal_contacts: customer admin manages own account" ON public.portal_contacts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'b2b_customer')
    AND account_id = public.get_my_portal_account_id()
    AND EXISTS (SELECT 1 FROM public.portal_contacts c WHERE c.auth_user_id = auth.uid() AND c.role IN ('admin','buyer'))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'b2b_customer')
    AND account_id = public.get_my_portal_account_id()
    AND EXISTS (SELECT 1 FROM public.portal_contacts c WHERE c.auth_user_id = auth.uid() AND c.role IN ('admin','buyer'))
  );

CREATE POLICY "portal_contacts: rep reads assigned" ON public.portal_contacts
  FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
    AND EXISTS (SELECT 1 FROM public.portal_accounts a WHERE a.id = portal_contacts.account_id AND a.assigned_rep_id = auth.uid())
  );

CREATE POLICY "portal_contacts: internal full" ON public.portal_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support'));

-- ===== PRODUCTS =====
CREATE POLICY "portal_products: authenticated read active" ON public.portal_products
  FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "portal_products: internal manage" ON public.portal_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain'));

-- ===== ORDERS =====
CREATE POLICY "portal_orders: customer reads own" ON public.portal_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id() AND portal_visible = true);

CREATE POLICY "portal_orders: rep manages assigned" ON public.portal_orders
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager')) AND assigned_rep_id = auth.uid())
  WITH CHECK ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager')) AND assigned_rep_id = auth.uid());

CREATE POLICY "portal_orders: supply_chain admin full" ON public.portal_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "portal_orders: support reads" ON public.portal_orders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'support'));

CREATE POLICY "portal_orders: finance reads" ON public.portal_orders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'finance'));

-- ===== LINE ITEMS (inherit via order access) =====
CREATE POLICY "portal_lineitems: read via order" ON public.portal_order_line_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_orders o WHERE o.id = portal_order_line_items.order_id));
CREATE POLICY "portal_lineitems: write via internal" ON public.portal_order_line_items
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain')
    OR ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
        AND EXISTS (SELECT 1 FROM public.portal_orders o WHERE o.id = portal_order_line_items.order_id AND o.assigned_rep_id = auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain')
    OR ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
        AND EXISTS (SELECT 1 FROM public.portal_orders o WHERE o.id = portal_order_line_items.order_id AND o.assigned_rep_id = auth.uid()))
  );

-- ===== RFQs =====
CREATE POLICY "portal_rfqs: customer reads own" ON public.portal_rfqs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id());

CREATE POLICY "portal_rfqs: customer creates own" ON public.portal_rfqs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id());

CREATE POLICY "portal_rfqs: rep manages assigned" ON public.portal_rfqs
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
         AND (assigned_rep_id = auth.uid()
              OR EXISTS (SELECT 1 FROM public.portal_accounts a WHERE a.id = portal_rfqs.account_id AND a.assigned_rep_id = auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'));

CREATE POLICY "portal_rfqs: internal full" ON public.portal_rfqs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain'));

-- ===== STATE TRANSITIONS =====
CREATE POLICY "portal_transitions: customer reads own" ON public.portal_state_transitions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'b2b_customer')
    AND EXISTS (SELECT 1 FROM public.portal_orders o WHERE o.id = portal_state_transitions.order_id AND o.account_id = public.get_my_portal_account_id() AND o.portal_visible = true)
  );

CREATE POLICY "portal_transitions: internal full" ON public.portal_state_transitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support')
         OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support')
              OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'));

-- ===== DOCUMENTS =====
CREATE POLICY "portal_documents: customer reads own & master" ON public.portal_documents
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'b2b_customer')
    AND (
      (order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.portal_orders o WHERE o.id = portal_documents.order_id AND o.account_id = public.get_my_portal_account_id() AND o.portal_visible = true))
      OR
      (is_master = true AND product_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.portal_order_line_items oli
        JOIN public.portal_orders o ON o.id = oli.order_id
        WHERE oli.product_id = portal_documents.product_id AND o.account_id = public.get_my_portal_account_id()
      ))
    )
  );

CREATE POLICY "portal_documents: rep manages assigned" ON public.portal_documents
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
         AND order_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.portal_orders o WHERE o.id = portal_documents.order_id AND o.assigned_rep_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'));

CREATE POLICY "portal_documents: internal full" ON public.portal_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supply_chain') OR public.has_role(auth.uid(),'support'));

-- ===== TICKETS =====
CREATE POLICY "portal_tickets: customer manages own" ON public.portal_tickets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id())
  WITH CHECK (public.has_role(auth.uid(),'b2b_customer') AND account_id = public.get_my_portal_account_id());

CREATE POLICY "portal_tickets: rep manages assigned customers" ON public.portal_tickets
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
         AND EXISTS (SELECT 1 FROM public.portal_accounts a WHERE a.id = portal_tickets.account_id AND a.assigned_rep_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'));

CREATE POLICY "portal_tickets: support admin full" ON public.portal_tickets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'support') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'support') OR public.has_role(auth.uid(),'admin'));

-- ===== TICKET MESSAGES =====
CREATE POLICY "portal_messages: customer reads non-internal" ON public.portal_ticket_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'b2b_customer')
    AND is_internal = false
    AND EXISTS (SELECT 1 FROM public.portal_tickets t WHERE t.id = portal_ticket_messages.ticket_id AND t.account_id = public.get_my_portal_account_id())
  );

CREATE POLICY "portal_messages: customer posts non-internal" ON public.portal_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'b2b_customer')
    AND is_internal = false
    AND EXISTS (SELECT 1 FROM public.portal_tickets t WHERE t.id = portal_ticket_messages.ticket_id AND t.account_id = public.get_my_portal_account_id())
  );

CREATE POLICY "portal_messages: internal full" ON public.portal_ticket_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support')
         OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support')
              OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager'));

-- ===== NOTIFICATIONS LOG (admin read only; service role inserts from edge fns) =====
CREATE POLICY "portal_notifs: admin reads" ON public.portal_notifications_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ===== NOTIFICATION PREFERENCES =====
CREATE POLICY "portal_prefs: contact manages own" ON public.portal_notification_preferences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_contacts c WHERE c.id = portal_notification_preferences.contact_id AND c.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_contacts c WHERE c.id = portal_notification_preferences.contact_id AND c.auth_user_id = auth.uid()));

CREATE POLICY "portal_prefs: internal full" ON public.portal_notification_preferences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));

COMMIT;
