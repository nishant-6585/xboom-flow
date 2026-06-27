
-- Rental records for buyback drones
CREATE TABLE public.rental_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drone_id UUID NOT NULL REFERENCES public.buyback_drones(id) ON DELETE CASCADE,
  renter_name TEXT NOT NULL,
  renter_contact TEXT NOT NULL,
  rental_start_date DATE NOT NULL,
  rental_end_date DATE,
  expected_return_date DATE,
  actual_return_date DATE,
  rental_fee NUMERIC NOT NULL DEFAULT 0,
  security_deposit NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active', -- Active | Returned
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_records TO authenticated;
GRANT ALL ON public.rental_records TO service_role;

ALTER TABLE public.rental_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view rentals" ON public.rental_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert rentals" ON public.rental_records
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update rentals" ON public.rental_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete rentals" ON public.rental_records
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_rental_records_drone ON public.rental_records(drone_id);
CREATE INDEX idx_rental_records_status ON public.rental_records(status);

CREATE TRIGGER trg_rental_records_updated_at
  BEFORE UPDATE ON public.rental_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sync buyback_drones.stock_status based on rental state
CREATE OR REPLACE FUNCTION public.sync_drone_rental_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'Active' THEN
      UPDATE public.buyback_drones
        SET stock_status = 'On Rent', updated_at = now()
        WHERE id = NEW.drone_id AND stock_status = 'In Stock';
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.status = 'Returned' AND OLD.status <> 'Returned' THEN
      UPDATE public.buyback_drones
        SET stock_status = 'In Stock', updated_at = now()
        WHERE id = NEW.drone_id AND stock_status = 'On Rent';
    ELSIF NEW.status = 'Active' AND OLD.status <> 'Active' THEN
      UPDATE public.buyback_drones
        SET stock_status = 'On Rent', updated_at = now()
        WHERE id = NEW.drone_id AND stock_status = 'In Stock';
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.status = 'Active' THEN
      UPDATE public.buyback_drones
        SET stock_status = 'In Stock', updated_at = now()
        WHERE id = OLD.drone_id AND stock_status = 'On Rent';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_rental_sync_status
  AFTER INSERT OR UPDATE OR DELETE ON public.rental_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_drone_rental_status();
