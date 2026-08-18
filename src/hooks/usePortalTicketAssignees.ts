import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortalTicketAssignee {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
  /**
   * False means the Slack sync has not populated the pool yet and this row
   * came from the role-based fallback — i.e. the list is wider than the
   * #customer-portal-ticket channel. Surfaced in the admin UI.
   */
  in_slack_channel: boolean;
  /** Tickets handed to this person by the round-robin, for load visibility. */
  assigned_count: number;
}

export interface AssigneeSyncResult {
  ok: boolean;
  error?: string;
  channel?: string;
  slack_members?: number;
  pool?: number;
  added?: number;
  kept?: number;
  deactivated?: number;
  unmatched?: Array<{ slack_user_id: string; slack_handle: string; email: string }>;
  skipped?: Array<{ slack_user_id: string; reason: string }>;
}

/**
 * Staff who can own a portal ticket — the membership of the Slack channel
 * #customer-portal-ticket, kept in sync by sync-portal-ticket-assignees.
 *
 * Backed by the `list_portal_ticket_assignees` SECURITY DEFINER RPC because
 * RLS on user_roles/profiles otherwise hides teammates from a supply_chain
 * user — the same reason `list_sales_attribution_candidates` exists for the
 * lead-assignment flow. If the pool is empty the RPC falls back to the
 * role-based list so assignment never becomes impossible; those rows come
 * back with `in_slack_channel: false`.
 */
export function usePortalTicketAssignees() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["portal-ticket-assignees"],
    queryFn: async (): Promise<PortalTicketAssignee[]> => {
      const { data, error } = await (supabase as any).rpc("list_portal_ticket_assignees");
      if (error) throw error;
      return ((data ?? []) as PortalTicketAssignee[]).map((r) => ({
        user_id: r.user_id,
        name: r.name || r.email || "Unknown",
        email: r.email ?? null,
        role: r.role || "supply_chain",
        in_slack_channel: r.in_slack_channel !== false,
        assigned_count: r.assigned_count ?? 0,
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return { assignees: data, isLoading };
}

/**
 * Assign (or clear, with userId === null) the owner of a portal ticket.
 * The RPC writes portal_tickets.assigned_to, which fires the assignment
 * trigger — the new owner gets bell + push + email + Slack DM.
 */
export function useAssignPortalTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, userId }: { ticketId: string; userId: string | null }) => {
      const { error } = await (supabase as any).rpc("assign_portal_ticket", {
        _ticket_id: ticketId,
        _user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "portal-tickets", "inbox"] });
      qc.invalidateQueries({ queryKey: ["admin", "portal-ticket"] });
    },
  });
}

/**
 * Re-read the Slack channel and reconcile the assignment pool now, rather than
 * waiting for the 6-hourly cron. Used by the "Sync now" button after someone
 * is added to or removed from #customer-portal-ticket.
 */
export function useSyncPortalTicketAssignees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<AssigneeSyncResult> => {
      const { data, error } = await supabase.functions.invoke(
        "sync-portal-ticket-assignees",
        { body: {} },
      );
      if (error) throw error;
      const res = data as AssigneeSyncResult;
      // The function reports a refusal (e.g. nothing matched) as ok:false with
      // a 422 rather than throwing, so surface that as a failure here.
      if (res && res.ok === false) throw new Error(res.error ?? "Sync failed");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-ticket-assignees"] });
      qc.invalidateQueries({ queryKey: ["admin", "portal-tickets", "inbox"] });
    },
  });
}
