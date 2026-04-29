-- Backfill account_owner_id for companies based on most recent order salesperson
UPDATE public.companies c
SET account_owner_id = sub.owner_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, sales_person_id AS owner_id
  FROM public.orders
  WHERE company_id IS NOT NULL AND sales_person_id IS NOT NULL
  ORDER BY company_id, order_date DESC NULLS LAST
) sub
WHERE c.id = sub.company_id
  AND c.account_owner_id IS NULL;

-- Trigger: default company.account_owner_id to creator on insert
CREATE OR REPLACE FUNCTION public.auto_assign_company_account_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_owner_id IS NULL THEN
    NEW.account_owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_company_account_owner ON public.companies;
CREATE TRIGGER trg_auto_assign_company_account_owner
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_company_account_owner();

-- Trigger: sync company.account_owner_id from orders.sales_person_id when null
CREATE OR REPLACE FUNCTION public.sync_company_account_owner_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.sales_person_id IS NOT NULL THEN
    UPDATE public.companies
    SET account_owner_id = NEW.sales_person_id
    WHERE id = NEW.company_id
      AND account_owner_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_account_owner_from_order ON public.orders;
CREATE TRIGGER trg_sync_company_account_owner_from_order
AFTER INSERT OR UPDATE OF sales_person_id, company_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_company_account_owner_from_order();