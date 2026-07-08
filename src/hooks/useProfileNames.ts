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
        .select("user_id, name, email, avatar_url")
        .limit(2000);
      if (error) throw error;
      const names = new Map<string, string>();
      const avatars = new Map<string, string | null>();
      (data ?? []).forEach((p: any) => {
        if (!p?.user_id) return;
        names.set(p.user_id, p.name || p.email || "Unknown");
        avatars.set(p.user_id, p.avatar_url ?? null);
      });
      return { names, avatars };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const resolveName = (userId: string | null | undefined): string => {
    if (!userId) return "Unassigned";
    return data?.names.get(userId) ?? "—";
  };

  const resolveAvatar = (userId: string | null | undefined): string | null => {
    if (!userId) return null;
    return data?.avatars.get(userId) ?? null;
  };

  return {
    profilesMap: data?.names ?? new Map<string, string>(),
    avatarsMap: data?.avatars ?? new Map<string, string | null>(),
    resolveName,
    resolveAvatar,
    isLoading,
  };
}
