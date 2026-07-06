import { useEffect, useState } from "react";
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

/**
 * Compact marker for the order card: shows when at least one invoice
 * (manually uploaded or synced from Zoho Books) is attached to the order.
 * Prefers the most recent tax_invoice; falls back to the most recent row.
 */
export function InvoiceAttachedBadge({ orderId, compact = false }: Props) {
  const [inv, setInv] = useState<InvoiceMeta | null>(null);
  const [count, setCount] = useState(0);
  const [voided, setVoided] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("order_invoices")
        .select("invoice_number, source, document_type, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data && data.length > 0) {
        const rows = data as InvoiceMeta[];
        const preferred =
          rows.find((r) => r.document_type === "tax_invoice") ?? rows[0];
        setInv(preferred);
        setCount(rows.length);
      }
      const { data: ord } = await supabase
        .from("orders")
        .select("has_voided_zoho_invoice")
        .eq("id", orderId)
        .maybeSingle();
      if (!cancelled && ord?.has_voided_zoho_invoice) setVoided(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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