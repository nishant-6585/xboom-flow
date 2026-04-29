CREATE OR REPLACE FUNCTION public.infer_industry_from_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n text;
BEGIN
  IF p_name IS NULL THEN RETURN NULL; END IF;
  n := lower(p_name);

  -- Government / Defence
  IF n ~ '\m(rifles|regiment|battalion|brigade|army|navy|air force|airforce|defence|defense|ministry of|govt|government|police|crpf|bsf|itbp|nsg|drdo|isro|hal|brahmos|apo|c/o 56)\M' THEN
    RETURN 'Government & Defence';
  END IF;

  -- Forestry / Wildlife / Environment
  IF n ~ '\m(forest|wildlife|sanctuary|tiger reserve|national park|conservation|ecology|biodiversity)\M' THEN
    RETURN 'Forestry & Wildlife';
  END IF;

  -- Education / Research
  IF n ~ '\m(iit|iim|nit|iisc|iiit|bits|university|college|institute of technology|institute of science|school of engineering|education|academy|vidyalaya|vidya|polytechnic|research|society|foundation)\M' THEN
    RETURN 'Education & Research';
  END IF;

  -- Aerospace / Drones / UAV
  IF n ~ '\m(drone|drones|uav|uas|aerospace|aero|aviation|skyroot|rocket|satellite|space|aircraft|airframe|droneshala)\M' THEN
    RETURN 'Aerospace & Drones';
  END IF;

  -- Construction / Infrastructure
  IF n ~ '\m(construction|builders|builder|infratech|infra|infrastructure|civil|contractor|developers|realty|realtors|cement|concrete)\M' THEN
    RETURN 'Construction & Infrastructure';
  END IF;

  -- Energy / Mining / Explosives
  IF n ~ '\m(energy|solar|power|mining|mines|coal|petroleum|oil|gas|explosive|explosives)\M' THEN
    RETURN 'Energy & Mining';
  END IF;

  -- Agriculture / Farming
  IF n ~ '\m(agri|agro|farm|farms|farming|dairy|seeds|fertili[sz]er|crop)\M' THEN
    RETURN 'Agriculture';
  END IF;

  -- Healthcare / Pharma
  IF n ~ '\m(hospital|clinic|pharma|pharmaceutical|medical|healthcare|health|biotech|life sciences|diagnostic)\M' THEN
    RETURN 'Healthcare & Pharma';
  END IF;

  -- Logistics / Surveying / GIS
  IF n ~ '\m(logistics|cargo|shipping|freight|transport|courier|gis|geo|survey|mapping|cartograph)\M' THEN
    RETURN 'Logistics & Surveying';
  END IF;

  -- Media / Film / Photography
  IF n ~ '\m(media|films|film|productions|studios|studio|photograph|cinema|broadcast)\M' THEN
    RETURN 'Media & Entertainment';
  END IF;

  -- Consulting / Services
  IF n ~ '\m(consult|consultancy|consulting|advisor|advisory|deloitte|kpmg|accenture|capgemini|tcs|infosys|wipro)\M' THEN
    RETURN 'Consulting & Services';
  END IF;

  -- Manufacturing / Industrial
  IF n ~ '\m(manufactur|industries|industry|industrial|engineering|mechatron|automation|robotics|machinery|tools|equipments|equipment|fabricat)\M' THEN
    RETURN 'Manufacturing & Engineering';
  END IF;

  -- Technology / IT / Software (broad — keep last so specific industries win)
  IF n ~ '\m(technologies|technology|tech|infotech|software|systems|solutions|digital|cyber|data|analytics|ai|labs|innovation|innovations|disruptive)\M' THEN
    RETURN 'Technology & IT';
  END IF;

  -- Retail / Trading
  IF n ~ '\m(retail|store|shoppe|shop|traders|trading|enterprises|enterprise|mart|bazaar|venture|ventures)\M' THEN
    RETURN 'Retail & Trading';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_fill_company_industry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.industry IS NULL OR trim(NEW.industry) = '') AND NEW.name IS NOT NULL THEN
    NEW.industry := public.infer_industry_from_name(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fill_company_industry ON public.companies;
CREATE TRIGGER trg_auto_fill_company_industry
BEFORE INSERT OR UPDATE OF name, industry ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.auto_fill_company_industry();

-- Backfill: only companies with at least one order and no industry set
UPDATE public.companies
SET industry = public.infer_industry_from_name(name),
    updated_at = now()
WHERE total_orders_count > 0
  AND (industry IS NULL OR trim(industry) = '')
  AND public.infer_industry_from_name(name) IS NOT NULL;