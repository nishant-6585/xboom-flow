import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches a global map of profiles { user_id -> display_name }.
 * Used to render the "Assigned To" column consistently across all
 * lead-list panels (My Leads, All Leads, Q-Forms, Email, Prospects, etc.)
 *
 * Cached for 5 minutes — names rarely change.
 */
export function useProfileNames() {
  const { data, isLoading } = useQuery({
    queryKey: ["profile-names-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, string>();
      (data ?? []).forEach((p: any) => {
        if (p?.user_id) map.set(p.user_id, p.name || p.email || "Unknown");
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const resolveName = (userId: string | null | undefined): string => {
    if (!userId) return "Unassigned";
    return data?.get(userId) ?? "—";
  };

  return { profilesMap: data ?? new Map<string, string>(), resolveName, isLoading };
}
