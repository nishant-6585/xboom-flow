import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];
type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
type TicketCategory = Database["public"]["Enums"]["ticket_category"];
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
  sla_status: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  attachment_urls: string[] | null;
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

      const { error } = await supabase.from("tickets").insert(insertData);

      if (error) throw error;
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

      const updates: Record<string, unknown> = {};

      if (data.status !== undefined) {
        updates.status = data.status;
        
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
        if (data.assigned_to) {
          updates.status = "assigned";
          updates.assigned_at = new Date().toISOString();
        }
      }

      if (data.resolution_notes !== undefined) {
        updates.resolution_notes = data.resolution_notes;
      }

      if (data.priority !== undefined) {
        updates.priority = data.priority;
      }

      const { error } = await supabase
        .from("tickets")
        .update(updates)
        .eq("id", data.id);

      if (error) throw error;
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

  return {
    comments,
    isLoading,
    error,
    addComment,
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

      const roleMap = new Map<string, string>();
      rolesResult.data.forEach((r) => {
        roleMap.set(r.user_id, r.role);
      });

      return profilesResult.data.map((p) => ({
        ...p,
        role: roleMap.get(p.user_id) || null,
      }));
    },
    enabled: !!user,
  });
}
