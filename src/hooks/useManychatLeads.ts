import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ManychatLead {
  id: string;
  manychat_contact_id: string | null;
  customer_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  country_code: string | null;
  email: string | null;
  city: string | null;
  channel: string | null;
  source: string;
  flow_name: string | null;
  product_name: string | null;
  quantity: number | null;
  notes: string | null;
  company: string | null;
  status: string;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  manychat_created_at: string | null;
  last_interaction_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  disposition: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface ManychatSyncLogRow {
  id: string;
  trigger_source: string;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  error: string | null;
  created_at: string;
}

export function useManychatLeads() {
  return useQuery({
    queryKey: ["manychat-leads"],
    queryFn: async (): Promise<ManychatLead[]> => {
      const PAGE = 1000;
      const all: ManychatLead[] = [];
      let from = 0;
      for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase
          .from("manychat_leads")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as unknown as ManychatLead[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 60 * 1000,
  });
}

export function useManychatSyncLog() {
  return useQuery({
    queryKey: ["manychat-sync-log"],
    queryFn: async (): Promise<ManychatSyncLogRow[]> => {
      const { data, error } = await supabase
        .from("manychat_sync_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as unknown as ManychatSyncLogRow[];
    },
    staleTime: 30 * 1000,
  });
}

export function useManychatSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manychat-sync", {
        body: { limit: 200 },
      });
      if (error) throw error;
      return data as { ok: boolean; checked: number; updated: number; errors?: string[] };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["manychat-leads"] });
      queryClient.invalidateQueries({ queryKey: ["manychat-sync-log"] });
      if (res?.ok) {
        toast.success(`ManyChat sync complete — ${res.updated} of ${res.checked} contacts refreshed`);
      } else {
        toast.error(`Sync finished with issues: ${res?.errors?.[0] ?? "unknown error"}`);
      }
    },
    onError: (e: Error) => toast.error(`ManyChat sync failed: ${e.message}`),
  });
}
