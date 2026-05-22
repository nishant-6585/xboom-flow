import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns whether the current user can mark website orders as paid.
 * Admins always can; others require an entry in `payment_marker_grants`.
 */
export function useCanMarkWebsitePayment() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["can-mark-website-payment", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "can_mark_website_payment" as never,
        { _user_id: userId } as never,
      );
      if (error) throw error;
      return Boolean(data);
    },
  });

  return { canMark: data ?? false, isLoading };
}