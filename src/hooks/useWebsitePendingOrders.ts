import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WebsitePendingOrder {
  id: string;
  order_number: string | null;
  external_id: string | null;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string;
  product_code: string | null;
  quantity: number;
  total_sales_amount: number | null;
  selling_price: number | null;
  status: string;
  source: string;
  created_at: string;
  order_date: string | null;
  updated_at: string;
}

const KEY = "website-pending-orders";

export function useWebsitePendingOrders() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [KEY],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, external_id, customer_name, customer_company, customer_email, customer_phone, product_name, product_code, quantity, total_sales_amount, selling_price, status, source, created_at, order_date, updated_at",
        )
        .eq("source", "website")
        .eq("status", "po_received")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WebsitePendingOrder[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("website-pending-orders-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => qc.invalidateQueries({ queryKey: [KEY] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return {
    rows: query.data ?? [],
    count: query.data?.length ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}