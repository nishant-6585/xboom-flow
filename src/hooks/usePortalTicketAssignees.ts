import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortalTicketAssignee {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
}

/**
 * Internal users who can own a portal ticket, supply chain first.
 *
 * Backed by the `list_portal_ticket_assignees` SECURITY DEFINER RPC because
 * RLS on user_roles/profiles otherwise hides teammates from a supply_chain
 * user — the same reason `list_sales_attribution_candidates` exists for the
 * lead-assignment flow.
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
