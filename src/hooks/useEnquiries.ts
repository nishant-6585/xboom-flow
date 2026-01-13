import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export type QueryStatus = "pending" | "responded" | "on_hold" | "moved_to_pipeline" | "order_won" | "order_lost";
export type UrgencyLevel = "low" | "medium" | "high" | "critical";

export const ENQUIRY_STATUSES: { value: QueryStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "responded", label: "Responded" },
  { value: "on_hold", label: "On Hold" },
  { value: "moved_to_pipeline", label: "Moved to Pipeline" },
  { value: "order_won", label: "Order Won" },
  { value: "order_lost", label: "Order Lost" },
];

export type LostReason = "pricing" | "timeline" | "competition" | "budget" | "specifications" | "other";

export const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: "pricing", label: "Pricing too high" },
  { value: "timeline", label: "Timeline not acceptable" },
  { value: "competition", label: "Lost to competition" },
  { value: "budget", label: "Customer budget constraints" },
  { value: "specifications", label: "Specifications mismatch" },
  { value: "other", label: "Other reason" },
];

export interface Enquiry {
  id: string;
  product_name: string;
  product_code: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  sales_person_id: string | null;
  sales_person_name: string;
  urgency: UrgencyLevel;
  notes: string;
  requested_timeline: string | null;
  status: QueryStatus;
  response_pricing: string | null;
  response_availability: string | null;
  response_lead_time: string | null;
  response_notes: string | null;
  responded_by: string | null;
  responded_by_name: string | null;
  responded_at: string | null;
  is_escalated: boolean;
  escalated_at: string | null;
  escalated_by: string | null;
  escalated_by_name: string | null;
  escalation_reason: string | null;
  admin_response: string | null;
  admin_response_by: string | null;
  admin_response_by_name: string | null;
  admin_response_at: string | null;
  order_outcome: string | null;
  lost_reason: LostReason | null;
  lost_reason_notes: string | null;
  outcome_updated_at: string | null;
  outcome_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const PRODUCT_CATEGORIES = [
  "Accessories",
  "Agri Drones",
  "Anti-Drone Gun",
  "Anti-Drone Systems",
  "Bellabot Robots",
  "Cameras",
  "Consumer Drones",
  "Custom Drones",
  "DJI Drone",
  "Drone as a Service",
  "Drone Components",
  "Drone Rentals",
  "Drone Repair",
  "Drone Shows",
  "Drone Software",
  "Enterprise Drones",
  "Humanoid Robots",
  "Imported Drone",
  "Robo Dog",
  "Robot Rental",
  "Robots",
  "Safety Gadgets",
  "Survey Equipment",
  "Underwater Drone Repair",
  "Underwater Drones",
  "Underwater Robots",
  "VR Gadgets",
  "VTOLs",
  "Cleaning Drones",
  "Internal Inspection Drone",
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export interface EnquiryFormData {
  productName: string;
  productCode: string;
  productCategory: ProductCategory;
  quantity: number;
  customerName: string;
  customerCompany: string;
  urgency: UrgencyLevel;
  requestedTimeline: string;
  notes: string;
}

export interface EnquiryResponse {
  pricing?: string;
  availability?: string;
  leadTime?: string;
  notes?: string;
}

export function useEnquiries() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile, role } = useAuth();
  const { toast } = useToast();

  const fetchEnquiries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("enquiries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEnquiries((data || []) as Enquiry[]);
    } catch (error) {
      console.error("Error fetching enquiries:", error);
      toast({
        title: "Error",
        description: "Failed to fetch enquiries",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchEnquiries();
    }
  }, [user, fetchEnquiries]);

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("enquiries-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "enquiries",
        },
        () => {
          fetchEnquiries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchEnquiries]);

  const createEnquiry = async (formData: EnquiryFormData) => {
    if (!user || !profile) {
      toast({
        title: "Error",
        description: "You must be logged in to create an enquiry",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase.from("enquiries").insert({
        product_name: formData.productName,
        product_code: formData.productCode,
        product_category: formData.productCategory,
        quantity: formData.quantity,
        customer_name: formData.customerName,
        customer_company: formData.customerCompany,
        sales_person_id: user.id,
        sales_person_name: profile.name,
        urgency: formData.urgency,
        requested_timeline: formData.requestedTimeline || null,
        notes: formData.notes,
        status: "pending",
      });

      if (error) throw error;

      toast({
        title: "Enquiry Submitted",
        description: "Your product enquiry has been sent to the supply chain team.",
      });

      return true;
    } catch (error) {
      console.error("Error creating enquiry:", error);
      toast({
        title: "Error",
        description: "Failed to submit enquiry",
        variant: "destructive",
      });
      return false;
    }
  };

  const updateEnquiry = async (
    enquiryId: string,
    status: QueryStatus,
    response: EnquiryResponse
  ) => {
    if (!user || !profile) return false;

    try {
      const { error } = await supabase
        .from("enquiries")
        .update({
          status,
          response_pricing: response.pricing || null,
          response_availability: response.availability || null,
          response_lead_time: response.leadTime || null,
          response_notes: response.notes || null,
          responded_by: user.id,
          responded_by_name: profile.name,
          responded_at: new Date().toISOString(),
        })
        .eq("id", enquiryId);

      if (error) throw error;

      toast({
        title: "Response Submitted",
        description: "The enquiry has been updated successfully.",
      });

      return true;
    } catch (error) {
      console.error("Error updating enquiry:", error);
      toast({
        title: "Error",
        description: "Failed to update enquiry",
        variant: "destructive",
      });
      return false;
    }
  };

  const deleteEnquiry = async (enquiryId: string) => {
    if (!user || role !== "admin") {
      toast({
        title: "Error",
        description: "Only admins can delete enquiries",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from("enquiries")
        .delete()
        .eq("id", enquiryId);

      if (error) throw error;

      toast({
        title: "Enquiry Deleted",
        description: "The enquiry has been removed.",
      });

      return true;
    } catch (error) {
      console.error("Error deleting enquiry:", error);
      toast({
        title: "Error",
        description: "Failed to delete enquiry",
        variant: "destructive",
      });
      return false;
    }
  };

  const escalateEnquiry = async (enquiryId: string, reason: string) => {
    if (!user || !profile) {
      toast({
        title: "Error",
        description: "You must be logged in to escalate an enquiry",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from("enquiries")
        .update({
          is_escalated: true,
          escalated_at: new Date().toISOString(),
          escalated_by: user.id,
          escalated_by_name: profile.name,
          escalation_reason: reason,
        })
        .eq("id", enquiryId);

      if (error) throw error;

      toast({
        title: "Enquiry Escalated",
        description: "This enquiry has been escalated to admin for intervention.",
      });

      return true;
    } catch (error) {
      console.error("Error escalating enquiry:", error);
      toast({
        title: "Error",
        description: "Failed to escalate enquiry",
        variant: "destructive",
      });
      return false;
    }
  };

  const updateStatus = async (
    enquiryId: string,
    newStatus: QueryStatus,
    lostReason?: LostReason,
    lostReasonNotes?: string
  ) => {
    if (!user || !profile) {
      toast({
        title: "Error",
        description: "You must be logged in to update status",
        variant: "destructive",
      });
      return false;
    }

    try {
      // Find the enquiry to get its data for pipeline creation
      const enquiry = enquiries.find(e => e.id === enquiryId);
      if (!enquiry) {
        toast({
          title: "Error",
          description: "Enquiry not found",
          variant: "destructive",
        });
        return false;
      }

      const updateData: Record<string, unknown> = {
        status: newStatus,
        outcome_updated_at: new Date().toISOString(),
        outcome_updated_by: user.id,
      };

      if (newStatus === "order_lost") {
        updateData.lost_reason = lostReason || null;
        updateData.lost_reason_notes = lostReasonNotes || null;
      } else {
        updateData.lost_reason = null;
        updateData.lost_reason_notes = null;
      }

      const { error } = await supabase
        .from("enquiries")
        .update(updateData)
        .eq("id", enquiryId);

      if (error) throw error;

      // Auto-create pipeline order when moved to pipeline
      if (newStatus === "moved_to_pipeline") {
        const { error: pipelineError } = await supabase
          .from("pipeline_orders")
          .insert({
            customer_name: enquiry.customer_name,
            customer_company: enquiry.customer_company,
            product_name: enquiry.product_name,
            product_category: enquiry.product_category,
            product_code: enquiry.product_code,
            quantity: enquiry.quantity,
            sales_person_id: enquiry.sales_person_id || user.id,
            sales_person_name: enquiry.sales_person_name || profile.name,
            status: "pending_confirmation",
            priority: enquiry.urgency === "critical" ? 1 : enquiry.urgency === "high" ? 1 : enquiry.urgency === "medium" ? 2 : 3,
            customer_notes: enquiry.notes,
            internal_notes: enquiry.response_notes,
            created_by: user.id,
          });

        if (pipelineError) {
          console.error("Error creating pipeline order:", pipelineError);
          toast({
            title: "Warning",
            description: "Status updated but failed to create pipeline order automatically.",
            variant: "destructive",
          });
        }
      }

      // Auto-create order when marked as won
      if (newStatus === "order_won") {
        const { error: orderError } = await supabase
          .from("orders")
          .insert({
            customer_name: enquiry.customer_name,
            customer_company: enquiry.customer_company,
            product_name: enquiry.product_name,
            product_category: enquiry.product_category,
            product_code: enquiry.product_code || "N/A",
            quantity: enquiry.quantity,
            sales_person_id: enquiry.sales_person_id || user.id,
            sales_person_name: enquiry.sales_person_name || profile.name,
            status: "po_received",
            enquiry_id: enquiry.id,
            sales_notes: enquiry.notes,
            internal_notes: enquiry.response_notes ? `From enquiry response: ${enquiry.response_notes}` : null,
            created_by: user.id,
          });

        if (orderError) {
          console.error("Error creating order:", orderError);
          toast({
            title: "Warning",
            description: "Status updated but failed to create order automatically. Please create the order manually.",
            variant: "destructive",
          });
        }
      }

      const statusLabels: Record<QueryStatus, string> = {
        pending: "Pending",
        responded: "Responded",
        on_hold: "On Hold",
        moved_to_pipeline: "Moved to Pipeline",
        order_won: "Order Won",
        order_lost: "Order Lost",
      };

      toast({
        title: `Status Updated to ${statusLabels[newStatus]}`,
        description: newStatus === "order_won" 
          ? "Congratulations! The order has been created and moved to Order Management."
          : newStatus === "order_lost"
          ? "The order has been marked as lost."
          : newStatus === "moved_to_pipeline"
          ? "The enquiry has been moved to the sales pipeline and a pipeline order was created."
          : `Status changed to ${statusLabels[newStatus]}.`,
      });

      return true;
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
      return false;
    }
  };

  const submitAdminResponse = async (enquiryId: string, adminResponse: string) => {
    if (!user || !profile || role !== "admin") {
      toast({
        title: "Error",
        description: "Only admins can submit admin responses",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from("enquiries")
        .update({
          admin_response: adminResponse,
          admin_response_by: user.id,
          admin_response_by_name: profile.name,
          admin_response_at: new Date().toISOString(),
        })
        .eq("id", enquiryId);

      if (error) throw error;

      toast({
        title: "Admin Response Submitted",
        description: "Your response to the escalated enquiry has been saved.",
      });

      return true;
    } catch (error) {
      console.error("Error submitting admin response:", error);
      toast({
        title: "Error",
        description: "Failed to submit admin response",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    enquiries,
    loading,
    createEnquiry,
    updateEnquiry,
    deleteEnquiry,
    escalateEnquiry,
    updateStatus,
    submitAdminResponse,
    refetch: fetchEnquiries,
  };
}
