import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SparePartStockStatus = "IN_STOCK" | "LOW_STOCK" | "SOLD_OUT";

export interface SparePart {
  id: string;
  part_name: string;
  part_code: string | null;
  category: string | null;
  quantity: number;
  minimum_stock_threshold: number;
  cost_price: number;
  selling_price: number;
  vendor_name: string | null;
  vendor_id: string | null;
  stock_status: SparePartStockStatus;
  profit_per_unit: number;
  profit_margin_percent: number;
  last_purchase_date: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SparePartInput = Omit<
  SparePart,
  "id" | "created_at" | "updated_at" | "created_by" | "stock_status" | "profit_per_unit" | "profit_margin_percent" | "part_code"
> & { part_code?: string | null };

const TABLE = "spare_parts_inventory";

export function useSpareParts() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["spare_parts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE as never)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SparePart[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (payload: SparePartInput) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from(TABLE as never)
        .insert({ ...payload, created_by: u.user?.id ?? null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spare_parts"] });
      toast.success("Spare part added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SparePartInput> }) => {
      const { error } = await supabase
        .from(TABLE as never)
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spare_parts"] });
      toast.success("Spare part updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spare_parts"] });
      toast.success("Spare part deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { list, create, update, remove };
}

export type SparePartChangeType = "ADD" | "REMOVE";
export type SparePartChangeReason = "PURCHASE" | "SALE" | "DAMAGE" | "MANUAL_ADJUSTMENT";

export interface SparePartTransaction {
  id: string;
  part_id: string;
  change_type: SparePartChangeType;
  quantity_change: number;
  reason: SparePartChangeReason;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export function useSparePartTransactions(partId?: string) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["spare_parts_transactions", partId],
    enabled: !!partId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spare_parts_transactions" as never)
        .select("*")
        .eq("part_id", partId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SparePartTransaction[]) ?? [];
    },
  });

  const adjust = useMutation({
    mutationFn: async (payload: {
      part_id: string;
      change_type: SparePartChangeType;
      quantity_change: number;
      reason: SparePartChangeReason;
      notes?: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("spare_parts_transactions" as never)
        .insert({ ...payload, created_by: u.user?.id ?? null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spare_parts"] });
      qc.invalidateQueries({ queryKey: ["spare_parts_transactions"] });
      toast.success("Stock adjusted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { list, adjust };
}

export interface SparePartSale {
  id: string;
  part_id: string;
  quantity: number;
  sale_price: number;
  total_amount: number;
  buyer_name: string | null;
  buyer_phone: string | null;
  sale_date: string;
  notes: string | null;
  sold_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SparePartSaleInput {
  part_id: string;
  quantity: number;
  sale_price: number;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  sale_date?: string;
  notes?: string | null;
}

export function useSparePartSales() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["spare_parts_sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spare_parts_sales" as never)
        .select("*")
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SparePartSale[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (payload: SparePartSaleInput) => {
      const { data: u } = await supabase.auth.getUser();
      const qty = Number(payload.quantity);
      const price = Number(payload.sale_price);
      const total = qty * price;

      const { error: saleErr } = await supabase
        .from("spare_parts_sales" as never)
        .insert({
          part_id: payload.part_id,
          quantity: qty,
          sale_price: price,
          total_amount: total,
          buyer_name: payload.buyer_name ?? null,
          buyer_phone: payload.buyer_phone ?? null,
          sale_date: payload.sale_date ?? new Date().toISOString().slice(0, 10),
          notes: payload.notes ?? null,
          sold_by: u.user?.id ?? null,
        } as never);
      if (saleErr) throw saleErr;

      const { error: txErr } = await supabase
        .from("spare_parts_transactions" as never)
        .insert({
          part_id: payload.part_id,
          change_type: "REMOVE",
          quantity_change: qty,
          reason: "SALE",
          notes: payload.buyer_name ? `Sold to ${payload.buyer_name}` : "Sale recorded",
          created_by: u.user?.id ?? null,
        } as never);
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spare_parts_sales"] });
      qc.invalidateQueries({ queryKey: ["spare_parts"] });
      qc.invalidateQueries({ queryKey: ["spare_parts_transactions"] });
      toast.success("Sale recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { list, create };
}