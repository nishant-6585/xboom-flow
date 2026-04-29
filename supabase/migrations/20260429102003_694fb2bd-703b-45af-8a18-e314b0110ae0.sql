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
  IF n ~ '\m(rifles?|regiments?|battalions?|brigades?|army|navy|air ?force|defence|defense|ministry of|govt|government|police|crpf|bsf|itbp|nsg|drdo|isro|hal|brahmos)\M' THEN
    RETURN 'Government & Defence';
  END IF;

  -- Forestry / Wildlife / Environment
  IF n ~ '\m(forests?|wildlife|sanctuary|tiger reserve|national park|conservation|ecology|biodiversity)\M' THEN
    RETURN 'Forestry & Wildlife';
  END IF;

  -- Education / Research
  IF n ~ '\m(iit|iim|nit|iisc|iiit|bits|university|colleges?|institutes?|schools? of|education|academy|vidyalaya|polytechnic|research|society|foundation|higher learning|gurukul)\M' THEN
    RETURN 'Education & Research';
  END IF;

  -- Aerospace / Drones / UAV
  IF n ~ '\m(drones?|uav|uas|aerospace|aero|aviation|skyroot|rockets?|satellites?|space|aircrafts?|airframe|droneshala)\M' THEN
    RETURN 'Aerospace & Drones';
  END IF;

  -- Construction / Infrastructure
  IF n ~ '\m(constructions?|builders?|infratech|infra|infrastructures?|civil|contractors?|developers?|realty|realtors?|cement|concrete|borewells?|borewell)\M' THEN
    RETURN 'Construction & Infrastructure';
  END IF;

  -- Energy / Mining / Explosives
  IF n ~ '\m(energy|solar|power|mining|mines|coal|petroleum|oil|gas|explosives?)\M' THEN
    RETURN 'Energy & Mining';
  END IF;

  -- Agriculture / Farming
  IF n ~ '\m(agri|agro|farms?|farming|dairy|seeds?|fertili[sz]ers?|crops?|plantation)\M' THEN
    RETURN 'Agriculture';
  END IF;

  -- Healthcare / Pharma
  IF n ~ '\m(hospitals?|clinics?|pharma|pharmaceuticals?|medical|healthcare|health|biotech|life sciences|diagnostics?)\M' THEN
    RETURN 'Healthcare & Pharma';
  END IF;

  -- Logistics / Surveying / GIS
  IF n ~ '\m(logistics|cargo|shipping|freight|transport|courier|gis|geo|surveys?|mapping|cartograph)\M' THEN
    RETURN 'Logistics & Surveying';
  END IF;

  -- Media / Film / Photography
  IF n ~ '\m(media|films?|productions?|studios?|photograph|cinema|broadcast)\M' THEN
    RETURN 'Media & Entertainment';
  END IF;

  -- Consulting / Services
  IF n ~ '\m(consults?|consultancy|consulting|advisors?|advisory|deloitte|kpmg|accenture|capgemini|tcs|infosys|wipro)\M' THEN
    RETURN 'Consulting & Services';
  END IF;

  -- Manufacturing / Industrial
  IF n ~ '\m(manufactur|industries|industrial|engineering|mechatron|automations?|robotics?|machinery|tools?|equipments?|fabricat|radar|radars)\M' THEN
    RETURN 'Manufacturing & Engineering';
  END IF;

  -- Technology / IT / Software
  IF n ~ '\m(technologies|technology|tech|infotech|software|systems|solutions|digital|cyber|data|analytics|ai|labs|innovations?|disruptive|elxsi)\M' THEN
    RETURN 'Technology & IT';
  END IF;

  -- Retail / Trading
  IF n ~ '\m(retail|stores?|shoppe|shops?|traders?|trading|enterprises?|mart|bazaar|ventures?)\M' THEN
    RETURN 'Retail & Trading';
  END IF;

  RETURN NULL;
END;
$$;

-- Re-run backfill (idempotent — only fills NULL/empty)
UPDATE public.companies
SET industry = public.infer_industry_from_name(name),
    updated_at = now()
WHERE total_orders_count > 0
  AND (industry IS NULL OR trim(industry) = '')
  AND public.infer_industry_from_name(name) IS NOT NULL;