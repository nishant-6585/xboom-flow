
CREATE TABLE public.attention_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('enquiry', 'interakt', 'myoperator', 'email')),
  source_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  company TEXT,
  city TEXT,
  product_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  marked_by TEXT NOT NULL,
  marked_by_name TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id)
);

ALTER TABLE public.attention_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view attention items"
  ON public.attention_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert attention items"
  ON public.attention_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update attention items"
  ON public.attention_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.attention_items;
