import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  aggregate,
  bucketize,
  emptyResult,
  type AgingItem,
  type AgingResult,
} from "./useAgingShared";

interface Params {
  asOfDate?: Date;
  supplierSearch?: string;
  minOutstanding?: number;
}

/**
 * Builds an Accounts Payable aging matrix from `inventory_procurements` +
 * `supplier_payments`, relative to `asOfDate`. Procurements with
 * payment_status='paid' are excluded; outstanding is computed from completed
 * supplier_payments so partial payments age correctly.
 */
export function useAPAging({ asOfDate, supplierSearch, minOutstanding = 0 }: Params = {}) {
  const asOf = asOfDate ?? new Date();
  const asOfKey = asOf.toISOString().slice(0, 10);
  const search = (supplierSearch ?? "").trim().toLowerCase();

  return useQuery<AgingResult>({
    queryKey: ["ap-aging", asOfKey, search, minOutstanding],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data: procs, error: pErr } = await supabase
        .from("inventory_procurements")
        .select(
          "id, procurement_number, supplier_id, supplier_name, total_amount, payment_status, procurement_date, payment_due_date",
        )
        .neq("payment_status", "paid")
        .lte("procurement_date", asOfKey)
        .limit(5000);
      if (pErr) throw pErr;
      if (!procs || procs.length === 0) return emptyResult();

      const ids = procs.map((p) => p.id);
      const { data: pays, error: payErr } = await supabase
        .from("supplier_payments")
        .select("inventory_procurement_id, amount, payment_date, payment_request_status")
        .in("inventory_procurement_id", ids)
        .lte("payment_date", asOfKey);
      if (payErr) throw payErr;

      const paidByProc = new Map<string, number>();
      for (const p of pays ?? []) {
        if (!p.inventory_procurement_id) continue;
        const stat = (p.payment_request_status ?? "completed").toLowerCase();
        if (stat && stat !== "completed" && stat !== "approved") continue;
        paidByProc.set(
          p.inventory_procurement_id,
          (paidByProc.get(p.inventory_procurement_id) ?? 0) + Number(p.amount ?? 0),
        );
      }

      const items: Array<AgingItem & { groupName: string; groupId?: string }> = [];
      for (const pr of procs) {
        const total = Number(pr.total_amount ?? 0);
        if (!Number.isFinite(total) || total <= 0) continue;
        const paid = paidByProc.get(pr.id) ?? 0;
        const outstanding = Math.max(0, total - paid);
        if (outstanding <= minOutstanding) continue;
        const groupName = pr.supplier_name?.trim() || "(Unknown supplier)";
        if (search && !groupName.toLowerCase().includes(search)) continue;
        const { bucket, daysOverdue, effectiveDue } = bucketize(
          pr.procurement_date,
          pr.payment_due_date,
          asOf,
        );
        items.push({
          id: pr.id,
          number: pr.procurement_number ?? pr.id.slice(0, 8),
          date: pr.procurement_date,
          due_date: effectiveDue,
          total,
          outstanding,
          daysOverdue,
          bucket,
          status: pr.payment_status,
          groupName,
          groupId: pr.supplier_id ?? undefined,
        });
      }
      return aggregate(items);
    },
  });
}