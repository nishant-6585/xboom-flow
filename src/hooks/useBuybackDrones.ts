import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BuybackDrone {
  id: string;
  drone_category: string;
  drone_model: string;
  serial_number: string;
  condition: string;
  buyback_price: number;
  seller_name: string;
  seller_contact: string;
  buyback_date: string;
  selling_price: number | null;
  buyer_name: string | null;
  buyer_contact: string | null;
  selling_date: string | null;
  stock_status: string;
  profit_loss: number | null;
  created_at: string;
  updated_at: string;
}

export function useBuybackDrones() {
  const queryClient = useQueryClient();

  const dronesQuery = useQuery({
    queryKey: ["buyback_drones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyback_drones")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BuybackDrone[];
    },
  });

  const addDrone = useMutation({
    mutationFn: async (drone: {
      drone_category: string;
      drone_model: string;
      serial_number: string;
      condition: string;
      buyback_price: number;
      seller_name: string;
      seller_contact: string;
      buyback_date: string;
    }) => {
      const { error } = await supabase.from("buyback_drones").insert(drone);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyback_drones"] });
      toast.success("Drone added to stock");
    },
    onError: (error: any) => {
      if (error.message?.includes("duplicate key")) {
        toast.error("A drone with this serial number already exists");
      } else {
        toast.error("Failed to add drone: " + error.message);
      }
    },
  });

  const sellDrone = useMutation({
    mutationFn: async (data: {
      id: string;
      selling_price: number;
      buyer_name: string;
      buyer_contact: string;
      selling_date: string;
    }) => {
      const { id, ...rest } = data;
      const { error } = await supabase
        .from("buyback_drones")
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyback_drones"] });
      toast.success("Drone marked as sold");
    },
    onError: (error: any) => {
      toast.error("Failed to record sale: " + error.message);
    },
  });

  const deleteDrone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("buyback_drones")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyback_drones"] });
      toast.success("Drone record deleted");
    },
    onError: (error: any) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  return { dronesQuery, addDrone, sellDrone, deleteDrone };
}
