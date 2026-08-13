import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageCircle,
  RefreshCw,
  Search,
  Eye,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useManychatLeads, useManychatSync, type ManychatLead } from "@/hooks/useManychatLeads";
import { useSalesUsers } from "@/hooks/useSalesUsers";
import { useAuth } from "@/hooks/useAuth";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { LeadsExportMenu } from "@/components/sales/LeadsExportMenu";
import { LeadRowActions } from "@/components/sales/LeadRowActions";
import { ProspectButton } from "@/components/sales/ProspectButton";
import { DispositionBadge } from "@/components/sales/DispositionBadge";

const PAGE_SIZE = 25;

// Same pool the round-robin trigger draws from: approved sales / sales_manager
// users minus the excluded reps.
const EXCLUDED_ASSIGNEES = ["charles", "fahad", "umar", "vishal"];

const digitsOf = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

const customStr = (l: ManychatLead, key: string): string => {
  const v = l.custom_fields?.[key];
  return v === null || v === undefined ? "" : String(v).trim();
};
/** Channel with fallback to the CSV-imported custom field. */
const channelOf = (l: ManychatLead): string =>
  (l.channel || customStr(l, "channel")).toLowerCase() || "manychat";
/** ManyChat handle (IG/WA username) when the lead has one. */
const handleOf = (l: ManychatLead): string =>
  customStr(l, "ig_username") || customStr(l, "wa_username");
/** Most recent activity we know about for the contact. */
const lastActiveOf = (l: ManychatLead): string | null =>
  l.last_interaction_at || customStr(l, "subscribed") || l.manychat_created_at;
/** Duplicate-merge key: last 10 phone digits, else the row itself (unique). */
const dupKey = (l: ManychatLead) => {
  const d = digitsOf(l.phone_number);
  return d.length >= 10 ? d.slice(-10) : `id:${l.id}`;
};

interface LeadGroup {
  primary: ManychatLead;
  history: ManychatLead[];
}

export function ManychatLeadsPanel() {
  const { data: leads = [], isLoading, refetch, isFetching } = useManychatLeads();
  const sync = useManychatSync();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canManage = role === "admin" || role === "sales_manager";

  const { salesUsers } = useSalesUsers();
  const assignableUsers = useMemo(
    () =>
      salesUsers.filter((u) => {
        if (u.role !== "sales" && u.role !== "sales_manager") return false;
        const n = (u.name || "").trim().toLowerCase();
        return n.length > 0 && !EXCLUDED_ASSIGNEES.some((k) => n.includes(k));
      }),
    [salesUsers],
  );

  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [mergeDuplicates, setMergeDuplicates] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [updatingAssign, setUpdatingAssign] = useState<string | null>(null);
  const [detailsLead, setDetailsLead] = useState<ManychatLead | null>(null);

  const channels = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => set.add(channelOf(l)));
    return Array.from(set).sort();
  }, [leads]);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => l.assigned_to_name && set.add(l.assigned_to_name.trim()));
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (q) {
        const hit = [l.customer_name, l.phone_number, l.email, l.city, l.company, l.product_name, l.assigned_to_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (channelFilter !== "all" && channelOf(l) !== channelFilter) return false;
      if (assignedFilter === "unassigned" && l.assigned_to_name) return false;
      if (assignedFilter !== "all" && assignedFilter !== "unassigned" && (l.assigned_to_name || "").trim() !== assignedFilter)
        return false;
      const t = new Date(l.created_at).getTime();
      if (startDate && t < startDate.getTime()) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (t > end.getTime()) return false;
      }
      return true;
    });
  }, [leads, search, channelFilter, assignedFilter, startDate, endDate]);

  // Group duplicates by phone; newest row is the primary, the rest are history.
  const groups = useMemo<LeadGroup[]>(() => {
    if (!mergeDuplicates) return filtered.map((l) => ({ primary: l, history: [] }));
    const byKey = new Map<string, ManychatLead[]>();
    for (const l of filtered) {
      const k = dupKey(l);
      const arr = byKey.get(k);
      if (arr) arr.push(l);
      else byKey.set(k, [l]);
    }
    const out: LeadGroup[] = [];
    for (const arr of byKey.values()) {
      const sorted = [...arr].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      out.push({ primary: sorted[0], history: sorted.slice(1) });
    }
    return out.sort((a, b) => new Date(b.primary.created_at).getTime() - new Date(a.primary.created_at).getTime());
  }, [filtered, mergeDuplicates]);

  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  useEffect(() => setPage(0), [search, channelFilter, assignedFilter, startDate, endDate, mergeDuplicates]);
  const pageGroups = groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const mergedAway = filtered.length - groups.length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["manychat-leads"] });

  const handleAssignChange = async (leadId: string, userId: string) => {
    setUpdatingAssign(leadId);
    try {
      const user = assignableUsers.find((u) => u.user_id === userId);
      const patch = {
        assigned_to: user?.user_id ?? null,
        assigned_to_name: user?.name?.trim() ?? null,
      };
      const { error } = await supabase.from("manychat_leads").update(patch).eq("id", leadId);
      if (error) throw error;
      toast.success(user ? `Assigned to ${user.name}` : "Unassigned");
      invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to update assignment");
    } finally {
      setUpdatingAssign(null);
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportColumns = [
    { label: "Name", value: (g: LeadGroup) => g.primary.customer_name },
    { label: "Phone", value: (g: LeadGroup) => g.primary.phone_number },
    { label: "Email", value: (g: LeadGroup) => g.primary.email },
    { label: "Channel", value: (g: LeadGroup) => channelOf(g.primary) },
    { label: "Handle", value: (g: LeadGroup) => handleOf(g.primary) },
    { label: "Interest", value: (g: LeadGroup) => g.primary.product_name || g.primary.notes },
    { label: "City", value: (g: LeadGroup) => g.primary.city },
    { label: "Tags", value: (g: LeadGroup) => (g.primary.tags || []).join(", ") },
    { label: "Assigned To", value: (g: LeadGroup) => g.primary.assigned_to_name },
    { label: "Disposition", value: (g: LeadGroup) => g.primary.disposition },
    { label: "Last Active", value: (g: LeadGroup) => lastActiveOf(g.primary), date: true },
    { label: "Duplicates", value: (g: LeadGroup) => (g.history.length ? g.history.length + 1 : 1) },
    { label: "Received", value: (g: LeadGroup) => g.primary.created_at, date: true },
  ];

  const renderRow = (l: ManychatLead, group?: LeadGroup) => {
    const isPrimary = Boolean(group);
    const dupCount = group ? group.history.length : 0;
    const waDigits = digitsOf(l.phone_number);
    return (
      <tr key={l.id} className={`border-b hover:bg-muted/30 ${isPrimary ? "" : "bg-muted/20"}`}>
        <td className="py-2 px-2 font-medium">
          <div className="flex items-center gap-2">
            {!isPrimary && <span className="w-4" />}
            <div>
              <div>{l.customer_name || "—"}</div>
              {handleOf(l) && (
                <div className="text-[11px] font-normal text-muted-foreground">@{handleOf(l)}</div>
              )}
            </div>
            {isPrimary && dupCount > 0 && (
              <button
                type="button"
                onClick={() => toggleGroup(l.id)}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
              >
                {expandedGroups.has(l.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                ×{dupCount + 1} · history
              </button>
            )}
          </div>
        </td>
        <td className="py-2 px-2 whitespace-nowrap">{l.phone_number || "—"}</td>
        <td className="py-2 px-2 text-muted-foreground">{l.email || "—"}</td>
        <td className="py-2 px-2 max-w-[220px] truncate" title={l.product_name || l.notes || undefined}>
          {l.product_name || l.notes || "—"}
        </td>
        <td className="py-2 px-2">{l.city || "—"}</td>
        <td className="py-2 px-2 capitalize">{channelOf(l)}</td>
        <td className="py-2 px-2">
          {Array.isArray(l.tags) && l.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 max-w-[160px]">
              {l.tags.slice(0, 2).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] px-1.5">
                  {t}
                </Badge>
              ))}
              {l.tags.length > 2 && (
                <Badge variant="secondary" className="text-[10px] px-1.5" title={l.tags.slice(2).join(", ")}>
                  +{l.tags.length - 2}
                </Badge>
              )}
            </div>
          ) : (
            "—"
          )}
        </td>
        <td className="py-2 px-2">
          <DispositionBadge
            disposition={l.disposition}
            reasonCode={l.disposition_reason_code}
            reasonNote={l.disposition_reason_note}
          />
        </td>
        <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
          {canManage ? (
            <Select
              value={l.assigned_to || "unassigned"}
              onValueChange={(v) => handleAssignChange(l.id, v === "unassigned" ? "" : v)}
              disabled={updatingAssign === l.id}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Assign..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">— Unassigned —</SelectItem>
                {assignableUsers.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span>{l.assigned_to_name || "Unassigned"}</span>
          )}
        </td>
        <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
          {(() => {
            const la = lastActiveOf(l);
            const d = la ? new Date(la) : null;
            return d && !isNaN(d.getTime()) ? format(d, "dd MMM yyyy, HH:mm") : "—";
          })()}
        </td>
        <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
          {format(new Date(l.created_at), "dd MMM yyyy, HH:mm")}
        </td>
        <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-0.5">
            <ProspectButton
              sourceType="manychat"
              sourceId={l.id}
              customerName={l.customer_name || l.phone_number || "ManyChat lead"}
              phoneNumber={l.phone_number}
              email={l.email}
              company={l.company}
              city={l.city}
              productName={l.product_name}
              notes={l.notes}
            />
            {waDigits.length >= 10 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-green-500"
                title="Open WhatsApp chat"
                onClick={() => window.open(`https://wa.me/${waDigits}`, "_blank", "noopener")}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              title="View details"
              onClick={() => setDetailsLead(l)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <LeadRowActions
              sourceTable="manychat_leads"
              sourceRowId={l.id}
              contactName={l.customer_name || undefined}
              contactPhone={l.phone_number}
              currentDisposition={l.disposition}
              onDispositionChanged={invalidate}
            />
          </div>
        </td>
      </tr>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">ManyChat Leads</CardTitle>
            <Badge variant="secondary">{groups.length}</Badge>
            {mergeDuplicates && mergedAway > 0 && (
              <span className="text-xs text-muted-foreground">({mergedAway} merged)</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
              Sync ManyChat
            </Button>
            <LeadsExportMenu
              rows={groups}
              columns={exportColumns}
              filename="manychat-leads"
              title="ManyChat Leads"
              size="sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email…"
              className="pl-8 w-full sm:w-56"
            />
          </div>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="Assigned to" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sales Persons</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignees.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onClear={() => {
              setStartDate(undefined);
              setEndDate(undefined);
            }}
          />
          <Button
            size="sm"
            variant={mergeDuplicates ? "default" : "outline"}
            onClick={() => setMergeDuplicates((v) => !v)}
            className="gap-1.5"
          >
            <Layers className="h-3.5 w-3.5" />
            {mergeDuplicates ? "✓ Merge Duplicates" : "Merge Duplicates"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading ManyChat leads…</div>
        ) : groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No ManyChat leads match the current filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2">Name</th>
                    <th className="text-left py-2 px-2">Phone</th>
                    <th className="text-left py-2 px-2">Email</th>
                    <th className="text-left py-2 px-2">Interest</th>
                    <th className="text-left py-2 px-2">City</th>
                    <th className="text-left py-2 px-2">Channel</th>
                    <th className="text-left py-2 px-2">Tags</th>
                    <th className="text-left py-2 px-2">Disposition</th>
                    <th className="text-left py-2 px-2">Assigned To</th>
                    <th className="text-left py-2 px-2">Last Active</th>
                    <th className="text-left py-2 px-2">Received</th>
                    <th className="text-left py-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageGroups.map((g) => (
                    <Fragment key={g.primary.id}>
                      {renderRow(g.primary, g)}
                      {expandedGroups.has(g.primary.id) && g.history.map((h) => renderRow(h))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, groups.length)} of {groups.length}
                {mergeDuplicates && mergedAway > 0 ? ` (${mergedAway} duplicates merged)` : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} / {pageCount}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        <Dialog open={detailsLead !== null} onOpenChange={(o) => !o && setDetailsLead(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{detailsLead?.customer_name || "ManyChat lead"}</DialogTitle>
            </DialogHeader>
            {detailsLead && (
              <div className="space-y-2 text-sm">
                {[
                  ["Phone", detailsLead.phone_number],
                  ["Email", detailsLead.email],
                  ["Channel", detailsLead.channel],
                  ["City", detailsLead.city],
                  ["Company", detailsLead.company],
                  ["Interest", detailsLead.product_name],
                  ["Notes", detailsLead.notes],
                  ["Flow", detailsLead.flow_name],
                  ["Assigned To", detailsLead.assigned_to_name],
                  ["ManyChat ID", detailsLead.manychat_contact_id],
                  ["Status", detailsLead.status],
                  ["Source", detailsLead.source],
                  ["Received", format(new Date(detailsLead.created_at), "dd MMM yyyy, HH:mm")],
                  ["Last interaction", detailsLead.last_interaction_at
                    ? format(new Date(detailsLead.last_interaction_at), "dd MMM yyyy, HH:mm")
                    : null],
                ].map(([label, value]) =>
                  value ? (
                    <div key={String(label)} className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="col-span-2 break-words">{String(value)}</span>
                    </div>
                  ) : null,
                )}
                {Array.isArray(detailsLead.tags) && detailsLead.tags.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">Tags</span>
                    <span className="col-span-2 flex flex-wrap gap-1">
                      {detailsLead.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  </div>
                )}
                {detailsLead.custom_fields && Object.keys(detailsLead.custom_fields).length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">Custom fields</span>
                    <span className="col-span-2 space-y-0.5">
                      {Object.entries(detailsLead.custom_fields).map(([k, v]) =>
                        v !== null && v !== "" ? (
                          <div key={k} className="text-xs">
                            <span className="text-muted-foreground">{k}: </span>
                            {String(v)}
                          </div>
                        ) : null,
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
