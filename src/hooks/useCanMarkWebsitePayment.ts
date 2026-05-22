import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true when the current user may mark a website (WooCommerce) order
 * as paid. Server-side enforcement still lives in `mark_website_order_paid`;
 * this gate is purely for UI visibility.
 */
export function useCanMarkWebsitePayment() {
  return useQuery({
    queryKey: ["can_mark_website_payment"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase.rpc("can_mark_website_payment", {
        _user_id: uid,
      });
      if (error) return false;
      return Boolean(data);
    },
  });
}