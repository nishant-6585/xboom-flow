import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Loader2 } from "lucide-react";
import { format } from "date-fns";

type Inv = {
  invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  date: string | null;
  total: number | null;
  balance: number | null;
  match_method: string | null;
};

export function ZohoInvoiceCard({ orderNumber }: { orderNumber?: string | null }) {
  const [invoices, setInvoices] = useState<Inv[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderNumber) return;
    let active = true;
    setLoading(true);
    supabase
      .from("zoho_books_invoices")
      .select("invoice_id,invoice_number,status,date,total,balance,match_method")
      .eq("linked_order_number", orderNumber)
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setInvoices((data ?? []) as any);
        setLoading(false);
      });
    return () => { active = false; };
  }, [orderNumber]);

  if (!orderNumber) return null;

  return (
    <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <BookOpen className="h-4 w-4" /> Zoho Books invoice
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      {!loading && (invoices?.length ?? 0) === 0 ? (
        <div className="text-xs text-muted-foreground">
          No Zoho invoice linked. Set the order number ({orderNumber}) in Zoho's
          <span className="font-mono"> cf_order_id </span> custom field, then re-sync.
        </div>
      ) : (
        <div className="space-y-1.5">
          {invoices?.map((inv) => {
            const paid = (inv.total ?? 0) - (inv.balance ?? 0);
            return (
              <div key={inv.invoice_id} className="flex items-center justify-between text-sm border rounded px-2 py-1.5 bg-background">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{inv.invoice_number ?? inv.invoice_id}</span>
                  <Badge variant="outline" className="text-xs">{inv.status ?? "—"}</Badge>
                  {inv.match_method && (
                    <Badge variant="secondary" className="text-[10px]">via {inv.match_method}</Badge>
                  )}
                </div>
                <div className="text-xs text-right">
                  <div>{inv.date ? format(new Date(inv.date), "dd MMM yyyy") : ""}</div>
                  <div className="text-muted-foreground">
                    Total <span className="font-medium text-foreground">{Number(inv.total ?? 0).toLocaleString()}</span>
                    {" · "}Balance <span className={`font-medium ${Number(inv.balance ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>{Number(inv.balance ?? 0).toLocaleString()}</span>
                    {" · "}Paid {Number(paid).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}