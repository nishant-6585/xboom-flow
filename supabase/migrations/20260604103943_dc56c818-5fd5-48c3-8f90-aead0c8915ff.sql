
CREATE TABLE public.courier_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  tracking_url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_partners TO authenticated;
GRANT ALL ON public.courier_partners TO service_role;

ALTER TABLE public.courier_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view courier partners"
  ON public.courier_partners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and supply chain can insert courier partners"
  ON public.courier_partners FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE POLICY "Admin and supply chain can update courier partners"
  ON public.courier_partners FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE POLICY "Admin and supply chain can delete courier partners"
  ON public.courier_partners FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE TRIGGER update_courier_partners_updated_at
  BEFORE UPDATE ON public.courier_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.courier_partners (name, tracking_url) VALUES
  ('Shree Tirupati Courier', 'http://www.shreetirupaticourier.net/'),
  ('DTDC', 'https://www.dtdc.com/track-your-shipment/'),
  ('Bluedart', 'https://www.bluedart.com/tracking'),
  ('Shadowfax', 'https://tracker.shadowfax.in/'),
  ('Delhivery', 'https://www.delhivery.com/tracking'),
  ('Trackon', 'https://trackon.in/Tracking/MultiAWBTracking'),
  ('The Professional Couriers', 'https://www.tpcindia.com/Tracking2.aspx'),
  ('Xpressbees', 'https://www.xpressbees.com/shipment/tracking'),
  ('FedEx India', 'https://www.fedex.com/fedextrack/'),
  ('Gati', 'https://www.gati.com/tracking/'),
  ('Ecom Express', 'https://ecomexpress.in/tracking/'),
  ('DHL Express India', 'https://www.dhl.com/in-en/home/tracking.html'),
  ('Aramex India', 'https://www.aramex.com/in/en/track/track-by-tracking-number'),
  ('India Post (Speed Post)', 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx'),
  ('ST Courier', 'https://stcourier.com/track/shipment'),
  ('Porter', 'https://porter.in/track'),
  ('Office Delivery', ''),
  ('Bus', '')
ON CONFLICT (name) DO NOTHING;
