import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Wrench,
  MessageSquare,
  ArrowRight,
  Mail,
  Package,
  CheckCheck,
} from "lucide-react";
import { TicketStatusBadge, TicketPriorityBadge } from "@/portal/components/TicketStatusBadge";
import type { TicketStatus, TicketPriority } from "@/portal/hooks/usePortalTickets";

type InboxRow = {
  id: string;
  ticket_number: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  ticket_type: "general" | "service_request";
  category: string;
  account_id: string;
  company_name: string | null;
  related_order_id: string | null;
  related_order_number: string | null;
  related_product_name: string | null;
  customer_email: string | null;
  item_summary: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  sla_first_response_due_at: string | null;
  sla_resolution_due_at: string | null;
  last_message_at: string | null;
  last_message_by_customer: boolean;
  unread_customer_count: number;
};

type TypeFilter = "all" | "general" | "service_request";
type StatusFilter = "all" | "unread" | TicketStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unread", label: "Needs reply (unread from customer)" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_customer", label: "Awaiting customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const BULK_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_customer", label: "Awaiting customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

function useTicketInbox() {
  return useQuery({
    queryKey: ["admin", "portal-tickets", "inbox"],
    queryFn: async (): Promise<InboxRow[]> => {
      const { data, error } = await (supabase as any).rpc("list_portal_ticket_inbox");
      if (error) throw error;
      return ((data ?? []) as unknown) as InboxRow[];
    },
    refetchInterval: 30_000,
  });
}

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isBreached(row: InboxRow): "fr" | "res" | null {
  const now = Date.now();
  const active = row.status !== "resolved" && row.status !== "closed";
  if (!active) return null;
  if (
    !row.first_response_at &&
    row.sla_first_response_due_at &&
    new Date(row.sla_first_response_due_at).getTime() < now
  )
    return "fr";
  if (
    !row.resolved_at &&
    row.sla_resolution_due_at &&
    new Date(row.sla_resolution_due_at).getTime() < now
  )
    return "res";
  return null;
}

export default function PortalTicketsAdmin() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const { data, isLoading } = useTicketInbox();
  const qc = useQueryClient();

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.ticket_type !== typeFilter) return false;
      if (statusFilter === "unread") {
        if ((r.unread_customer_count ?? 0) === 0) return false;
      } else if (statusFilter !== "all") {
        if (r.status !== statusFilter) return false;
      }
      if (!needle) return true;
      return (
        r.ticket_number.toLowerCase().includes(needle) ||
        (r.subject ?? "").toLowerCase().includes(needle) ||
        (r.company_name ?? "").toLowerCase().includes(needle) ||
        (r.related_order_number ?? "").toLowerCase().includes(needle) ||
        (r.customer_email ?? "").toLowerCase().includes(needle) ||
        (r.item_summary ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, typeFilter, statusFilter, q]);

  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      sr: rows.filter((r) => r.ticket_type === "service_request").length,
      breached: rows.filter((r) => isBreached(r) !== null).length,
      unread: rows.reduce((sum, r) => sum + (r.unread_customer_count || 0), 0),
      unreadTickets: rows.filter((r) => (r.unread_customer_count || 0) > 0).length,
    };
  }, [data]);

  const selectedIds = useMemo(
    () => filtered.filter((r) => selected[r.id]).map((r) => r.id),
    [filtered, selected],
  );
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected[r.id]);
  const someVisibleSelected = filtered.some((r) => selected[r.id]);

  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      filtered.forEach((r) => {
        if (checked) next[r.id] = true;
        else delete next[r.id];
      });
      return next;
    });
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[id] = true;
      else delete next[id];
      return next;
    });
  }
  function clearSelection() {
    setSelected({});
  }

  async function handleBulkMarkRead() {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const { error } = await (supabase as any).rpc("mark_portal_tickets_read", {
        _ticket_ids: selectedIds,
      });
      if (error) throw error;
      toast.success(`Marked ${selectedIds.length} ticket(s) as read`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["admin", "portal-tickets", "inbox"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to mark as read");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkStatus(status: TicketStatus) {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const { error } = await (supabase as any).rpc(
        "bulk_update_portal_ticket_status",
        { _ticket_ids: selectedIds, _status: status },
      );
      if (error) throw error;
      toast.success(
        `Updated ${selectedIds.length} ticket(s) to ${status.replace("_", " ")}`,
      );
      clearSelection();
      qc.invalidateQueries({ queryKey: ["admin", "portal-tickets", "inbox"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AdminTabsNav active="portal-tickets" />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Ticket Inbox</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {stats.total} total · {stats.unreadTickets} awaiting your reply ·{" "}
              {stats.sr} service requests · {stats.breached} SLA breached
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ticket #, subject, company, order, email, item…"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm w-72"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ticket types</SelectItem>
                <SelectItem value="service_request">Service requests only</SelectItem>
                <SelectItem value="general">General only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk-action toolbar */}
        {!isLoading && filtered.length > 0 && (
          <div
            data-testid="bulk-toolbar"
            className="flex items-center gap-3 flex-wrap rounded-md border border-input bg-muted/40 px-3 py-2"
          >
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={
                  allVisibleSelected
                    ? true
                    : someVisibleSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(v) => toggleAllVisible(v === true)}
                aria-label="Select all visible tickets"
              />
              <span>
                {selectedIds.length > 0
                  ? `${selectedIds.length} selected`
                  : "Select all visible"}
              </span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                disabled={selectedIds.length === 0 || bulkBusy}
                onClick={handleBulkMarkRead}
              >
                <CheckCheck className="w-4 h-4 mr-1" /> Mark as read
              </Button>
              <Select
                onValueChange={(v) => handleBulkStatus(v as TicketStatus)}
                disabled={selectedIds.length === 0 || bulkBusy}
              >
                <SelectTrigger className="w-56 h-9">
                  <SelectValue placeholder="Change status to…" />
                </SelectTrigger>
                <SelectContent>
                  {BULK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      Change status → {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIds.length > 0 && (
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        )}

        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {(data?.length ?? 0) === 0 ? "No tickets." : "No tickets match your filters."}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map((t) => {
            const breach = isBreached(t);
            const unread = t.unread_customer_count > 0;
            const isSelected = !!selected[t.id];
            return (
              <Card
                key={t.id}
                className={
                  isSelected
                    ? "border-primary bg-primary/5"
                    : unread
                      ? "border-amber-400 bg-amber-50/30 dark:bg-amber-950/10"
                      : breach
                        ? "border-red-300"
                        : ""
                }
              >
                <CardContent className="py-3 px-4 flex items-start gap-3 flex-wrap">
                  <div className="pt-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(v) => toggleOne(t.id, v === true)}
                      aria-label={`Select ticket ${t.ticket_number}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">
                        {t.ticket_number}
                      </span>
                      <TicketStatusBadge status={t.status} />
                      <TicketPriorityBadge priority={t.priority as TicketPriority} />
                      {t.ticket_type === "service_request" && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                          <Wrench className="h-3 w-3 mr-1" /> Service request · 12h
                        </Badge>
                      )}
                      {unread && (
                        <Badge className="bg-amber-500 text-white border-amber-600">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          {t.unread_customer_count} new from customer
                        </Badge>
                      )}
                      {breach && (
                        <Badge className="bg-red-100 text-red-800 border-red-300">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {breach === "fr" ? "First-response breached" : "Resolution breached"}
                        </Badge>
                      )}
                    </div>
                    <div className="font-medium mt-0.5 truncate">{t.subject}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.company_name ?? "—"}
                      {t.related_order_number ? ` · Order ${t.related_order_number}` : ""}
                      {t.last_message_at ? ` · Last message ${fmt(t.last_message_at)}` : ""}
                    </div>
                    {(t.customer_email || t.item_summary) && (
                      <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        {t.customer_email && (
                          <span
                            data-testid="row-customer-email"
                            className="inline-flex items-center gap-1"
                          >
                            <Mail className="h-3 w-3" /> {t.customer_email}
                          </span>
                        )}
                        {t.item_summary && (
                          <span
                            data-testid="row-item-summary"
                            className="inline-flex items-center gap-1 truncate max-w-[520px]"
                            title={t.item_summary}
                          >
                            <Package className="h-3 w-3" /> {t.item_summary}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    <div>First response due: {fmt(t.sla_first_response_due_at)}</div>
                    <div>Resolution due: {fmt(t.sla_resolution_due_at)}</div>
                    <div className="mt-2">
                      <Button asChild size="sm" variant={unread ? "default" : "outline"}>
                        <Link to={`/admin/portal-tickets/${t.id}`}>
                          {unread ? "Reply now" : "Open thread"}
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
