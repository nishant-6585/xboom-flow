import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DroneOperation {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  activity_datetime: string;
  activity_type: "Demo" | "Training" | "Field Work";
  project_name: string;
  client_name: string;
  location: string | null;
  equipment_used: { type: string; model: string }[];
  team_members: string[];
  work_description: string | null;
  status: "Planned" | "In Progress" | "Completed" | "Cancelled";
  report_file_url: string | null;
  remarks: string | null;
}

export interface DroneOperationFormData {
  activity_datetime: string;
  activity_type: "Demo" | "Training" | "Field Work";
  project_name: string;
  client_name: string;
  location: string;
  equipment_used: { type: string; model: string }[];
  team_members: string[];
  work_description: string;
  status: "Planned" | "In Progress" | "Completed" | "Cancelled";
  remarks: string;
}

export function useDroneOperations() {
  const [operations, setOperations] = useState<DroneOperation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOperations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("drone_operations")
      .select("*")
      .order("activity_datetime", { ascending: false });

    if (error) {
      console.error("Error fetching drone operations:", error);
      toast.error("Failed to load operations");
    } else {
      setOperations(
        (data || []).map((d: any) => ({
          ...d,
          equipment_used: Array.isArray(d.equipment_used) ? d.equipment_used : [],
          team_members: Array.isArray(d.team_members) ? d.team_members : [],
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  const createOperation = async (formData: DroneOperationFormData, userId: string) => {
    const { error } = await supabase.from("drone_operations").insert({
      ...formData,
      created_by: userId,
      equipment_used: formData.equipment_used as any,
      team_members: formData.team_members,
    });
    if (error) {
      toast.error("Failed to create operation: " + error.message);
      return false;
    }
    toast.success("Operation created successfully");
    fetchOperations();
    return true;
  };

  const updateOperation = async (id: string, formData: Partial<DroneOperationFormData>) => {
    const updateData: any = { ...formData };
    if (formData.equipment_used) updateData.equipment_used = formData.equipment_used;
    const { error } = await supabase
      .from("drone_operations")
      .update(updateData)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update operation: " + error.message);
      return false;
    }
    toast.success("Operation updated successfully");
    fetchOperations();
    return true;
  };

  const deleteOperation = async (id: string) => {
    const { error } = await supabase.from("drone_operations").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete operation: " + error.message);
      return false;
    }
    toast.success("Operation deleted");
    fetchOperations();
    return true;
  };

  return { operations, loading, createOperation, updateOperation, deleteOperation, refetch: fetchOperations };
}
