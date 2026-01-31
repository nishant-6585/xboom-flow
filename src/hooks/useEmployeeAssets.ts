import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export type AssetType = 'mobile_phone' | 'sim_card' | 'laptop' | 'camera' | 'tablet' | 'headset' | 'monitor' | 'keyboard' | 'mouse' | 'other';
export type AssetStatus = 'assigned' | 'returned' | 'lost' | 'damaged' | 'under_repair';

export const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'mobile_phone', label: 'Mobile Phone' },
  { value: 'sim_card', label: 'SIM Card' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'camera', label: 'Camera' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'headset', label: 'Headset' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'keyboard', label: 'Keyboard' },
  { value: 'mouse', label: 'Mouse' },
  { value: 'other', label: 'Other' },
];

export const ASSET_STATUSES: { value: AssetStatus; label: string; color: string }[] = [
  { value: 'assigned', label: 'Assigned', color: 'bg-green-100 text-green-800' },
  { value: 'returned', label: 'Returned', color: 'bg-gray-100 text-gray-800' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-800' },
  { value: 'damaged', label: 'Damaged', color: 'bg-orange-100 text-orange-800' },
  { value: 'under_repair', label: 'Under Repair', color: 'bg-yellow-100 text-yellow-800' },
];

export interface EmployeeAsset {
  id: string;
  employee_id: string | null;
  asset_type: AssetType;
  asset_name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  imei_number: string | null;
  sim_number: string | null;
  phone_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  assigned_date: string;
  return_date: string | null;
  status: AssetStatus;
  condition_on_assign: string | null;
  condition_on_return: string | null;
  notes: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  created_at: string;
  updated_at: string;
  employees?: {
    id: string;
    name: string;
  } | null;
}

export interface AssetFormData {
  employee_id: string;
  asset_type: AssetType;
  asset_name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  imei_number?: string;
  sim_number?: string;
  phone_number?: string;
  purchase_date?: string;
  purchase_price?: number;
  assigned_date: string;
  status: AssetStatus;
  condition_on_assign?: string;
  notes?: string;
}

export default function useEmployeeAssets() {
  const [assets, setAssets] = useState<EmployeeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("employee_assets")
        .select(`
          *,
          employees (id, name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssets(data as EmployeeAsset[]);
    } catch (error: any) {
      console.error("Error fetching assets:", error);
      toast({
        title: "Error",
        description: "Failed to fetch assets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const createAsset = useCallback(async (formData: AssetFormData) => {
    try {
      const { error } = await supabase.from("employee_assets").insert({
        ...formData,
        assigned_by: user?.id,
        assigned_by_name: profile?.name || 'Unknown',
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Asset assigned successfully",
      });

      fetchAssets();
      return true;
    } catch (error: any) {
      console.error("Error creating asset:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign asset",
        variant: "destructive",
      });
      return false;
    }
  }, [user, profile, toast, fetchAssets]);

  const updateAsset = useCallback(async (id: string, updates: Partial<AssetFormData & { return_date?: string; condition_on_return?: string }>) => {
    try {
      const { error } = await supabase
        .from("employee_assets")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Asset updated successfully",
      });

      fetchAssets();
      return true;
    } catch (error: any) {
      console.error("Error updating asset:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update asset",
        variant: "destructive",
      });
      return false;
    }
  }, [toast, fetchAssets]);

  const deleteAsset = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from("employee_assets")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Asset deleted successfully",
      });

      fetchAssets();
      return true;
    } catch (error: any) {
      console.error("Error deleting asset:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete asset",
        variant: "destructive",
      });
      return false;
    }
  }, [toast, fetchAssets]);

  return {
    assets,
    loading,
    createAsset,
    updateAsset,
    deleteAsset,
    refetch: fetchAssets,
  };
}
