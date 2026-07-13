import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesUser {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
}

const SALES_ROLES = ['sales', 'sales_manager', 'admin', 'supply_chain'];

/**
 * Returns users eligible to be assigned as a Company Account Owner.
 * Includes sales, sales_manager, supply_chain, and admin roles.
 */
export function useSalesUsers() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['sales-eligible-users'],
    queryFn: async (): Promise<SalesUser[]> => {
      // Try the SECURITY DEFINER RPC first — this returns sales/sales_manager
      // users to admins, sales managers, and supply chain even when RLS on
      // user_roles/profiles would otherwise hide them.
      const { data: rpcRows, error: rpcErr } = await supabase.rpc(
        'list_sales_attribution_candidates' as any,
      );
      if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
        return (rpcRows as any[])
          .map((r) => ({
            user_id: r.user_id,
            name: r.name || r.email || 'Unknown',
            email: r.email ?? null,
            role: r.role || 'sales',
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      const { data: roles, error: rErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', SALES_ROLES as any);
      if (rErr) throw rErr;

      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      if (!ids.length) return [];

      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, name, email')
        .in('user_id', ids);
      if (pErr) throw pErr;

      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((r: any) => {
        // Prefer most specific role over admin
        const cur = roleMap.get(r.user_id);
        if (!cur || cur === 'admin') roleMap.set(r.user_id, r.role);
      });

      return (profiles ?? [])
        .map((p: any) => ({
          user_id: p.user_id,
          name: p.name || p.email || 'Unknown',
          email: p.email,
          role: roleMap.get(p.user_id) || 'sales',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return { salesUsers: data, isLoading };
}