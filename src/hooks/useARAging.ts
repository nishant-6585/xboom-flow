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
  customerSearch?: string;
  minOutstanding?: number;
}

const EXCLUDED_STATUSES = ["paid", "cancelled", "draft"];

/**
 * Builds an Accounts Receivable aging matrix from `invoices` + `invoice_payments`,
 * relative to `asOfDate` (defaults to today). All bucketing & KPIs are derived
 * client-side from a single pair of Supabase reads.
 */
export function useARAging({ asOfDate, customerSearch, minOutstanding = 0 }: Params = {}) {
  const asOf = asOfDate ?? new Date();
  const asOfKey = asOf.toISOString().slice(0, 10);
  const search = (customerSearch ?? "").trim().toLowerCase();

  return useQuery<AgingResult>({
    queryKey: ["ar-aging", asOfKey, search, minOutstanding],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Pull invoices not fully closed and issued on/before asOfDate.
      const { data: invoices, error: invErr } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, customer_name, customer_company, total_amount, amount_paid, balance_due, status, invoice_date, due_date",
        )
        .not("status", "in", `(${EXCLUDED_STATUSES.join(",")})`)
        .lte("invoice_date", asOfKey)
        .limit(5000);
      if (invErr) throw invErr;
      if (!invoices || invoices.length === 0) return emptyResult();

      const ids = invoices.map((i) => i.id);
      const { data: payments, error: payErr } = await supabase
        .from("invoice_payments")
        .select("invoice_id, amount, payment_date")
        .in("invoice_id", ids)
        .lte("payment_date", asOfKey);
      if (payErr) throw payErr;

      const paidByInvoice = new Map<string, number>();
      for (const p of payments ?? []) {
        paidByInvoice.set(
          p.invoice_id,
          (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0),
        );
      }

      const items: Array<AgingItem & { groupName: string; groupId?: string }> = [];
      for (const inv of invoices) {
        const total = Number(inv.total_amount ?? 0);
        if (!Number.isFinite(total) || total <= 0) continue;
        const paid = paidByInvoice.get(inv.id) ?? 0;
        const outstanding = Math.max(0, total - paid);
        if (outstanding <= minOutstanding) continue;
        const groupName =
          inv.customer_company?.trim() || inv.customer_name?.trim() || "(Unknown)";
        if (search && !groupName.toLowerCase().includes(search)) continue;
        const { bucket, daysOverdue, effectiveDue } = bucketize(
          inv.invoice_date,
          inv.due_date,
          asOf,
        );
        items.push({
          id: inv.id,
          number: inv.invoice_number,
          date: inv.invoice_date,
          due_date: effectiveDue,
          total,
          outstanding,
          daysOverdue,
          bucket,
          status: inv.status as string,
          groupName,
        });
      }
      return aggregate(items);
    },
  });
}