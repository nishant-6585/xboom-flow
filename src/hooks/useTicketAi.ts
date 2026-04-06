import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
