-- 1) attribution_grants: per-user override letting a non-manager attribute website orders
CREATE TABLE IF NOT EXISTS public.attribution_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.attribution_grants TO authenticated;
GRANT ALL ON public.attribution_grants TO service_role;

ALTER TABLE public.attribution_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage attribution grants" ON public.attribution_grants;
CREATE POLICY "Admins manage attribution grants" ON public.attribution_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Grant holders see own row" ON public.attribution_grants;
CREATE POLICY "Grant holders see own row" ON public.attribution_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2) capability function
CREATE OR REPLACE FUNCTION public.can_attribute_website_order(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'sales_manager')
    OR EXISTS (SELECT 1 FROM public.attribution_grants WHERE user_id = _user_id);
$$;

REVOKE EXECUTE ON FUNCTION public.can_attribute_website_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_attribute_website_order(uuid) TO authenticated;

-- 3) seed Sanu Sabu
INSERT INTO public.attribution_grants (user_id, note)
VALUES ('ac290dd5-7f28-4930-9a15-52f626e31938', 'Supply chain — website order attribution granted')
ON CONFLICT (user_id) DO NOTHING;

-- 4) attribute_website_order: use capability function; no longer blanket supply_chain
CREATE OR REPLACE FUNCTION public.attribute_website_order(p_order_id uuid, p_sales_person_id uuid, p_reason text, p_reason_custom text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.can_attribute_website_order(v_actor) THEN
    RAISE EXCEPTION 'forbidden: admin, sales_manager, or granted users only';
  END IF;
  SELECT COALESCE(name, email) INTO v_actor_name FROM public.profiles WHERE user_id = v_actor;
  PERFORM public._attribute_website_order_core(
    p_order_id, p_sales_person_id, p_reason, p_reason_custom,
    'direct', v_actor, v_actor_name
  );
END;
$function$;

-- 5) Backfill display name for the system ingestion user on existing website mirror rows
UPDATE public.orders
   SET sales_person_name = 'Vishal'
 WHERE sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'
   AND sales_person_name = 'Website (Auto)';