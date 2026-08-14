CREATE OR REPLACE FUNCTION public.set_lead_assignee(
  _source_table text,
  _source_row_id text,
  _user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name TEXT;
  _id_col TEXT;
  _name_col TEXT;
  _is_text_id BOOLEAN := false;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'sales'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  CASE _source_table
    WHEN 'leads'            THEN _id_col := 'assigned_to';      _name_col := 'assigned_to_name';
    WHEN 'form_leads'       THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'google_ads_leads' THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'email_leads'      THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'call_logs'        THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'interakt_leads'   THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
                                 _is_text_id := true;
    ELSE RAISE EXCEPTION 'invalid_source_table: %', _source_table;
  END CASE;

  SELECT name INTO _name FROM public.profiles WHERE user_id = _user_id;

  IF _is_text_id THEN
    EXECUTE format(
      'UPDATE public.%I SET %I = $1, %I = $2 WHERE id::text = $3',
      _source_table, _id_col, _name_col
    ) USING _user_id::text, _name, _source_row_id;
  ELSE
    EXECUTE format(
      'UPDATE public.%I SET %I = $1, %I = $2 WHERE id::text = $3',
      _source_table, _id_col, _name_col
    ) USING _user_id, _name, _source_row_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.set_lead_assignee(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_lead_assignee(text, text, uuid) TO authenticated;