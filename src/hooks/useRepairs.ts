import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type RepairIssueType = 
  | 'motor_failure'
  | 'gimbal_issue'
  | 'camera_damage'
  | 'battery_problem'
  | 'gps_issue'
  | 'remote_controller'
  | 'propeller_damage'
  | 'frame_damage'
  | 'flight_controller'
  | 'esc_issue'
  | 'software_issue'
  | 'water_damage'
  | 'crash_damage'
  | 'other';

export type RepairPaymentStatus = 'pending' | 'partial' | 'paid';

export interface ComponentReplaced {
  name: string;
  cost: number;
}

export interface Repair {
  id: string;
  repair_number: string | null;
  customer_name: string;
  model_name: string;
  date_of_receipt: string;
  contact_no: string;
  issue_details: string | null;
  issue_type: RepairIssueType;
  components_replaced: ComponentReplaced[];
  total_component_cost: number;
  inspection_charges: number;
  repair_cost_charged: number;
  date_completed: string | null;
  days_to_complete: number | null;
  committed_date: string | null;
  payment_status: RepairPaymentStatus;
  advance_amount: number;
  total_quote_amount: number;
  balance_amount: number;
  profit: number;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  email: string | null;
  intake_payload: Record<string, unknown> | null;
  source_lead_id: number | null;
}

export interface RepairFormData {
  customer_name: string;
  model_name: string;
  date_of_receipt: string;
  contact_no: string;
  issue_details?: string;
  issue_type: RepairIssueType;
  components_replaced: ComponentReplaced[];
  inspection_charges: number;
  repair_cost_charged: number;
  date_completed?: string | null;
  committed_date?: string | null;
  payment_status: RepairPaymentStatus;
  advance_amount: number;
  total_quote_amount: number;
  notes?: string;
}

export const ISSUE_TYPES: { value: RepairIssueType; label: string }[] = [
  { value: 'motor_failure', label: 'Motor Failure' },
  { value: 'gimbal_issue', label: 'Gimbal Issue' },
  { value: 'camera_damage', label: 'Camera Damage' },
  { value: 'battery_problem', label: 'Battery Problem' },
  { value: 'gps_issue', label: 'GPS Issue' },
  { value: 'remote_controller', label: 'Remote Controller' },
  { value: 'propeller_damage', label: 'Propeller Damage' },
  { value: 'frame_damage', label: 'Frame Damage' },
  { value: 'flight_controller', label: 'Flight Controller' },
  { value: 'esc_issue', label: 'ESC Issue' },
  { value: 'software_issue', label: 'Software Issue' },
  { value: 'water_damage', label: 'Water Damage' },
  { value: 'crash_damage', label: 'Crash Damage' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_STATUSES: { value: RepairPaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

export function useRepairs() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRepairs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("repairs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Transform the data to ensure components_replaced is properly typed
      const transformedData = (data || []).map(repair => ({
        ...repair,
        components_replaced: (Array.isArray(repair.components_replaced) 
          ? repair.components_replaced 
          : []) as unknown as ComponentReplaced[],
      }));
      
      setRepairs(transformedData as Repair[]);
    } catch (error: any) {
      console.error("Error fetching repairs:", error);
      toast({
        title: "Error",
        description: "Failed to load repairs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepairs();

    // Set up realtime subscription
    const channel = supabase
      .channel("repairs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "repairs" },
        () => {
          fetchRepairs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const createRepair = async (formData: RepairFormData, userId: string, userName: string) => {
    try {
      const totalComponentCost = formData.components_replaced.reduce(
        (sum, comp) => sum + (comp.cost || 0),
        0
      );

      const insertData = {
        customer_name: formData.customer_name,
        model_name: formData.model_name,
        date_of_receipt: formData.date_of_receipt,
        contact_no: formData.contact_no,
        issue_details: formData.issue_details || null,
        issue_type: formData.issue_type,
        components_replaced: JSON.parse(JSON.stringify(formData.components_replaced)),
        total_component_cost: totalComponentCost,
        inspection_charges: formData.inspection_charges,
        repair_cost_charged: formData.repair_cost_charged,
        date_completed: formData.date_completed || null,
        committed_date: formData.committed_date || null,
        payment_status: formData.payment_status,
        advance_amount: formData.advance_amount,
        total_quote_amount: formData.total_quote_amount,
        notes: formData.notes || null,
        created_by: userId,
        created_by_name: userName,
      };

      const { data, error } = await supabase
        .from("repairs")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Repair job created successfully",
      });

      return data;
    } catch (error: any) {
      console.error("Error creating repair:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create repair job",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateRepair = async (id: string, updates: Partial<RepairFormData>) => {
    try {
      let updateData: any = { ...updates };
      
      // Calculate total component cost if components are being updated
      if (updates.components_replaced) {
        updateData.total_component_cost = updates.components_replaced.reduce(
          (sum, comp) => sum + (comp.cost || 0),
          0
        );
        updateData.components_replaced = JSON.parse(JSON.stringify(updates.components_replaced));
      }

      const { error } = await supabase
        .from("repairs")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Repair job updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating repair:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update repair job",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteRepair = async (id: string) => {
    try {
      const { error } = await supabase.from("repairs").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Repair job deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting repair:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete repair job",
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    repairs,
    loading,
    createRepair,
    updateRepair,
    deleteRepair,
    refetch: fetchRepairs,
  };
}
