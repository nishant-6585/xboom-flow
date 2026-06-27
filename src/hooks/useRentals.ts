import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RentalRecord {
  id: string;
  drone_id: string;
  renter_name: string;
  renter_contact: string;
  rental_start_date: string;
  rental_end_date: string | null;
  expected_return_date: string | null;
  actual_return_date: string | null;
  rental_fee: number;
  security_deposit: number | null;
  status: "Active" | "Returned";
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  drone?: {
    id: string;
    drone_model: string;
    drone_category: string;
    serial_number: string;
    condition: string;
  } | null;
}

export function useRentals() {
  const qc = useQueryClient();

  const rentalsQuery = useQuery({
    queryKey: ["rental_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_records" as any)
        .select(
          `*, drone:buyback_drones(id, drone_model, drone_category, serial_number, condition)`
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RentalRecord[];
    },
  });

  const createRental = useMutation({
    mutationFn: async (input: {
      drone_id: string;
      renter_name: string;
      renter_contact: string;
      rental_start_date: string;
      expected_return_date?: string | null;
      rental_fee: number;
      security_deposit?: number;
      notes?: string;
    }) => {
      const { error } = await supabase.from("rental_records" as any).insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental_records"] });
      qc.invalidateQueries({ queryKey: ["buyback_drones"] });
      toast.success("Drone put on rent");
    },
    onError: (e: any) => toast.error("Failed: " + e.message),
  });

  const returnRental = useMutation({
    mutationFn: async (input: { id: string; actual_return_date: string; notes?: string }) => {
      const { error } = await supabase
        .from("rental_records" as any)
        .update({
          status: "Returned",
          actual_return_date: input.actual_return_date,
          rental_end_date: input.actual_return_date,
          notes: input.notes,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental_records"] });
      qc.invalidateQueries({ queryKey: ["buyback_drones"] });
      toast.success("Rental marked as returned");
    },
    onError: (e: any) => toast.error("Failed: " + e.message),
  });

  return { rentalsQuery, createRental, returnRental };
}
