-- Suspect companies scanner + admin bulk delete/relink RPCs

-- Scanner: returns companies that look like product/junk names, with usage counts
CREATE OR REPLACE FUNCTION public.scan_suspect_companies()
RETURNS TABLE (
  id uuid,
  name text,
  reason text,
  created_at timestamptz,
  created_by_name text,
  total_orders_count integer,
  prospects_count bigint,
  pipeline_count bigint,
  orders_count bigint,
  contacts_count bigint,
  activities_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can scan suspect companies';
  END IF;

  RETURN QUERY
  WITH flagged AS (
    SELECT 
      c.id, c.name, c.created_at, c.created_by_name, c.total_orders_count,
      CASE
        WHEN length(btrim(c.name)) < 3 THEN 'Too short (< 3 chars)'
        WHEN lower(btrim(c.name)) ~ '^[0-9 +\-().]+$' THEN 'Looks like a phone/number'
        WHEN lower(btrim(c.name)) IN ('n/a','na','no','none','nil','null','-','--','test','testing','xyz','abc','tbd','xxx','unknown') THEN 'Generic placeholder'
        WHEN EXISTS (SELECT 1 FROM public.inventory i WHERE lower(btrim(i.name)) = lower(btrim(c.name))) THEN 'Matches inventory product name'
        WHEN EXISTS (SELECT 1 FROM public.pricelist p WHERE lower(btrim(p.product_name)) = lower(btrim(c.name))) THEN 'Matches pricelist product name'
        WHEN lower(btrim(c.name)) ~ '(drone|fpv|combo|battery|propeller|gimbal|camera|rtk|gps module|mavic|avata|mini |air |phantom|matrice|inspire)' 
             AND length(btrim(c.name)) < 60 THEN 'Contains drone/product keyword'
        ELSE NULL
      END AS _reason
    FROM public.companies c
  )
  SELECT 
    f.id, f.name, f._reason, f.created_at, f.created_by_name, f.total_orders_count,
    (SELECT count(*) FROM public.prospects WHERE company_id = f.id),
    (SELECT count(*) FROM public.pipeline_orders WHERE company_id = f.id),
    (SELECT count(*) FROM public.orders WHERE company_id = f.id),
    (SELECT count(*) FROM public.company_contacts WHERE company_id = f.id),
    (SELECT count(*) FROM public.company_activities WHERE company_id = f.id)
  FROM flagged f
  WHERE f._reason IS NOT NULL
  ORDER BY f.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_suspect_companies() TO authenticated;

-- Bulk relink: move all linked rows from source company ids to a target company id
CREATE OR REPLACE FUNCTION public.relink_companies(
  _source_ids uuid[],
  _target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moved_prospects int := 0;
  _moved_pipeline int := 0;
  _moved_orders int := 0;
  _moved_contacts int := 0;
  _moved_activities int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can relink companies';
  END IF;
  IF _target_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _target_id) THEN
    RAISE EXCEPTION 'Target company not found';
  END IF;
  IF _source_ids IS NULL OR array_length(_source_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No source companies provided';
  END IF;

  WITH u AS (UPDATE public.prospects SET company_id = _target_id WHERE company_id = ANY(_source_ids) AND id IS NOT NULL RETURNING 1)
    SELECT count(*) INTO _moved_prospects FROM u;
  WITH u AS (UPDATE public.pipeline_orders SET company_id = _target_id WHERE company_id = ANY(_source_ids) RETURNING 1)
    SELECT count(*) INTO _moved_pipeline FROM u;
  WITH u AS (UPDATE public.orders SET company_id = _target_id WHERE company_id = ANY(_source_ids) RETURNING 1)
    SELECT count(*) INTO _moved_orders FROM u;
  WITH u AS (UPDATE public.company_contacts SET company_id = _target_id WHERE company_id = ANY(_source_ids) RETURNING 1)
    SELECT count(*) INTO _moved_contacts FROM u;
  WITH u AS (UPDATE public.company_activities SET company_id = _target_id WHERE company_id = ANY(_source_ids) RETURNING 1)
    SELECT count(*) INTO _moved_activities FROM u;

  RETURN jsonb_build_object(
    'target_id', _target_id,
    'sources', _source_ids,
    'moved_prospects', _moved_prospects,
    'moved_pipeline_orders', _moved_pipeline,
    'moved_orders', _moved_orders,
    'moved_contacts', _moved_contacts,
    'moved_activities', _moved_activities
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.relink_companies(uuid[], uuid) TO authenticated;

-- Bulk delete: unlink referencing rows then delete companies
CREATE OR REPLACE FUNCTION public.bulk_delete_companies(
  _ids uuid[],
  _unlink_first boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted int := 0;
  _unlinked_prospects int := 0;
  _unlinked_pipeline int := 0;
  _unlinked_orders int := 0;
  _deleted_contacts int := 0;
  _deleted_activities int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk delete companies';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No company ids provided';
  END IF;

  IF _unlink_first THEN
    WITH u AS (UPDATE public.prospects SET company_id = NULL WHERE company_id = ANY(_ids) RETURNING 1)
      SELECT count(*) INTO _unlinked_prospects FROM u;
    WITH u AS (UPDATE public.pipeline_orders SET company_id = NULL WHERE company_id = ANY(_ids) RETURNING 1)
      SELECT count(*) INTO _unlinked_pipeline FROM u;
    WITH u AS (UPDATE public.orders SET company_id = NULL WHERE company_id = ANY(_ids) RETURNING 1)
      SELECT count(*) INTO _unlinked_orders FROM u;
  END IF;

  -- Always remove dependent contact/activity rows (they are scoped to a company)
  WITH d AS (DELETE FROM public.company_contacts WHERE company_id = ANY(_ids) RETURNING 1)
    SELECT count(*) INTO _deleted_contacts FROM d;
  WITH d AS (DELETE FROM public.company_activities WHERE company_id = ANY(_ids) RETURNING 1)
    SELECT count(*) INTO _deleted_activities FROM d;

  WITH d AS (DELETE FROM public.companies WHERE id = ANY(_ids) RETURNING 1)
    SELECT count(*) INTO _deleted FROM d;

  RETURN jsonb_build_object(
    'deleted_companies', _deleted,
    'unlinked_prospects', _unlinked_prospects,
    'unlinked_pipeline_orders', _unlinked_pipeline,
    'unlinked_orders', _unlinked_orders,
    'deleted_contacts', _deleted_contacts,
    'deleted_activities', _deleted_activities
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_delete_companies(uuid[], boolean) TO authenticated;