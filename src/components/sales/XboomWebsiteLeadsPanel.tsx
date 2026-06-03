import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import {
  Globe, Search, Phone, MessageCircle, Mail, RefreshCw,
  LayoutGrid, Table as TableIcon, ChevronDown, ChevronRight,
  Package, ShoppingCart, ExternalLink, Loader2, Save, Clock,
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
import { useWooLeadsPaginated } from "@/hooks/useWooLeadsPaginated";
import { isWooLeadStatus } from "@/lib/wooOrderStatuses";
import { touchedRowCn, isRowTouched } from "@/lib/touchedRow";
import { useEngagedLeadIds } from "@/hooks/useEngagedLeadIds";
import { WooLeadActivityLog } from "./WooLeadActivityLog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ProspectButton } from "./ProspectButton";
import { AttentionButton } from "./AttentionButton";
import { EnquiryConvertButton } from "./EnquiryConvertButton";
import { LinkToCompanyButton } from "./LinkToCompanyButton";
import { LeadActionsCell } from "./LeadActionsCell";

/**
 * Abandoned Cart Leads
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
  const { data: engagedIds } = useEngagedLeadIds('woocommerce');
  const { user, role } = useAuth();
  const canManage = role === "admin" || role === "sales_manager";
  // Filters / pagination state — declared up-front because the data hook
  // pushes them down to Postgres (server-side pagination & search).
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Server-paginated leads. Only the visible page is fetched; stats are a
  // separate lightweight aggregate. Older history was already cleaned up.
  const {
    rows,
    filteredCount,
    stats,
    loading,
    statsLoading,
    refetch,
  } = useWooLeadsPaginated({
    page,
    pageSize: PAGE_SIZE,
    search,
    status: statusFilter,
    sinceDays: 90,
    excludeLost: true,
    assignedTo: canManage ? undefined : user?.id,
  });

  // Salespeople available for assignment (admin / sales / sales_manager).
  const [salespeople, setSalespeople] = useState<
    Array<{ user_id: string; name: string }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles!inner(user_id, name, email, is_approved)")
        .in("role", ["admin", "sales", "sales_manager"]);
      if (cancelled || error || !data) return;
      const map = new Map<string, { user_id: string; name: string }>();
      for (const r of data as unknown as Array<{
        user_id: string;
        profiles: { user_id: string; name: string | null; email: string | null; is_approved: boolean };
      }>) {
        if (!r.profiles?.is_approved) continue;
        const name = r.profiles.name || r.profiles.email || "Salesperson";
        if (!map.has(r.user_id)) map.set(r.user_id, { user_id: r.user_id, name });
      }
      const { filterAllowedAssignees } = await import("@/lib/allowedAssignees");
      setSalespeople(
        filterAllowedAssignees(Array.from(map.values())).sort((a, b) => a.name.localeCompare(b.name)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const handleAssign = async (orderId: string, assigneeId: string) => {
    setAssigningId(orderId);
    const { error } = await supabase.rpc("assign_woo_lead", {
      p_order_id: orderId,
      p_assignee: assigneeId,
    });
    setAssigningId(null);
    if (error) {
      console.error("[XboomWebsiteLeadsPanel] assign failed", error);
      toast.error(error.message || "Could not assign lead");
      return;
    }
    toast.success("Lead assigned");
    refetch();
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<string>("");
  const [savingStatus, setSavingStatus] = useState(false);

  // Persisted "last opened" map: lead id -> ISO timestamp
  const LAST_OPENED_KEY = "xboomWebsiteLeads.lastOpened";
  const LAST_FOCUSED_KEY = "xboomWebsiteLeads.lastFocusedId";
  const [lastOpened, setLastOpened] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(LAST_OPENED_KEY) || "{}");
    } catch { return {}; }
  });
  const [lastFocusedId, setLastFocusedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LAST_FOCUSED_KEY);
  });
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const hasRestoredRef = useRef(false);
  // Tracks last-seen status per Woo order id, used to detect transitions
  // across refreshes and persist them to the activity log.
  const statusSnapshotRef = useRef<Map<string, string>>(new Map());
  // De-dupes (woo_order_id|prev|next) transitions already logged this session.
  const loggedTransitionsRef = useRef<Set<string>>(new Set());
  const initialSnapshotTakenRef = useRef(false);

  const recordOpen = (id: string) => {
    setLastFocusedId(id);
    setLastOpened((prev) => {
      const next = { ...prev, [id]: new Date().toISOString() };
      try {
        localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(next));
        localStorage.setItem(LAST_FOCUSED_KEY, id);
      } catch { /* ignore quota */ }
      return next;
    });
  };

  // Server-paginated rows ARE the current page already.
  const leads = rows;
  const filtered = rows;
  const paged = rows;

  // Reset to page 1 whenever the filter set changes
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, viewMode]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = filteredCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredCount);

  const selected = useMemo(
    () => rows.find((l) => l.id === selectedId) ?? null,
    [rows, selectedId],
  );

  // Reset draft whenever the drawer's selected lead changes
  const selectedStatus = (selected?.order_status || "").toLowerCase();
  useEffect(() => {
    setStatusDraft(selectedStatus);
  }, [selectedId, selectedStatus]);

  // On first successful load, restore scroll & focus to the previously
  // opened row so the user lands back where they left off.
  useEffect(() => {
    if (loading || hasRestoredRef.current || !lastFocusedId) return;
    const el = rowRefs.current.get(lastFocusedId);
    if (!el) return;
    hasRestoredRef.current = true;
    // Defer until after paint so layout is stable
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      try { el.focus({ preventScroll: true }); } catch { /* noop */ }
    });
  }, [loading, filtered, lastFocusedId, viewMode]);

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
    recordOpen(id);
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
            <h2 className="text-xl font-semibold tracking-tight">Abandoned Cart Leads</h2>
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
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{(stats.counts.pending ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Failed / Cancelled</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{((stats.counts.failed ?? 0) + (stats.counts.cancelled ?? 0)).toLocaleString()}</p>
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
          aria-busy={loading}
        >
          All {loading ? (
            <Loader2 className="inline h-3 w-3 animate-spin ml-1 -mt-0.5" aria-label="Loading count" />
          ) : (
            <span>({stats.total.toLocaleString()})</span>
          )}
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
              aria-busy={loading}
            >
              {s.replace(/-/g, " ")}{" "}
              {loading ? (
                <Loader2 className="inline h-3 w-3 animate-spin ml-0.5 -mt-0.5" aria-label="Loading count" />
              ) : (
                <span>({(stats.counts[s] ?? 0).toLocaleString()})</span>
              )}
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
      ) : filteredCount === 0 ? (
        (() => {
          const hasFilters = search.trim() !== "" || statusFilter !== "all";
          const hasAnyLeads = stats.total > 0;
          const isFilteredEmpty = hasAnyLeads && hasFilters;
          const statusOnly = statusFilter !== "all" && search.trim() === "";
          return (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
                {statusOnly && hasAnyLeads ? (
                  <>
                    <p className="font-medium capitalize">
                      No {statusFilter.replace(/-/g, " ")} leads
                    </p>
                    <p className="text-sm mt-1">
                      Nothing matches the “{statusFilter.replace(/-/g, " ")}” status right now.
                      {stats.total > 0 && ` ${stats.total.toLocaleString()} lead${stats.total === 1 ? "" : "s"} in other statuses.`}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setStatusFilter("all")}
                    >
                      Show all statuses
                    </Button>
                  </>
                ) : isFilteredEmpty ? (
                  <>
                    <p className="font-medium">No leads match your filters</p>
                    <p className="text-sm mt-1">
                      {stats.total.toLocaleString()} total lead{stats.total === 1 ? "" : "s"} available — try clearing filters.
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
                  <TableHead className="w-[200px]">Actions</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((l) => {
                  const status = (l.order_status || "").toLowerCase();
                  const isOpen = expanded.has(l.id);
                  return (
                    <Fragment key={l.id}>
                       <TableRow
                         className={touchedRowCn(isRowTouched('xboom-website', l, engagedIds), `cursor-pointer ${lastFocusedId === l.id ? "ring-1 ring-inset ring-primary/30" : ""}`)}
                         onClick={() => toggleRow(l.id)}
                         ref={(el) => {
                           if (el) rowRefs.current.set(l.id, el);
                           else rowRefs.current.delete(l.id);
                         }}
                         tabIndex={-1}
                       >
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <LeadActionsCell
                            sourceType="lead"
                            sourceId={l.id}
                            customerName={l.customer_name || "Unknown"}
                            phone={l.customer_phone}
                            email={l.customer_email}
                            company={l.customer_company ?? null}
                            productName={l.product_name || ""}
                            quantity={l.quantity}
                            sourceLabel="Abandoned Cart"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{l.customer_name || "—"}</div>
                          {l.customer_email && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{l.customer_email}</div>
                          )}
                           {lastOpened[l.id] && (
                             <div className="text-[10px] text-muted-foreground/80 mt-0.5 inline-flex items-center gap-1" title={format(new Date(lastOpened[l.id]), "PPpp")}>
                               <Clock className="h-2.5 w-2.5" />
                               Last opened {formatDistanceToNow(new Date(lastOpened[l.id]), { addSuffix: true })}
                             </div>
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {canManage ? (
                            <Select
                              value={l.assigned_to ?? ""}
                              onValueChange={(v) => handleAssign(l.id, v)}
                              disabled={assigningId === l.id || salespeople.length === 0}
                            >
                              <SelectTrigger className="h-7 w-[150px] text-xs">
                                <SelectValue placeholder="Unassigned">
                                  {l.assigned_to_name || "Unassigned"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {salespeople.map((s) => (
                                  <SelectItem key={s.user_id} value={s.user_id} className="text-xs">
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {l.assigned_to_name || "Unassigned"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {relativeTime(l.woo_created_at || l.created_at)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/20">
                          <TableCell />
                         <TableCell colSpan={8}>
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
          {paged.map((l) => {
            const status = (l.order_status || "").toLowerCase();
            return (
              <Card
                key={l.id}
                className={`hover:shadow-md transition-shadow cursor-pointer ${lastFocusedId === l.id ? "ring-2 ring-primary/40" : ""}`}
                onClick={() => { recordOpen(l.id); setSelectedId(l.id); }}
                ref={(el) => {
                  if (el) rowRefs.current.set(l.id, el);
                  else rowRefs.current.delete(l.id);
                }}
                tabIndex={-1}
              >
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
                    {lastOpened[l.id] && (
                      <p className="text-[10px] text-muted-foreground/80 mt-1 inline-flex items-center gap-1" title={format(new Date(lastOpened[l.id]), "PPpp")}>
                        <Clock className="h-2.5 w-2.5" />
                        Last opened {formatDistanceToNow(new Date(lastOpened[l.id]), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{l.product_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Assigned to:{" "}
                    <span className="font-medium text-foreground">
                      {l.assigned_to_name || "Unassigned"}
                    </span>
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

      {/* Pagination */}
      {!loading && filteredCount > PAGE_SIZE && (
        <div className="flex items-center justify-between px-2 py-3 text-xs text-muted-foreground">
          <span>
            Showing <span className="font-medium text-foreground">{pageStart}</span>–
            <span className="font-medium text-foreground">{pageEnd}</span> of{" "}
            <span className="font-medium text-foreground">{filteredCount}</span> leads
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="px-1">
              Page <span className="font-medium text-foreground">{safePage}</span> / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
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
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Lead Status</p>
                  <Badge variant="outline" className={`capitalize ${STATUS_COLORS[selectedStatus] ?? "bg-muted"}`}>
                    {(selected.order_status || "unknown").replace(/-/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={statusDraft}
                    onValueChange={setStatusDraft}
                    disabled={savingStatus}
                  >
                    <SelectTrigger className="h-9 flex-1 text-sm">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s.replace(/-/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={saveStatus}
                    disabled={
                      savingStatus ||
                      !statusDraft ||
                      statusDraft === selectedStatus
                    }
                    className="gap-1.5"
                  >
                    {savingStatus ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
              {/* Customer */}
              <div className="rounded-lg border bg-card/50 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Contact name</p>
                    <p className="font-medium truncate">{selected.customer_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="truncate">{selected.customer_company || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-mono">{formatPhone(selected.customer_phone)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="truncate">{selected.customer_email || "—"}</p>
                  </div>
                </div>
                {selected.shipping_address && (
                  <div>
                    <p className="text-xs text-muted-foreground">Shipping address</p>
                    <p className="text-sm whitespace-pre-wrap">{selected.shipping_address}</p>
                  </div>
                )}
              </div>

              {/* Order */}
              <div className="rounded-lg border bg-card/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Order
                  </p>
                  {selected.woo_order_id && (
                    <a
                      href={`https://xboomflow.com/wp-admin/post.php?post=${selected.woo_order_id}&action=edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View on website <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Order #</p>
                    <p className="font-mono">
                      {selected.order_number || selected.woo_order_id || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Source</p>
                    <p className="capitalize truncate">{selected.source || "website"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payment status</p>
                    <p className="capitalize">{selected.payment_status || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Currency</p>
                    <p>{selected.currency || "INR"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p title={selected.woo_created_at ?? undefined}>
                      {selected.woo_created_at
                        ? `${format(new Date(selected.woo_created_at), "dd MMM yyyy, HH:mm")} (${formatDistanceToNow(new Date(selected.woo_created_at), { addSuffix: true })})`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last updated</p>
                    <p title={selected.woo_updated_at ?? undefined}>
                      {selected.woo_updated_at
                        ? formatDistanceToNow(new Date(selected.woo_updated_at), { addSuffix: true })
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="border-t pt-2 mt-1">
                  <p className="text-xs text-muted-foreground mb-1">Product</p>
                  <p className="font-medium">{selected.product_name}</p>
                  <div className="flex items-center justify-between mt-1 text-sm">
                    <span className="text-muted-foreground">Qty: {selected.quantity}</span>
                    <span className="font-semibold">{formatINR(selected.total_sales_amount)}</span>
                  </div>
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