-- Harden objects added by the MyOperator ownership migrations.
ALTER VIEW public.myoperator_unmapped_agents SET (security_invoker = on);

REVOKE ALL ON FUNCTION public._b_mirror_call_logs_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._z_sync_directory_owner_call_logs() FROM PUBLIC, anon, authenticated;