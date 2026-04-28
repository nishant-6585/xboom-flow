import { Fragment, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import {
  Globe, Search, Phone, MessageCircle, Mail, RefreshCw,
  LayoutGrid, Table as TableIcon, ChevronDown, ChevronRight,
  Package, ShoppingCart, ExternalLink, Loader2, Save,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useWooCommerceOrders } from "@/hooks/useWooCommerceOrders";
import { isWooLeadStatus } from "@/lib/wooOrderStatuses";
import { WooLeadActivityLog } from "./WooLeadActivityLog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Xboom Website Leads
 *
 * Surfaces every WooCommerce order whose status is NOT processing / completed /
 * delivered as a sales lead — these are abandoned carts, failed payments,
 * cancellations, refunds and on-hold orders that the sales team should
 * recover. UI mirrors the ElevenLabs Leads panel for consistency.
 */

const LEAD_STATUSES = [
  "pending",
  "on-hold",
  "failed",
  "cancelled",
  "refunded",
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "on-hold":  "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  failed:     "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  cancelled:  "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  refunded:   "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
};

const formatPhone = (raw: string | null | undefined) => {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91"))
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
};

const formatINR = (n: number | null) => {
  if (n == null) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

const relativeTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "HH:mm")}`;
  return format(d, "dd MMM, HH:mm");
};

export function XboomWebsiteLeadsPanel() {
  const { wooOrders, loading, refetch } = useWooCommerceOrders();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<string>("");
  const [savingStatus, setSavingStatus] = useState(false);

  const leads = useMemo(
    () => wooOrders.filter((o) => isWooLeadStatus(o.order_status)),
    [wooOrders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      const status = (l.order_status || "").toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      return (
        (l.order_number ?? "").toLowerCase().includes(q) ||
        (l.woo_order_id ?? "").toLowerCase().includes(q) ||
        (l.customer_name ?? "").toLowerCase().includes(q) ||
        (l.customer_email ?? "").toLowerCase().includes(q) ||
        (l.customer_phone ?? "").toLowerCase().includes(q) ||
        (l.product_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, search, statusFilter]);

  const stats = useMemo(() => {
    const total = leads.length;
    const counts: Record<string, number> = {
      pending: 0, "on-hold": 0, failed: 0, cancelled: 0, refunded: 0,
    };
    for (const l of leads) {
      const s = (l.order_status ?? "").toLowerCase();
      if (s in counts) counts[s] += 1;
    }
    const lostValue = leads.reduce((s, l) => s + (Number(l.total_sales_amount) || 0), 0);
    return { total, counts, lostValue };
  }, [leads]);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  // Reset draft whenever the drawer's selected lead changes
  const selectedStatus = (selected?.order_status || "").toLowerCase();
  useEffect(() => {
    setStatusDraft(selectedStatus);
  }, [selectedId, selectedStatus]);

  const saveStatus = async () => {
    if (!selected || !statusDraft || statusDraft === selectedStatus) return;
    setSavingStatus(true);
    const { error } = await supabase.rpc("update_woo_lead_status", {
      p_order_id: selected.id,
      p_new_status: statusDraft,
    });
    setSavingStatus(false);
    if (error) {
      console.error("[XboomWebsiteLeadsPanel] saveStatus failed", error);
      toast.error(error.message || "Could not update status");
      return;
    }
    toast.success(`Status updated to ${statusDraft}`);
    refetch();
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openWhatsApp = (phone: string | null) => {
    if (!phone) return;
    const num = phone.replace(/\D/g, "");
    window.open(`https://wa.me/${num}`, "_blank");
  };

  const callPhone = (phone: string | null) => {
    if (!phone) return;
    window.open(`tel:${phone.replace(/\s+/g, "")}`, "_self");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Xboom Website Leads</h2>
            <p className="text-sm text-muted-foreground">
              Abandoned, failed and cancelled orders from xboom.in — recover them as sales leads
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border/50 bg-muted/40 p-0.5">
            <Button size="sm" variant={viewMode === "table" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => setViewMode("table")} title="Table view">
              <TableIcon className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={viewMode === "cards" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => setViewMode("cards")} title="Card view">
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Leads</p>
            <p className="text-2xl font-bold text-primary">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Pending Payment</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.counts.pending.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Failed / Cancelled</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{(stats.counts.failed + stats.counts.cancelled).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Recoverable Value</p>
            <p className="text-2xl font-bold text-foreground">{formatINR(stats.lostValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Clickable status chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            statusFilter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted"
          }`}
        >
          All ({stats.total.toLocaleString()})
        </button>
        {LEAD_STATUSES.map((s) => {
          const active = statusFilter === s;
          const base = STATUS_COLORS[s] ?? "bg-muted";
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(active ? "all" : s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border capitalize transition-all ${base} ${
                active ? "ring-2 ring-offset-1 ring-primary/60 shadow-sm" : "opacity-80 hover:opacity-100"
              }`}
            >
              {s.replace(/-/g, " ")} ({(stats.counts[s] ?? 0).toLocaleString()})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border border-border/60">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order #, customer, email, phone, product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace(/-/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        (() => {
          const hasFilters = search.trim() !== "" || statusFilter !== "all";
          const hasAnyLeads = leads.length > 0;
          const isFilteredEmpty = hasAnyLeads && hasFilters;
          return (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
                {isFilteredEmpty ? (
                  <>
                    <p className="font-medium">No leads match your filters</p>
                    <p className="text-sm mt-1">
                      {leads.length.toLocaleString()} total lead{leads.length === 1 ? "" : "s"} available — try clearing filters.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => { setSearch(""); setStatusFilter("all"); }}
                    >
                      Clear filters
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No website leads found</p>
                    <p className="text-sm mt-1">All current orders are being processed or completed.</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })()
      ) : viewMode === "table" ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const status = (l.order_status || "").toLowerCase();
                  const isOpen = expanded.has(l.id);
                  return (
                    <Fragment key={l.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggleRow(l.id)}>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{l.customer_name || "—"}</div>
                          {l.customer_email && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{l.customer_email}</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{formatPhone(l.customer_phone)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[180px]">{l.product_name}</span>
                            {l.quantity > 1 && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1">×{l.quantity}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(l.total_sales_amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize ${STATUS_COLORS[status] ?? "bg-muted"}`}>
                            {status.replace(/-/g, " ") || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {relativeTime(l.woo_created_at || l.created_at)}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {l.customer_phone && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => callPhone(l.customer_phone)} title="Call">
                                  <Phone className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openWhatsApp(l.customer_phone)} title="WhatsApp">
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedId(l.id)} title="View details">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={7}>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs py-2">
                              <div>
                                <p className="text-muted-foreground">Order #</p>
                                <p className="font-mono">{l.order_number || l.woo_order_id}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Payment Status</p>
                                <p className="capitalize">{l.payment_status || "—"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Company</p>
                                <p>{l.customer_company || "—"}</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((l) => {
            const status = (l.order_status || "").toLowerCase();
            return (
              <Card key={l.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedId(l.id)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className={`capitalize ${STATUS_COLORS[status] ?? "bg-muted"}`}>
                      {status.replace(/-/g, " ") || "unknown"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{relativeTime(l.woo_created_at || l.created_at)}</span>
                  </div>
                  <div>
                    <p className="font-semibold truncate">{l.customer_name || "—"}</p>
                    {l.customer_email && (
                      <p className="text-xs text-muted-foreground truncate">{l.customer_email}</p>
                    )}
                    <p className="text-xs font-mono text-muted-foreground mt-1">{formatPhone(l.customer_phone)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{l.product_name}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm font-semibold">{formatINR(l.total_sales_amount)}</span>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {l.customer_phone && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => callPhone(l.customer_phone)}>
                            <Phone className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openWhatsApp(l.customer_phone)}>
                            <MessageCircle className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.customer_name || "Lead Details"}</SheetTitle>
            <SheetDescription>
              Order #{selected?.order_number || selected?.woo_order_id}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`capitalize ${STATUS_COLORS[(selected.order_status || "").toLowerCase()] ?? "bg-muted"}`}>
                    {(selected.order_status || "unknown").replace(/-/g, " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment Status</p>
                  <p className="capitalize">{selected.payment_status || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-mono">{formatPhone(selected.customer_phone)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="truncate">{selected.customer_email || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p>{selected.customer_company || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p>{selected.woo_created_at ? format(new Date(selected.woo_created_at), "dd MMM yyyy, HH:mm") : "—"}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-2">Product</p>
                <p className="font-medium">{selected.product_name}</p>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span className="text-muted-foreground">Qty: {selected.quantity}</span>
                  <span className="font-semibold">{formatINR(selected.total_sales_amount)}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                {selected.customer_phone && (
                  <>
                    <Button className="flex-1 gap-2" onClick={() => callPhone(selected.customer_phone)}>
                      <Phone className="h-4 w-4" /> Call
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2" onClick={() => openWhatsApp(selected.customer_phone)}>
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </Button>
                  </>
                )}
                {selected.customer_email && (
                  <Button variant="outline" size="icon" onClick={() => window.open(`mailto:${selected.customer_email}`)}>
                    <Mail className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="border-t pt-4">
                <WooLeadActivityLog order={selected} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default XboomWebsiteLeadsPanel;