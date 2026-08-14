import { useEffect, useRef } from "react";
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
  disposition_reason_code: string | null;
  disposition_reason_note: string | null;
  disposition_at: string | null;
  disposition_by_name: string | null;
  is_prospect: boolean;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface ManychatMessage {
  id: string;
  lead_id: string;
  channel: string | null;
  message: string;
  received_at: string;
}

/** Logged incoming messages for one lead, oldest first. */
export function useManychatMessages(leadId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!leadId) return;
    const ch = supabase
      .channel(`manychat-messages-${leadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "manychat_messages", filter: `lead_id=eq.${leadId}` },
        () => queryClient.invalidateQueries({ queryKey: ["manychat-messages", leadId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [leadId, queryClient]);

  return useQuery({
    queryKey: ["manychat-messages", leadId],
    enabled: Boolean(leadId),
    queryFn: async (): Promise<ManychatMessage[]> => {
      const { data, error } = await (supabase as any)
        .from("manychat_messages")
        .select("id, lead_id, channel, message, received_at")
        .eq("lead_id", leadId)
        .order("received_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as ManychatMessage[];
    },
    staleTime: 30 * 1000,
  });
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
  const queryClient = useQueryClient();
  const pendingInvalidate = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live updates: any insert/update on manychat_leads refreshes the table.
  // Invalidations are coalesced so bursts (CSV imports) trigger one refetch.
  useEffect(() => {
    const ch = supabase
      .channel("manychat-leads-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manychat_leads" },
        () => {
          if (pendingInvalidate.current) return;
          pendingInvalidate.current = setTimeout(() => {
            pendingInvalidate.current = null;
            queryClient.invalidateQueries({ queryKey: ["manychat-leads"] });
          }, 1000);
        },
      )
      .subscribe();
    return () => {
      if (pendingInvalidate.current) clearTimeout(pendingInvalidate.current);
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

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

export interface ManychatTestResult {
  ok: boolean;
  status: number;
  response: string;
  payload?: Record<string, unknown>;
}

export function useManychatTestWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ManychatTestResult> => {
      const { data, error } = await supabase.functions.invoke("manychat-admin", {
        body: { action: "test_webhook" },
      });
      if (error) throw error;
      return data as ManychatTestResult;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["manychat-leads"] });
      queryClient.invalidateQueries({ queryKey: ["manychat-sync-log"] });
      const msg = `HTTP ${res.status} — ${res.response?.slice(0, 180) || "(empty body)"}`;
      if (res.ok) toast.success(`Test webhook delivered · ${msg}`);
      else toast.error(`Test webhook failed · ${msg}`);
    },
    onError: (e: Error) => toast.error(`Test webhook failed: ${e.message}`),
  });
}

export function useRemoveManychatTestLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manychat-admin", {
        body: { action: "remove_test_leads" },
      });
      if (error) throw error;
      return data as { ok: boolean; deleted: number };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["manychat-leads"] });
      toast.success(`Removed ${res?.deleted ?? 0} test lead(s)`);
    },
    onError: (e: Error) => toast.error(`Could not remove test leads: ${e.message}`),
  });
}

export interface ManychatImportSummary {
  ok: boolean;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  errors?: string[];
}

export function useManychatCsvImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, unknown>[]): Promise<ManychatImportSummary> => {
      // The edge function has a 150s idle timeout; send the file in small
      // sequential batches and aggregate the results.
      const BATCH = 250;
      const total: ManychatImportSummary = {
        ok: true, received: 0, created: 0, updated: 0, skipped: 0, errored: 0, errors: [],
      };
      for (let i = 0; i < rows.length; i += BATCH) {
        const { data, error } = await supabase.functions.invoke("manychat-admin", {
          body: { action: "csv_import", rows: rows.slice(i, i + BATCH) },
        });
        if (error) throw error;
        const res = data as ManychatImportSummary;
        total.received += res.received ?? 0;
        total.created += res.created ?? 0;
        total.updated += res.updated ?? 0;
        total.skipped += res.skipped ?? 0;
        total.errored += res.errored ?? 0;
        if (res.errors?.length) total.errors = [...(total.errors ?? []), ...res.errors].slice(0, 5);
        if (!res.ok) total.ok = false;
      }
      return total;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["manychat-leads"] });
      queryClient.invalidateQueries({ queryKey: ["manychat-sync-log"] });
      toast.success(
        `Import done — ${res.created} created, ${res.updated} updated, ${res.skipped} skipped, ${res.errored} errored`,
      );
    },
    onError: (e: Error) => toast.error(`CSV import failed: ${e.message}`),
  });
}
