import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";

export type TicketStatus = "open" | "in_progress" | "awaiting_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketCategory = "technical" | "documentation" | "spare_parts" | "training" | "billing" | "other";
export type TicketType = "general" | "service_request";

export interface PortalTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  ticket_type: TicketType;
  related_order_id: string | null;
  related_order_number: string | null;
  related_product_name: string | null;
  sla_first_response_due_at: string | null;
  sla_resolution_due_at: string | null;
}

export interface PortalTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_name_snapshot: string | null;
  body: string;
  attachments: { name: string; path: string; size?: number }[];
  created_at: string;
}

export const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "technical", label: "Technical issue" },
  { value: "documentation", label: "Documentation" },
  { value: "spare_parts", label: "Spare parts" },
  { value: "training", label: "Training" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Other" },
];

export const TICKET_PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function usePortalTickets() {
  return useQuery({
    queryKey: ["portal", "tickets"],
    queryFn: async (): Promise<PortalTicket[]> => {
      const { data, error } = await supabase
        .from("portal_tickets")
        .select("id, ticket_number, subject, description, category, priority, status, order_id, created_at, updated_at, first_response_at, resolved_at, ticket_type, related_order_id, related_order_number, related_product_name, sla_first_response_due_at, sla_resolution_due_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as PortalTicket[];
    },
  });
}

export function usePortalTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "ticket", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      if (!ticketId) throw new Error("missing id");
      const [t, m] = await Promise.all([
        supabase
          .from("portal_tickets")
          .select("id, ticket_number, subject, description, category, priority, status, order_id, created_at, updated_at, first_response_at, resolved_at, ticket_type, related_order_id, related_order_number, related_product_name, sla_first_response_due_at, sla_resolution_due_at")
          .eq("id", ticketId)
          .maybeSingle(),
        supabase
          .from("portal_ticket_messages")
          .select("id, ticket_id, sender_id, sender_name_snapshot, body, attachments, created_at")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
      ]);
      if (t.error) throw t.error;
      if (m.error) throw m.error;
      return {
        ticket: ((t.data ?? null) as unknown) as PortalTicket | null,
        messages: ((m.data ?? []) as unknown) as PortalTicketMessage[],
      };
    },
  });
}

export interface NewTicketInput {
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  order_id: string | null;
  attachments: { name: string; path: string; size?: number }[];
  ticket_type?: TicketType;
  related_order_id?: string | null;
  related_order_number?: string | null;
  related_product_name?: string | null;
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const { account, contact } = usePortalAuth();
  return useMutation({
    mutationFn: async (input: NewTicketInput) => {
      if (!account?.id) throw new Error("Account not loaded");
      const { data: ticket, error } = await supabase
        .from("portal_tickets")
        .insert({
          account_id: account.id,
          raised_by_contact_id: contact?.id ?? null,
          subject: input.subject,
          description: input.description,
          category: input.category,
          priority: input.priority,
          order_id: input.order_id,
          ticket_type: input.ticket_type ?? "general",
          related_order_id: input.related_order_id ?? null,
          related_order_number: input.related_order_number ?? null,
          related_product_name: input.related_product_name ?? null,
        } as never)
        .select("id, ticket_number")
        .single();
      if (error) throw error;

      // Seed first message with the description + attachments so the thread is complete
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("portal_ticket_messages").insert({
        ticket_id: ticket.id,
        sender_id: u?.user?.id ?? null,
        body: input.description,
        attachments: input.attachments,
        is_internal: false,
      } as never);

      // Staff alerting is owned by the DB trigger
      // trg_portal_tickets_notify_staff (migration 20260818120000): in-app +
      // push from the notifications INSERT, email + Slack from
      // portal-ticket-alert. Calling portal-notify from here never worked —
      // portal contacts hold the b2b_customer role and the function's role
      // guard rejected them with a 403 that notifyPortal only console.warn'd.

      return ticket;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal", "tickets"] }),
  });
}

export function useReplyTicket(ticketId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; attachments: { name: string; path: string; size?: number }[] }) => {
      if (!ticketId) throw new Error("missing id");
      const { data: u } = await supabase.auth.getUser();
      const { data: msg, error } = await supabase
        .from("portal_ticket_messages")
        .insert({
          ticket_id: ticketId,
          sender_id: u?.user?.id ?? null,
          body: input.body,
          attachments: input.attachments,
          is_internal: false,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      // As above: trg_portal_ticket_messages_notify_staff dispatches the
      // staff-side alert for a customer reply. This call 403'd for every
      // customer, which is why "N new from customer" never notified anyone.
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["portal", "tickets"] });
    },
  });
}