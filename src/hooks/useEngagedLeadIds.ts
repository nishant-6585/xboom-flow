import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Set of source_ids that have at least one followup or prospect logged
 * for the given source_type. Used to mark a lead row as "touched" even when the
 * source-table row itself was never updated.
 */
export function useEngagedLeadIds(sourceType: string | string[]) {
  const types = Array.isArray(sourceType) ? sourceType : [sourceType];
  const key = types.join(",");
  return useQuery({
    queryKey: ["engaged-lead-ids", key],
    queryFn: async () => {
      const out = new Set<string>();
      const PAGE = 1000;
      const pull = async (table: string) => {
        let f = 0;
        while (f < 50000) {
          const { data, error } = await (supabase as any)
            .from(table)
            .select("source_id, source_type")
            .in("source_type", types)
            .range(f, f + PAGE - 1);
          if (error) throw error;
          const batch = (data ?? []) as any[];
          for (const r of batch) if (r?.source_id) out.add(String(r.source_id));
          if (batch.length < PAGE) break;
          f += PAGE;
        }
      };
      await Promise.all([pull("followups"), pull("prospects")]);
      return out;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}