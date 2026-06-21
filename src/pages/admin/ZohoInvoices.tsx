import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Search, Link2, Link2Off, ExternalLink } from "lucide-react";
import { format } from "date-fns";

type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string | null;
  customer_name: string | null;
  status: string | null;
  date: string | null;
  total: number | null;
  balance: number | null;
  reference_number: string | null;
  linked_order_id: string | null;
  linked_order_number: string | null;
  match_method: string | null;
  raw: any;
};

type Stats = {
  total_invoices: number;
  linked_invoices: number;
  unlinked_invoices: number;
  total_orders: number;
  orders_with_invoice: number;
  orders_without_invoice: number;
};

export default function ZohoInvoices() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<ZohoInvoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "linked" | "unlinked" | "orders-without">("all");
  const [ordersWithout, setOrdersWithout] = useState<{ id: string; order_number: string; customer_name: string | null; order_date: string | null }[]>([]);
  const [manualOrderNo, setManualOrderNo] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: inv }, { data: s }] = await Promise.all([
      supabase
        .from("zoho_books_invoices")
        .select("invoice_id,invoice_number,customer_name,status,date,total,balance,reference_number,linked_order_id,linked_order_number,match_method,raw")
        .order("date", { ascending: false })
        .limit(2000),
      supabase.rpc("zoho_reconciliation_stats"),
    ]);
    setInvoices((inv ?? []) as any);
    setStats((s as any) ?? null);
    setLoading(false);
  };

  const loadOrdersWithout = async () => {
    // Orders that have no linked Zoho invoice
    const { data } = await supabase
      .from("orders")
      .select("id,order_number,customer_name,order_date")
      .order("order_date", { ascending: false, nullsFirst: false })
      .limit(500);
    const linkedIds = new Set(invoices.map(i => i.linked_order_id).filter(Boolean) as string[]);
    setOrdersWithout((data ?? []).filter((o: any) => !linkedIds.has(o.id)) as any);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "orders-without") loadOrdersWithout(); /* eslint-disable-next-line */ }, [tab, invoices]);

  const runAutoMatch = async () => {
    setMatching(true);
    try {
      const { data, error } = await supabase.rpc("match_zoho_invoices_to_orders");
      if (error) throw error;
      const r: any = data;
      toast({
        title: "Auto-match complete",
        description: `Newly matched: ${r.total_newly_matched} (cf_order_id: ${r.new_matches_cf_order_id}, reference_number: ${r.new_matches_reference_number}). Already linked: ${r.already_linked}/${r.total_invoices}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Auto-match failed", description: e.message, variant: "destructive" });
    } finally {
      setMatching(false);
    }
  };

  const linkManual = async (invoiceId: string, orderNumber: string) => {
    if (!orderNumber.trim()) return;
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", orderNumber.trim())
      .maybeSingle();
    if (oErr || !order) {
      toast({ title: "Order not found", description: orderNumber, variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("link_zoho_invoice_manual", {
      p_invoice_id: invoiceId,
      p_order_id: order.id,
    });
    if (error) { toast({ title: "Link failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Linked", description: `${invoiceId} → ${orderNumber}` });
    await load();
  };

  const unlink = async (invoiceId: string) => {
    const { error } = await supabase.rpc("unlink_zoho_invoice", { p_invoice_id: invoiceId });
    if (error) { toast({ title: "Unlink failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Unlinked" });
    await load();
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((i) => {
      if (tab === "linked" && !i.linked_order_id) return false;
      if (tab === "unlinked" && i.linked_order_id) return false;
      if (!needle) return true;
      return (
        (i.invoice_number ?? "").toLowerCase().includes(needle) ||
        (i.customer_name ?? "").toLowerCase().includes(needle) ||
        (i.reference_number ?? "").toLowerCase().includes(needle) ||
        (i.linked_order_number ?? "").toLowerCase().includes(needle) ||
        ((i.raw?.cf_order_id ?? "") + "").toLowerCase().includes(needle)
      );
    });
  }, [invoices, q, tab]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Zoho Invoices</h1>
          <p className="text-sm text-muted-foreground">Browse cached Zoho Books invoices and reconcile to internal orders.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/admin?tab=integrations">Back to Integrations</Link></Button>
          <Button onClick={runAutoMatch} disabled={matching}>
            {matching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run auto-match
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Total invoices" value={stats?.total_invoices} />
        <StatCard label="Linked" value={stats?.linked_invoices} tone="success" />
        <StatCard label="Unlinked" value={stats?.unlinked_invoices} tone="warning" />
        <StatCard label="Total orders" value={stats?.total_orders} />
        <StatCard label="Orders w/ invoice" value={stats?.orders_with_invoice} tone="success" />
        <StatCard label="Orders w/o invoice" value={stats?.orders_without_invoice} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Reconciliation</span>
            <div className="relative w-72">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search invoice, customer, order…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All ({invoices.length})</TabsTrigger>
              <TabsTrigger value="linked">Linked ({stats?.linked_invoices ?? 0})</TabsTrigger>
              <TabsTrigger value="unlinked">Unlinked ({stats?.unlinked_invoices ?? 0})</TabsTrigger>
              <TabsTrigger value="orders-without">Orders without invoice</TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : tab === "orders-without" ? (
                <div className="overflow-auto max-h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersWithout.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">All recent orders have a linked Zoho invoice.</TableCell></TableRow>
                      ) : ordersWithout.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono">{o.order_number}</TableCell>
                          <TableCell>{o.customer_name ?? "—"}</TableCell>
                          <TableCell>{o.order_date ? format(new Date(o.order_date), "dd MMM yyyy") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="overflow-auto max-h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Ref / cf_order_id</TableHead>
                        <TableHead>Linked order</TableHead>
                        <TableHead className="w-[260px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No invoices.</TableCell></TableRow>
                      ) : filtered.map((i) => {
                        const cf = i.raw?.cf_order_id || "";
                        return (
                          <TableRow key={i.invoice_id}>
                            <TableCell className="font-mono">{i.invoice_number ?? i.invoice_id}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{i.customer_name ?? "—"}</TableCell>
                            <TableCell><Badge variant="outline">{i.status ?? "—"}</Badge></TableCell>
                            <TableCell className="text-right">{i.total != null ? Number(i.total).toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-right">{i.balance != null ? Number(i.balance).toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-xs">
                              {cf && <div><span className="text-muted-foreground">cf:</span> <span className="font-mono">{cf}</span></div>}
                              {i.reference_number && <div><span className="text-muted-foreground">ref:</span> <span className="font-mono">{i.reference_number}</span></div>}
                              {!cf && !i.reference_number && "—"}
                            </TableCell>
                            <TableCell>
                              {i.linked_order_number ? (
                                <div className="flex items-center gap-1">
                                  <Badge variant="default" className="font-mono">{i.linked_order_number}</Badge>
                                  <span className="text-xs text-muted-foreground">{i.match_method}</span>
                                </div>
                              ) : (
                                <Badge variant="secondary">Unlinked</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {i.linked_order_id ? (
                                <Button size="sm" variant="ghost" onClick={() => unlink(i.invoice_id)}>
                                  <Link2Off className="h-3 w-3 mr-1" /> Unlink
                                </Button>
                              ) : (
                                <div className="flex gap-1">
                                  <Input
                                    placeholder="ORD…"
                                    value={manualOrderNo[i.invoice_id] ?? ""}
                                    onChange={(e) => setManualOrderNo({ ...manualOrderNo, [i.invoice_id]: e.target.value })}
                                    className="h-8 text-xs font-mono"
                                  />
                                  <Button size="sm" variant="outline" onClick={() => linkManual(i.invoice_id, manualOrderNo[i.invoice_id] ?? "")}>
                                    <Link2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value?: number; tone?: "success" | "warning" }) {
  const cls =
    tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${cls}`}>{value ?? "—"}</div>
      </CardContent>
    </Card>
  );
}