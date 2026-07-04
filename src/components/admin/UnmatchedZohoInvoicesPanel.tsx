import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Link2, Search } from "lucide-react";
import { format } from "date-fns";

type UnmatchedInv = {
  invoice_id: string;
  invoice_number: string | null;
  customer_name: string | null;
  date: string | null;
  total: number | null;
  reference_number: string | null;
};

type OrderOption = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  total_sales_amount: number | null;
};

export function UnmatchedZohoInvoicesPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<UnmatchedInv[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<OrderOption[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("zoho_books_invoices")
      .select("invoice_id,invoice_number,customer_name,date,total,reference_number")
      .eq("match_status", "unmatched")
      .order("date", { ascending: false })
      .limit(100);
    setRows((data as UnmatchedInv[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const searchOrders = useCallback(async (q: string) => {
    if (!q.trim()) { setOptions([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("orders")
      .select("id,order_number,customer_name,customer_email,total_sales_amount")
      .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%`)
      .limit(15);
    setOptions((data as OrderOption[]) ?? []);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void searchOrders(query); }, 250);
    return () => clearTimeout(t);
  }, [query, searchOrders]);

  const attach = async (zohoInvoiceId: string, orderId: string) => {
    setBusy(zohoInvoiceId);
    try {
      const { error } = await supabase.functions.invoke("zoho-invoice-attach", {
        body: { zoho_invoice_id: zohoInvoiceId, order_id: orderId },
      });
      if (error) throw error;
      toast({ title: "Invoice attached", description: "PDF uploaded and email queued." });
      setOpenFor(null);
      setQuery("");
      await load();
    } catch (e: any) {
      toast({
        title: "Attach failed",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const summary = useMemo(() => `${rows.length} unmatched`, [rows.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          Unmatched Zoho Invoices
          <Badge variant="secondary" className="ml-2">{summary}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All synced Zoho invoices are matched to internal orders.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.invoice_id} className="border rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-medium">
                      {r.invoice_number ?? r.invoice_id}
                    </span>
                    {r.reference_number && (
                      <Badge variant="outline" className="text-[10px]">
                        ref: {r.reference_number}
                      </Badge>
                    )}
                    <span className="text-muted-foreground truncate">
                      {r.customer_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>{r.date ? format(new Date(r.date), "dd MMM yyyy") : ""}</span>
                    <span className="font-medium">
                      {Number(r.total ?? 0).toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant={openFor === r.invoice_id ? "secondary" : "outline"}
                      onClick={() => {
                        setOpenFor(openFor === r.invoice_id ? null : r.invoice_id);
                        setQuery("");
                        setOptions([]);
                      }}
                    >
                      <Link2 className="h-3.5 w-3.5 mr-1" />
                      Attach to order…
                    </Button>
                  </div>
                </div>
                {openFor === r.invoice_id && (
                  <div className="border-t pt-2 space-y-2">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        autoFocus
                        placeholder="Search order # / customer name / email"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <div className="max-h-48 overflow-auto divide-y border rounded">
                      {searching && (
                        <div className="p-2 text-xs text-muted-foreground">
                          Searching…
                        </div>
                      )}
                      {!searching && options.length === 0 && query && (
                        <div className="p-2 text-xs text-muted-foreground">
                          No matching orders.
                        </div>
                      )}
                      {options.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => attach(r.invoice_id, o.id)}
                          disabled={busy === r.invoice_id}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-mono font-medium">{o.order_number}</span>
                            <span className="text-muted-foreground">
                              {" "}· {o.customer_name ?? "—"}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {Number(o.total_sales_amount ?? 0).toLocaleString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}