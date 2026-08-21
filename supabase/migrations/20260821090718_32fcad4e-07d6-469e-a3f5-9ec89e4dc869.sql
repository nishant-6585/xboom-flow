-- The status-history recorder is a trigger function only; nothing should be able
-- to invoke it directly through the API.
REVOKE ALL ON FUNCTION public.record_import_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_grn_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_posted_goods_receipt() FROM PUBLIC, anon, authenticated;