import { Fragment, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Inbox, MoreVertical, RefreshCw, Search, ExternalLink, CheckCheck, Eye,
  Globe, FileSpreadsheet, Megaphone, MessageCircle, Phone, Headphones, Mail, Facebook, Store,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { LeadRowActions } from "./LeadRowActions";
import { DispositionBadge } from "./DispositionBadge";
import { LeadsExportMenu } from "./LeadsExportMenu";
import { useNavigate } from "react-router-dom";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { TableSkeleton, EmptyState, DataErrorState } from "@/components/data-states";
import {
  LEAD_SOURCES,
  SOURCE_META,
  type LeadSource,
  type UnifiedLead,
  useUnifiedLeadFeed,
  useUnifiedLeadCounts,
} from "@/hooks/useUnifiedLeadFeed";
import { cn } from "@/lib/utils";
import { useTeamAvailability } from "@/hooks/useTeamAvailability";
import { groupDuplicates } from "@/lib/leadDeduplication";
import { DuplicateCountBadge, DuplicateHistoryRow } from "./DuplicateHistoryRow";
import { LeadContactDrawer, LeadContactData } from "./LeadContactDrawer";

const PAGE_SIZES = [50, 100, 250] as const;

// Map our source key → the existing source-tab in LeadsPanel sub-tabs.
const SOURCE_TO_TAB: Record<LeadSource, string> = {
  website: "xboom-website",
  forms: "qforms",
  google_ads: "google-ads",
  interakt: "interakt",
  myoperator: "myoperator",
  elevenlabs: "elevenlabs",
  email: "emails",
  facebook: "facebook-leads",
  indiamart: "indiamart",
};

const SOURCE_ICON: Record<LeadSource, React.ComponentType<{ className?: string }>> = {
  website: Globe,
  forms: FileSpreadsheet,
  google_ads: Megaphone,
  interakt: MessageCircle,
  myoperator: Phone,
  elevenlabs: Headphones,
  email: Mail,
  facebook: Facebook,
  indiamart: Store,
};

function lastSeenKey(userId: string | undefined) {
  return `xboom:lead-inbox:last-seen:${userId ?? "anon"}`;
}

interface UnifiedLeadInboxProps {
  /** Pre-selected sources. When provided, the source filter chips are hidden and only these sources are queried. */
  sources?: LeadSource[];
}

export function UnifiedLeadInbox({ sources }: UnifiedLeadInboxProps = {}) {
  const { currentlyUnavailable } = useTeamAvailability();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isLockedSource = sources && sources.length > 0;
  const [selectedSources, setSelectedSources] = useState<LeadSource[]>(sources ?? []);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [includeDispositioned, setIncludeDispositioned] = useState(false);
  const [groupDupes, setGroupDupes] = useState(true);

  // Detail drawer state
  const [detailLead, setDetailLead] = useState<UnifiedLead | null>(null);
  const [detailPayload, setDetailPayload] = useState<Record<string, unknown> | null>(null);


  // last-seen for "new since last visit" indicators
  const [lastSeen, setLastSeen] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(lastSeenKey(user?.id));
  });

  // Keep locked source in sync if prop changes
  useEffect(() => {
    if (isLockedSource) setSelectedSources(sources ?? []);
  }, [sources?.join(",")]);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [selectedSources, debouncedSearch, startDate, endDate, pageSize, includeDispositioned]);

  // After visit, advance last-seen after 5s grace
  useEffect(() => {
    const t = setTimeout(() => {
      const now = new Date().toISOString();
      localStorage.setItem(lastSeenKey(user?.id), now);
      setLastSeen(now);
    }, 5000);
    return () => clearTimeout(t);
  }, [user?.id]);

  // Load raw payload for the detail drawer (currently only the public.leads table stores a payload column)
  useEffect(() => {
    if (!detailLead) return;
    if (detailLead.source_table !== "leads") return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("payload")
        .eq("id", Number(detailLead.source_row_id))
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[UnifiedLeadInbox] payload fetch failed", error);
        return;
      }
      setDetailPayload((data?.payload as Record<string, unknown> | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [detailLead]);

  const openDetail = (lead: UnifiedLead) => {
    setDetailLead(lead);
    setDetailPayload(null);
  };
  const closeDetail = () => setDetailLead(null);

  const drawerData = useMemo<LeadContactData | null>(() => {
    if (!detailLead) return null;
    return {
      id: detailLead.source_row_id,
      source_type: "lead",
      customer_name: detailLead.name || "—",
      phone: detailLead.phone,
      email: detailLead.email,
      company: detailLead.company,
      product_name: detailLead.subject_or_message,
      status: detailLead.status,
      assigned_to_name: detailLead.sales_person_name,
      created_at: detailLead.created_at,
      lead_source: SOURCE_META[detailLead.source]?.label ?? detailLead.source,
      payload: detailPayload,
    };
  }, [detailLead, detailPayload]);

  const { rows, total, isLoading, error, refetch } = useUnifiedLeadFeed({
    sources: selectedSources.length > 0 ? selectedSources : undefined,
    search: debouncedSearch || undefined,
    startDate,
    endDate,
    page,
    pageSize,
    includeDispositioned,
  });

  // Counts of "new since last seen" per source (fallback 24h)
  const counts = useUnifiedLeadCounts(lastSeen ?? undefined);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Group duplicate leads on the current page so a contact reaching us
  // across multiple sources collapses into one row with history.
  const grouped = useMemo(() => {
    if (!groupDupes) {
      return rows.map((r) => ({
        primary: r,
        duplicates: [],
        count: 1,
        key: `${r.source}:${r.source_row_id}`,
      }));
    }
    return groupDuplicates(
      rows,
      (r) => ({ phone: r.phone, email: r.email, name: r.name, company: r.company }),
      (r) => r.created_at,
      (r) => `${r.source}:${r.source_row_id}`,
    );
  }, [rows, groupDupes]);
  const uniqueTotal = grouped.length;
  const mergedAway = rows.length - uniqueTotal;

  const resetFilters = () => {
    setSelectedSources([]);
    setSearch("");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const toggleSource = (src: LeadSource) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src],
    );
  };

  const markAllSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem(lastSeenKey(user?.id), now);
    setLastSeen(now);
    counts.refetch();
  };

  const openInSource = (lead: { source: LeadSource; source_row_id: string }) => {
    const tab = SOURCE_TO_TAB[lead.source];
    navigate(`/sales?tab=leads&subtab=${tab}&leadId=${encodeURIComponent(lead.source_row_id)}`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              {(() => {
                const Icon = (isLockedSource && sources?.length === 1
                  ? SOURCE_ICON[sources[0]!]
                  : Inbox) ?? Inbox;
                return <Icon className="h-5 w-5 text-primary" />;
              })()}
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {isLockedSource && sources?.length === 1
                  ? SOURCE_META[sources[0]!].label
                  : "All Leads"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading…"
                  : groupDupes
                  ? `${uniqueTotal.toLocaleString()} unique${mergedAway > 0 ? ` · ${mergedAway} duplicate${mergedAway === 1 ? "" : "s"} merged` : ""} · ${total.toLocaleString()} total`
                  : `${total.toLocaleString()} total`}
                {counts.data && counts.data.totalNew > 0 && (
                  <> · <span className="text-primary font-medium">{counts.data.totalNew} new</span></>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, phone, subject…"
                className="pl-8 w-72"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={markAllSeen}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all seen
            </Button>
            <LeadsExportMenu
              rows={rows}
              filename="lead-inbox"
              title="Lead Inbox"
              columns={[
                { label: "Date", value: (l: any) => l.created_at, date: true },
                { label: "Source", value: (l: any) => l.source },
                { label: "Name", value: (l: any) => l.name },
                { label: "Phone", value: (l: any) => l.phone },
                { label: "Email", value: (l: any) => l.email },
                { label: "Company", value: (l: any) => l.company },
                { label: "Product", value: (l: any) => l.product_name },
                { label: "Subject / Message", value: (l: any) => l.subject_or_message },
                { label: "Status", value: (l: any) => l.status },
                { label: "Sales Person", value: (l: any) => l.sales_person_name },
                { label: "Disposition", value: (l: any) => l.disposition },
              ]}
            />
            <div className="flex items-center gap-2 pl-2 border-l">
              <Switch
                id="show-all-dispositions"
                checked={includeDispositioned}
                onCheckedChange={setIncludeDispositioned}
              />
              <Label htmlFor="show-all-dispositions" className="text-xs cursor-pointer">
                Show all dispositions
              </Label>
            </div>
            <div className="flex items-center gap-2 pl-2 border-l">
              <Switch
                id="group-duplicates"
                checked={groupDupes}
                onCheckedChange={setGroupDupes}
              />
              <Label htmlFor="group-duplicates" className="text-xs cursor-pointer">
                Group duplicates
              </Label>
            </div>
          </div>
        </div>

        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
        />

        {/* Source chips — hidden when sources are locked by a parent tab */}
        {!isLockedSource && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedSources([])}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                selectedSources.length === 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-border",
              )}
            >
              All
            </button>
            {LEAD_SOURCES.map((src) => {
              const meta = SOURCE_META[src];
              const selected = selectedSources.includes(src);
              const newCount = counts.data?.bySource[src] ?? 0;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => toggleSource(src)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5",
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : cn("hover:bg-muted border-border", meta.chipClass),
                  )}
                >
                  {meta.label}
                  {newCount > 0 && (
                    <span className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                      selected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground",
                    )}>
                      {newCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} columns={7} /></div>
        ) : error ? (
          <DataErrorState onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              total === 0 && !debouncedSearch && !startDate && !endDate && selectedSources.length === 0
                ? "No leads yet"
                : "No leads match these filters"
            }
            description={
              total === 0 && !debouncedSearch && !startDate && !endDate && selectedSources.length === 0
                ? "Connect a lead source to get started."
                : "Try widening the date range or selecting more sources."
            }
            action={
              (debouncedSearch || startDate || endDate || selectedSources.length > 0) ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Source</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[160px]">Assigned</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((group) => {
                const lead = group.primary;
                const meta = SOURCE_META[lead.source];
                return (
                  <Fragment key={group.key}>
                  <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(lead)}>
                    <TableCell>
                      <Badge variant="secondary" className={cn("text-xs", meta.chipClass)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm flex items-center">
                        <span>{lead.name || "—"}</span>
                        <DuplicateCountBadge count={group.count} />
                      </div>
                      {lead.company && (
                        <div className="text-xs text-muted-foreground">{lead.company}</div>
                      )}
                      {lead.disposition && lead.disposition !== "untouched" && (
                        <div className="mt-1">
                          <DispositionBadge
                            disposition={lead.disposition}
                            reasonCode={lead.disposition_reason_code}
                            reasonNote={lead.disposition_reason_note}
                            dispositionAt={lead.disposition_at}
                            dispositionByName={lead.disposition_by_name}
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.phone && <div className="text-sm">{lead.phone}</div>}
                      {lead.email && (
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{lead.email}</div>
                      )}
                      {!lead.phone && !lead.email && "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="text-sm line-clamp-2">
                        {lead.product_name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="text-sm text-muted-foreground line-clamp-2">
                        {lead.subject_or_message || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {lead.status ?? "new"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {lead.sales_person_name || (lead.is_assigned ? "Assigned" : "—")}
                        {lead.sales_person_id && currentlyUnavailable.has(lead.sales_person_id) && (
                          <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 italic">
                            (out today)
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(lead); }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openInSource(lead)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View in source
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <LeadRowActions
                        sourceTable={lead.source_table as any}
                        sourceRowId={lead.source_row_id}
                        contactName={lead.name ?? undefined}
                        contactPhone={lead.phone}
                        currentDisposition={lead.disposition as any}
                        onDispositionChanged={() => refetch()}
                      />
                    </TableCell>
                  </TableRow>
                  <DuplicateHistoryRow
                    count={group.count}
                    colSpan={8}
                    entries={group.duplicates.map((d) => ({
                      id: `${d.source}:${d.source_row_id}`,
                      source: SOURCE_META[d.source]?.label ?? d.source,
                      sourceChipClass: SOURCE_META[d.source]?.chipClass,
                      status: d.status,
                      assignedTo: d.sales_person_name,
                      createdAt: d.created_at,
                      note: d.subject_or_message,
                    }))}
                  />
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Pagination */}
      {!isLoading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline" size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >Prev</Button>
            <Button
              variant="outline" size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >Next</Button>
          </div>
        </div>
      )}

      <LeadContactDrawer
        open={!!detailLead}
        onOpenChange={(open) => { if (!open) closeDetail(); }}
        lead={drawerData}
      />
    </div>
  );
}