import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export type QueryStatus = "pending" | "in_review" | "confirmed" | "rejected";
export type UrgencyLevel = "low" | "medium" | "high" | "critical";

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
  responded_at: string | null;
  is_escalated: boolean;
  escalated_at: string | null;
  escalated_by: string | null;
  escalation_reason: string | null;
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
    if (!user) return false;

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
    if (!user) {
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

  return {
    enquiries,
    loading,
    createEnquiry,
    updateEnquiry,
    deleteEnquiry,
    escalateEnquiry,
    refetch: fetchEnquiries,
  };
}
