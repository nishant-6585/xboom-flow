import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Thin wrapper around the public.can_attribute_website_order(auth.uid())
 * RPC. Returns true when the current user is admin, sales_manager, or
 * appears in attribution_grants. Falls back to the client-side role
 * check while the RPC is loading so managers don't briefly lose the
 * Assign button.
 */
export function useCanAttributeWebsiteOrder(): boolean {
  const { user, role } = useAuth();
  const fallback = role === 'admin' || role === 'sales_manager';
  const { data } = useQuery({
    queryKey: ['can-attribute-website-order', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_attribute_website_order' as any, {
        _user_id: user!.id,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });
  return data ?? fallback;
}