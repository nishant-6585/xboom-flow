import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface TicketAiResolution {
  id: string;
  ticket_id: string;
  resolution_plan: string | null;
  lovable_prompt: string | null;
  confidence_score: number | null;
  resolution_type: string | null;
  estimated_complexity: string | null;
  root_cause: string | null;
  resolution_comment: string | null;
  needs_human_review: boolean;
  review_reason: string | null;
  approval_status: string;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  applied_at: string | null;
  created_at: string;
}

export function useTicketResolution(ticketId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ticket-ai-resolution", ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      const { data, error } = await supabase
        .from("ticket_ai_resolutions")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as TicketAiResolution | null;
    },
    enabled: !!ticketId && !!user,
  });
}

export function useRunAiResolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { data, error } = await supabase.functions.invoke("resolve-ticket-ai", {
        body: { ticket_id: ticketId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-ai-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-comments"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-notifications"] });
      toast.success("AI resolution analysis complete");
    },
    onError: (error: Error) => {
      toast.error(`AI resolution failed: ${error.message}`);
    },
  });
}

export function useApproveResolution() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({ resolutionId, ticketId }: { resolutionId: string; ticketId: string }) => {
      if (!user || !profile) throw new Error("Not authenticated");

      // Update resolution
      const { error: resError } = await supabase
        .from("ticket_ai_resolutions")
        .update({
          approval_status: "approved",
          approved_by: user.id,
          approved_by_name: profile.name,
          approved_at: new Date().toISOString(),
        })
        .eq("id", resolutionId);
      if (resError) throw resError;

      // Update ticket
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          ai_resolution_status: "approved",
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolved_by_name: profile.name,
        })
        .eq("id", ticketId);
      if (ticketError) throw ticketError;

      // Post approval comment
      await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        comment: `✅ AI resolution approved by ${profile.name}. This ticket has been marked as resolved.`,
        commented_by: user.id,
        commented_by_name: "🤖 Xboom AI",
        ai_generated: true,
        comment_type: "system",
      });

      // Fetch ticket for notifications
      const { data: ticket } = await supabase
        .from("tickets")
        .select("raised_by, assigned_to, subject")
        .eq("id", ticketId)
        .single();

      if (ticket) {
        const notifications = [];
        if (ticket.raised_by) {
          notifications.push({
            ticket_id: ticketId,
            user_id: ticket.raised_by,
            type: "ticket_resolved",
            message: `Your ticket "${ticket.subject}" has been resolved via AI resolution.`,
          });
        }
        if (ticket.assigned_to && ticket.assigned_to !== user.id) {
          notifications.push({
            ticket_id: ticketId,
            user_id: ticket.assigned_to,
            type: "resolution_approved",
            message: `AI resolution for "${ticket.subject}" has been approved by ${profile.name}.`,
          });
        }
        if (notifications.length > 0) {
          await supabase.from("ticket_notifications").insert(notifications);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-ai-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-comments"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-notifications"] });
      toast.success("Resolution approved — ticket resolved");
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });
}

export function useRejectResolution() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      resolutionId,
      ticketId,
      reason,
    }: {
      resolutionId: string;
      ticketId: string;
      reason: string;
    }) => {
      if (!user || !profile) throw new Error("Not authenticated");

      const { error: resError } = await supabase
        .from("ticket_ai_resolutions")
        .update({
          approval_status: "rejected",
          rejection_reason: reason,
        })
        .eq("id", resolutionId);
      if (resError) throw resError;

      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          ai_resolution_status: "rejected",
          status: "in_progress",
        })
        .eq("id", ticketId);
      if (ticketError) throw ticketError;

      await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        comment: `⚠️ AI resolution was reviewed and requires further investigation. Reason: ${reason}`,
        commented_by: user.id,
        commented_by_name: "🤖 Xboom AI",
        ai_generated: true,
        comment_type: "system",
      });

      // Notify assignee
      const { data: ticket } = await supabase
        .from("tickets")
        .select("assigned_to, subject")
        .eq("id", ticketId)
        .single();

      if (ticket?.assigned_to) {
        await supabase.from("ticket_notifications").insert({
          ticket_id: ticketId,
          user_id: ticket.assigned_to,
          type: "resolution_rejected",
          message: `AI resolution for "${ticket.subject}" was rejected: ${reason}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-ai-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-comments"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-notifications"] });
      toast.success("Resolution rejected");
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

// Ticket notifications hook
export interface TicketNotification {
  id: string;
  ticket_id: string;
  user_id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export function useTicketNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ticket-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as TicketNotification[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("ticket_notifications")
        .update({ read: true })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-notifications"] });
    },
  });
}
