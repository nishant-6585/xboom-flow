import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface TicketAiSuggestion {
  id: string;
  ticket_id: string;
  suggested_priority: string | null;
  priority_reason: string | null;
  suggested_assignee_id: string | null;
  suggested_assignee_name: string | null;
  draft_reply: string | null;
  applied: boolean;
  applied_at: string | null;
  applied_by: string | null;
  applied_by_name: string | null;
  created_at: string;
}

export interface TicketSlaAlert {
  id: string;
  ticket_id: string;
  alert_message: string;
  notified_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
}

export function useTicketAiSuggestions(ticketId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ticket-ai-suggestions", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      const { data, error } = await supabase
        .from("ticket_ai_suggestions")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TicketAiSuggestion[];
    },
    enabled: !!ticketId && !!user,
  });
}

export function useTicketSlaAlerts(ticketIds?: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ticket-sla-alerts", ticketIds],
    queryFn: async () => {
      let query = supabase
        .from("ticket_sla_alerts")
        .select("*")
        .eq("acknowledged", false)
        .order("notified_at", { ascending: false });

      if (ticketIds && ticketIds.length > 0) {
        query = query.in("ticket_id", ticketIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TicketSlaAlert[];
    },
    enabled: !!user,
  });
}

export function useApplyAiSuggestion() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      suggestionId,
      ticketId,
      field,
      value,
    }: {
      suggestionId: string;
      ticketId: string;
      field: "priority" | "assignee";
      value: Record<string, unknown>;
    }) => {
      if (!user || !profile) throw new Error("Not authenticated");

      // Update the ticket
      const { error: ticketError } = await supabase
        .from("tickets")
        .update(value)
        .eq("id", ticketId);

      if (ticketError) throw ticketError;

      // Mark suggestion as applied
      const { error: suggestError } = await supabase
        .from("ticket_ai_suggestions")
        .update({
          applied: true,
          applied_at: new Date().toISOString(),
          applied_by: user.id,
          applied_by_name: profile.name,
        })
        .eq("id", suggestionId);

      if (suggestError) throw suggestError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-ai-suggestions"] });
      toast.success("AI suggestion applied");
    },
    onError: (error: Error) => {
      toast.error(`Failed to apply suggestion: ${error.message}`);
    },
  });
}

export function useAcknowledgeSlaAlert() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (alertId: string) => {
      if (!user || !profile) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("ticket_sla_alerts")
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
          acknowledged_by_name: profile.name,
        })
        .eq("id", alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-sla-alerts"] });
      toast.success("SLA alert acknowledged");
    },
    onError: (error: Error) => {
      toast.error(`Failed to acknowledge alert: ${error.message}`);
    },
  });
}

export function useAnalyzeTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { data, error } = await supabase.functions.invoke("analyze-ticket", {
        body: { ticket_id: ticketId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-ai-suggestions"] });
    },
    onError: (error: Error) => {
      console.error("AI analysis failed:", error);
      // Don't toast here - caller handles it
    },
  });
}
