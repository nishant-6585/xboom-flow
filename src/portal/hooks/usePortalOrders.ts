import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PortalOrderState } from "@/portal/lib/orderStates";

export interface PortalOrderRow {
  id: string;
  order_number: string;
  current_state: PortalOrderState;
  customer_facing_eta: string | null;
  total: number | null;
  customer_po_number: string | null;
  courier_name: string | null;
  awb_number: string | null;
  tracking_url: string | null;
  delivery_commitment: string | null;
  payment_terms: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  gst_amount: number | null;
  daas_tier: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalOrderLineItem {
  id: string;
  product_name_snapshot: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number | null;
  line_state: string;
  serial_numbers: string[] | null;
}

export interface PortalStateTransition {
  id: string;
  from_state: PortalOrderState | null;
  to_state: PortalOrderState;
  customer_facing_note: string | null;
  actor_name_snapshot: string | null;
  transitioned_at: string;
}

export function usePortalOrders() {
  return useQuery({
    queryKey: ["portal", "orders"],
    queryFn: async (): Promise<PortalOrderRow[]> => {
      const { data, error } = await supabase
        .from("portal_orders")
        .select(
          "id, order_number, current_state, customer_facing_eta, total, customer_po_number, courier_name, awb_number, tracking_url, delivery_commitment, payment_terms, subtotal, discount_amount, gst_amount, daas_tier, created_at, updated_at",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PortalOrderRow[];
    },
  });
}

export function usePortalOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "order", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) throw new Error("missing id");
      const [orderRes, itemsRes, transitionsRes] = await Promise.all([
        supabase
          .from("portal_orders")
          .select(
            "id, order_number, current_state, customer_facing_eta, total, customer_po_number, courier_name, awb_number, tracking_url, delivery_commitment, payment_terms, subtotal, discount_amount, gst_amount, daas_tier, created_at, updated_at",
          )
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("portal_order_line_items")
          .select("id, product_name_snapshot, description, quantity, unit_price, total, line_state, serial_numbers")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true }),
        supabase
          .from("portal_state_transitions")
          .select("id, from_state, to_state, customer_facing_note, actor_name_snapshot, transitioned_at")
          .eq("order_id", orderId)
          .order("transitioned_at", { ascending: true }),
      ]);
      if (orderRes.error) throw orderRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (transitionsRes.error) throw transitionsRes.error;
      return {
        order: (orderRes.data ?? null) as PortalOrderRow | null,
        items: ((itemsRes.data ?? []) as unknown) as PortalOrderLineItem[],
        transitions: ((transitionsRes.data ?? []) as unknown) as PortalStateTransition[],
      };
    },
  });
}