import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";
import { sendSlackNotification } from "@/hooks/useSlackSettings";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];
type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
type TicketCategory = Database["public"]["Enums"]["ticket_category"];

// Helper function to send ticket email notifications
const sendTicketEmail = async (payload: {
  type: "status_update" | "assignment";
  ticket_number: string;
  subject: string;
  old_status?: string;
  new_status?: string;
  priority: string;
  resolution_notes?: string;
  assigned_to_name?: string;
  raised_by_name?: string;
  updated_by_name?: string;
  recipient_user_id: string;
  sla_due_at?: string;
  category?: string;
}) => {
  try {
    const { error } = await supabase.functions.invoke("send-ticket-email", {
      body: payload,
    });
    if (error) {
      console.error("Failed to send ticket email:", error);
    }
  } catch (err) {
    console.error("Error invoking ticket email function:", err);
  }
};
type AppRole = Database["public"]["Enums"]["app_role"];

export interface Ticket {
  id: string;
  ticket_number: string | null;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  raised_by: string;
  raised_by_name: string;
  raised_by_department: AppRole;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_department: AppRole;
  assigned_at: string | null;
  order_id: string | null;
  enquiry_id: string | null;
  sla_due_at: string | null;
  sla_response_at: string | null;
  sla_breached: boolean;
  sla_status: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  attachment_urls: string[] | null;
  ai_summary: string | null;
  ai_category: string | null;
  ai_resolution_status: string | null;
  created_at: string;
  updated_at: string;
  orders?: { order_number: string | null; customer_name: string } | null;
  enquiries?: { customer_name: string; product_name: string } | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  comment: string;
  commented_by: string;
  commented_by_name: string;
  is_internal: boolean | null;
  attachment_urls: string[] | null;
  ai_generated: boolean;
  comment_type: string;
  created_at: string;
}

export interface CreateTicketData {
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  assigned_department: AppRole;
  order_id?: string | null;
  enquiry_id?: string | null;
  attachment_urls?: string[];
  assigned_to?: string | null;
  assigned_to_name?: string | null;
}

export interface UpdateTicketData {
  id: string;
  status?: TicketStatus;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  resolution_notes?: string;
  priority?: TicketPriority;
  subject?: string;
  description?: string;
  category?: TicketCategory;
  attachment_urls?: string[];
}

export function useTickets() {
  const queryClient = useQueryClient();
  const { user, profile, role } = useAuth();

  const {
    data: tickets = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          *,
          orders:order_id(order_number, customer_name),
          enquiries:enquiry_id(customer_name, product_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Ticket[];
    },
    enabled: !!user,
  });

  const createTicket = useMutation({
    mutationFn: async (data: CreateTicketData) => {
      if (!user || !profile || !role) throw new Error("User not authenticated");

      const insertData = {
        subject: data.subject,
        description: data.description,
        category: data.category,
        priority: data.priority,
        assigned_department: data.assigned_department,
        raised_by: user.id,
        raised_by_name: profile.name,
        raised_by_department: role as AppRole,
        order_id: data.order_id || null,
        enquiry_id: data.enquiry_id || null,
        attachment_urls: data.attachment_urls || null,
        assigned_to: data.assigned_to || null,
        assigned_to_name: data.assigned_to_name || null,
        status: data.assigned_to ? "assigned" as const : "open" as const,
        assigned_at: data.assigned_to ? new Date().toISOString() : null,
      };

      const { data: createdTicket, error } = await supabase
        .from("tickets")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Send Slack notification if ticket is assigned to someone
      if (data.assigned_to && createdTicket) {
        // Fetch assigned user's slack_user_id
        const { data: assignedProfile } = await supabase
          .from("profiles")
          .select("slack_user_id")
          .eq("user_id", data.assigned_to)
          .single();

        sendSlackNotification("ticket_assigned", {
          ticket_number: createdTicket.ticket_number,
          subject: data.subject,
          description: data.description,
          category: data.category,
          priority: data.priority,
          raised_by_name: profile.name,
          raised_by_department: role,
          assigned_to_name: data.assigned_to_name,
          sla_due_at: createdTicket.sla_due_at,
          slack_user_id: assignedProfile?.slack_user_id,
        });

        // Send email notification to assigned user
        sendTicketEmail({
          type: "assignment",
          ticket_number: createdTicket.ticket_number || "",
          subject: data.subject,
          priority: data.priority,
          assigned_to_name: data.assigned_to_name || undefined,
          raised_by_name: profile.name,
          recipient_user_id: data.assigned_to,
          sla_due_at: createdTicket.sla_due_at || undefined,
          category: data.category,
        });
      }

      return createdTicket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create ticket: ${error.message}`);
    },
  });

  const updateTicket = useMutation({
    mutationFn: async (data: UpdateTicketData) => {
      if (!user || !profile) throw new Error("User not authenticated");

      // First fetch the current ticket to get old values
      const { data: currentTicket } = await supabase
        .from("tickets")
        .select("*, raised_by, status, assigned_to")
        .eq("id", data.id)
        .single();

      const updates: Record<string, unknown> = {};
      let oldStatus = currentTicket?.status;
      let isStatusChange = false;
      let isNewAssignment = false;

      if (data.status !== undefined) {
        updates.status = data.status;
        isStatusChange = oldStatus !== data.status;
        
        if (data.status === "assigned" && data.assigned_to) {
          updates.assigned_at = new Date().toISOString();
          updates.sla_response_at = new Date().toISOString();
        }
        
        if (data.status === "resolved") {
          updates.resolved_at = new Date().toISOString();
          updates.resolved_by = user.id;
          updates.resolved_by_name = profile.name;
        }
      }

      if (data.assigned_to !== undefined) {
        updates.assigned_to = data.assigned_to;
        updates.assigned_to_name = data.assigned_to_name;
        if (data.assigned_to && currentTicket?.assigned_to !== data.assigned_to) {
          updates.status = "assigned";
          updates.assigned_at = new Date().toISOString();
          isNewAssignment = true;
        }
      }

      if (data.resolution_notes !== undefined) {
        updates.resolution_notes = data.resolution_notes;
      }

      if (data.priority !== undefined) {
        updates.priority = data.priority;
      }

      if (data.subject !== undefined) {
        updates.subject = data.subject;
      }

      if (data.description !== undefined) {
        updates.description = data.description;
      }

      if (data.category !== undefined) {
        updates.category = data.category;
      }

      if (data.attachment_urls !== undefined) {
        updates.attachment_urls = data.attachment_urls;
      }

      const { data: updatedTicket, error } = await supabase
        .from("tickets")
        .update(updates)
        .eq("id", data.id)
        .select()
        .single();

      if (error) throw error;

      // Send Slack notification to newly assigned user
      if (isNewAssignment && data.assigned_to && updatedTicket) {
        const { data: assignedProfile } = await supabase
          .from("profiles")
          .select("slack_user_id")
          .eq("user_id", data.assigned_to)
          .single();

        sendSlackNotification("ticket_assigned", {
          ticket_number: updatedTicket.ticket_number,
          subject: updatedTicket.subject,
          description: updatedTicket.description,
          category: updatedTicket.category,
          priority: updatedTicket.priority,
          raised_by_name: updatedTicket.raised_by_name,
          raised_by_department: updatedTicket.raised_by_department,
          assigned_to_name: data.assigned_to_name,
          sla_due_at: updatedTicket.sla_due_at,
          slack_user_id: assignedProfile?.slack_user_id,
        });

        // Send email notification to assigned user
        sendTicketEmail({
          type: "assignment",
          ticket_number: updatedTicket.ticket_number || "",
          subject: updatedTicket.subject,
          priority: updatedTicket.priority,
          assigned_to_name: data.assigned_to_name || undefined,
          raised_by_name: updatedTicket.raised_by_name,
          recipient_user_id: data.assigned_to,
          sla_due_at: updatedTicket.sla_due_at || undefined,
          category: updatedTicket.category,
        });
      }

      // Send status change notification to the user who raised the ticket
      if (isStatusChange && currentTicket?.raised_by && updatedTicket) {
        const { data: raiserProfile } = await supabase
          .from("profiles")
          .select("slack_user_id")
          .eq("user_id", currentTicket.raised_by)
          .single();

        sendSlackNotification("ticket_status_change", {
          ticket_number: updatedTicket.ticket_number,
          subject: updatedTicket.subject,
          old_status: oldStatus,
          new_status: data.status || updatedTicket.status,
          resolution_notes: data.resolution_notes || updatedTicket.resolution_notes,
          updated_by_name: profile.name,
          slack_user_id: raiserProfile?.slack_user_id,
        });

        // Send email notification to ticket creator about status change
        sendTicketEmail({
          type: "status_update",
          ticket_number: updatedTicket.ticket_number || "",
          subject: updatedTicket.subject,
          old_status: oldStatus,
          new_status: data.status || updatedTicket.status,
          priority: updatedTicket.priority,
          resolution_notes: data.resolution_notes || updatedTicket.resolution_notes || undefined,
          updated_by_name: profile.name,
          recipient_user_id: currentTicket.raised_by,
        });
      }

      return updatedTicket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update ticket: ${error.message}`);
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from("tickets")
        .delete()
        .eq("id", ticketId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete ticket: ${error.message}`);
    },
  });

  return {
    tickets,
    isLoading,
    error,
    createTicket,
    updateTicket,
    deleteTicket,
  };
}

export function useTicketComments(ticketId: string | null) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  const {
    data: comments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ticket-comments", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as TicketComment[];
    },
    enabled: !!ticketId && !!user,
  });

  const addComment = useMutation({
    mutationFn: async ({
      comment,
      isInternal = false,
      attachmentUrls = [],
    }: {
      comment: string;
      isInternal?: boolean;
      attachmentUrls?: string[];
    }) => {
      if (!user || !profile || !ticketId) throw new Error("Missing required data");

      const { error } = await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        comment,
        commented_by: user.id,
        commented_by_name: profile.name,
        is_internal: isInternal,
        attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      toast.success("Comment added");
    },
    onError: (error: Error) => {
      toast.error(`Failed to add comment: ${error.message}`);
    },
  });

  const editComment = useMutation({
    mutationFn: async ({ commentId, comment }: { commentId: string; comment: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("ticket_comments")
        .update({ comment })
        .eq("id", commentId)
        .eq("commented_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      toast.success("Comment updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update comment: ${error.message}`);
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("ticket_comments")
        .delete()
        .eq("id", commentId)
        .eq("commented_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      toast.success("Comment deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete comment: ${error.message}`);
    },
  });

  return {
    comments,
    isLoading,
    error,
    addComment,
    editComment,
    deleteComment,
  };
}

export function useTeamMembers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["team-members-for-tickets"],
    queryFn: async () => {
      const [profilesResult, rolesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, name, email")
          .eq("is_approved", true),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;

      // Build a map of user_id -> roles[] to support multiple roles per user
      const roleMap = new Map<string, string[]>();
      rolesResult.data.forEach((r) => {
        const existing = roleMap.get(r.user_id) || [];
        existing.push(r.role);
        roleMap.set(r.user_id, existing);
      });

      // Flatten: one entry per user per role, so department filtering picks them up
      return profilesResult.data.flatMap((p) => {
        const roles = roleMap.get(p.user_id) || [null];
        return roles.map((role) => ({
          ...p,
          role,
        }));
      });
    },
    enabled: !!user,
  });
}
