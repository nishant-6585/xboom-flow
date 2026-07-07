import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { FileCheck2, AlertOctagon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  orderId: string;
  compact?: boolean;
}

type InvoiceMeta = {
  invoice_number: string | null;
  source: "xboom" | "zoho" | null;
  document_type: "proforma" | "tax_invoice" | null;
  created_at: string;
};

type BadgeData = {
  rows: InvoiceMeta[];
  voided: boolean;
};

const queryKey = (orderId: string) => ["invoice-badge", orderId] as const;

/**
 * Compact marker for the order card: shows when at least one invoice
 * (manually uploaded or synced from Zoho Books) is attached to the order.
 * Prefers the most recent tax_invoice; falls back to the most recent row.
 *
 * Uses React Query (cache + dedup + refetch on focus/reconnect) plus a
 * per-order realtime channel so newly synced Zoho invoices appear the
 * moment the poller writes the order_invoices row — no page refresh.
 */
export function InvoiceAttachedBadge({ orderId, compact = false }: Props) {
  const qc = useQueryClient();

  const { data } = useQuery<BadgeData>({
    queryKey: queryKey(orderId),
    queryFn: async () => {
      const [invRes, ordRes] = await Promise.all([
        supabase
          .from("order_invoices")
          .select("invoice_number, source, document_type, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("has_voided_zoho_invoice")
          .eq("id", orderId)
          .maybeSingle(),
      ]);
      if (invRes.error) throw invRes.error;
      return {
        rows: (invRes.data ?? []) as InvoiceMeta[],
        voided: Boolean(ordRes.data?.has_voided_zoho_invoice),
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Realtime: invalidate this badge when the poller inserts an
  // order_invoices row or flips the order's voided flag.
  useEffect(() => {
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: queryKey(orderId) });
    const channel = supabase
      .channel(`invoice-badge:${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_invoices",
          filter: `order_id=eq.${orderId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, qc]);

  const rows = data?.rows ?? [];
  const voided = data?.voided ?? false;
  const count = rows.length;
  const inv =
    rows.find((r) => r.document_type === "tax_invoice") ?? rows[0] ?? null;

  if (!inv && !voided) return null;

  const isZoho = inv?.source === "zoho";
  // Zoho Books issues the official tax invoice; keep the badge label
  // distinct from proformas (which are a separate document type).
  const label = isZoho ? "Zoho Invoice" : "Invoice Attached";
  const short = isZoho ? "Zoho" : "Invoice";

  const tooltipLines = inv ? [
    isZoho ? "Synced from Zoho Books" : "Attached to order",
    inv.invoice_number ? `Number: ${inv.invoice_number}` : null,
    inv.document_type === "proforma" ? "Type: Proforma" : null,
    inv.document_type === "tax_invoice" ? "Type: Tax invoice" : null,
    count > 1 ? `${count} invoices on this order` : null,
  ].filter(Boolean) as string[] : [];

  return (
    <TooltipProvider>
      <span className="inline-flex items-center gap-1">
        {inv && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-5 px-1.5 gap-1 text-xs font-semibold border-emerald-600 text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:border-emerald-400 shadow-sm ring-1 ring-emerald-300 dark:ring-emerald-700"
              >
                <FileCheck2 className="h-3 w-3" />
                {compact ? short : label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {tooltipLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </TooltipContent>
          </Tooltip>
        )}
        {voided && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="destructive"
                className="h-5 px-1.5 gap-1 text-xs font-semibold"
              >
                <AlertOctagon className="h-3 w-3" />
                {compact ? "Voided" : "VOIDED in Zoho"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              A Zoho invoice attached to this order was marked VOID.
              <br />Finance needs to attach the replacement invoice.
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </TooltipProvider>
  );
}