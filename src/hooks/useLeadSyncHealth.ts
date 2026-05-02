import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SyncHealthRow {
  source: string;
  label: string;
  last_record_at: string | null;
  hours_since: number | null;
  threshold_hours: number;
  is_stale: boolean;
  total_records: number;
}

export function useLeadSyncHealth() {
  return useQuery({
    queryKey: ["lead-sync-health"],
    queryFn: async (): Promise<SyncHealthRow[]> => {
      const { data, error } = await supabase.functions.invoke("sync-health-check", {
        body: {},
      });
      if (error) throw error;
      return (data?.health || []) as SyncHealthRow[];
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}