
CREATE OR REPLACE FUNCTION public.guard_companies_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'sales_manager');
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.tier_source IS DISTINCT FROM OLD.tier_source
     OR NEW.tier_locked_by IS DISTINCT FROM OLD.tier_locked_by
     OR NEW.tier_locked_at IS DISTINCT FROM OLD.tier_locked_at
     OR NEW.tier_notes IS DISTINCT FROM OLD.tier_notes
     OR NEW.health_score IS DISTINCT FROM OLD.health_score
     OR NEW.potential_value IS DISTINCT FROM OLD.potential_value
     OR NEW.pipeline_value IS DISTINCT FROM OLD.pipeline_value THEN
    RAISE EXCEPTION 'Only admin/sales_manager can change tier, health, or valuation fields on companies';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_companies_sensitive_updates_trg ON public.companies;
CREATE TRIGGER guard_companies_sensitive_updates_trg
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_companies_sensitive_updates();
