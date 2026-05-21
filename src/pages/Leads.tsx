import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Inbox, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { toast } from "@/hooks/use-toast";
import { TableSkeleton, EmptyState, DataErrorState } from "@/components/data-states";

const FORM_TYPES = [
  "contact", "quote", "demo", "dealer", "newsletter", "popup",
  "drone-service-enquiry", "drone-repair-intake",
  "rov-mission-brief", "robot-brief", "enterprise-drones-brief",
  "drone-show-inquiry", "labs-brief",
  "inline-enterprise-drones-cta", "inline-robot-brief",
  "inline-confined-space-brief", "inline-channel-partner-application",
  "inline-custom-payment-request", "inline-newsletter-footer",
];

const STATUSES = ["new", "contacted", "qualified", "converted", "archived"] as const;
type Status = typeof STATUSES[number];

const STATUS_COLORS: Record<Status, string> = {
  new:       "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  contacted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  qualified: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  converted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  archived:  "bg-muted text-muted-foreground",
};

interface Lead {
  id: number;
  created_at: string;
  form_type: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string | null;
  location: string | null;
  role: string | null;
  urgency: string | null;
  sector: string | null;
  page_url: string | null;
  ip: string | null;
  user_agent: string | null;
  submitted_at: string | null;
  payload: Record<string, any> | null;
  status: Status;
}

function truncate(s: string | null, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const PAGE_SIZE_OPTIONS = [50, 100, 250] as const;

export default function Leads() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Filters
  const [formType, setFormType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [formType, status, startDate, endDate, pageSize]);

  const queryKey = useMemo(
    () => [
      "leads",
      { formType, status, startDate: startDate?.toISOString(), endDate: endDate?.toISOString(), page, pageSize },
    ],
    [formType, status, startDate, endDate, page, pageSize],
  );

  const leadsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("leads" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (formType !== "all") q = q.eq("form_type", formType);
      if (status !== "all") q = q.eq("status", status);
      if (startDate) q = q.gte("created_at", startDate.toISOString());
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        q = q.lte("created_at", e.toISOString());
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data as unknown as Lead[]) ?? [], total: count ?? 0 };
    },
  });

  const rows = leadsQuery.data?.rows ?? [];
  const total = leadsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Realtime: invalidate the query on new leads so the active page refetches.
  useEffect(() => {
    const ch = supabase
      .channel("leads-incoming")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // Client-side search filter only applies to the current page (server-side
  // search would require a different query shape).
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      [r.name, r.email, r.phone, r.company, r.message]
        .filter(Boolean)
        .some(v => v!.toString().toLowerCase().includes(term))
    );
  }, [rows, search]);

  const toggleRow = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateStatus = async (id: number, value: Status) => {
    // Optimistic cache update across whatever query key currently holds it
    queryClient.setQueriesData<{ rows: Lead[]; total: number } | undefined>(
      { queryKey: ["leads"] },
      (cur) => cur ? { ...cur, rows: cur.rows.map(r => r.id === id ? { ...r, status: value } : r) } : cur,
    );
    const { error } = await supabase.from("leads" as any).update({ status: value }).eq("id", id);
    if (error) {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    }
  };

  const clearFilters = () => {
    setFormType("all"); setStatus("all"); setStartDate(undefined); setEndDate(undefined); setSearch("");
  };

  const isLoading = leadsQuery.isLoading;
  const isError = leadsQuery.isError;
  const isEmpty = !isLoading && !isError && filtered.length === 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Inbound submissions from xboom.in forms
          </p>
        </div>
        <Badge variant="secondary">{total.toLocaleString("en-IN")} total · page {page} of {totalPages}</Badge>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={formType} onValueChange={setFormType}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Form type" /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">All form types</SelectItem>
              {FORM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
          />

          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, company, message…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Submitted</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={11} className="p-0">
                  <TableSkeleton rows={Math.min(pageSize, 8)} columns={11} showHeader={false} />
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={11}>
                  <DataErrorState
                    message={leadsQuery.error instanceof Error ? leadsQuery.error.message : undefined}
                    onRetry={() => leadsQuery.refetch()}
                  />
                </TableCell>
              </TableRow>
            )}
            {isEmpty && (
              <TableRow>
                <TableCell colSpan={11}>
                  <EmptyState
                    icon={Inbox}
                    title="No leads match current filters"
                    description="Try expanding the date range or removing filters."
                    action={
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Reset filters
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && filtered.map(r => {
              const isOpen = expanded.has(r.id);
              const submitted = r.submitted_at || r.created_at;
              const submittedFmt = submitted ? format(new Date(submitted), "dd MMM yyyy, HH:mm") : "—";
              return (
                <>
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => toggleRow(r.id)}>
                    <TableCell className="w-8 px-2">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{submittedFmt}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.form_type ?? "—"}</Badge></TableCell>
                    <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {r.email ? <a className="text-primary hover:underline" href={`mailto:${r.email}`}>{r.email}</a> : "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {r.phone ? <a className="text-primary hover:underline" href={`tel:${r.phone}`}>{r.phone}</a> : "—"}
                    </TableCell>
                    <TableCell>{r.company ?? "—"}</TableCell>
                    <TableCell>{r.location ?? "—"}</TableCell>
                    <TableCell>{r.urgency ? <Badge variant="secondary" className="text-xs">{r.urgency}</Badge> : "—"}</TableCell>
                    <TableCell className="max-w-[260px] text-sm text-muted-foreground">{truncate(r.message)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as Status)}>
                        <SelectTrigger className={`h-8 text-xs ${STATUS_COLORS[r.status] ?? ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={`${r.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={11} className="p-4">
                        <LeadDetail lead={r} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); if (page > 1) setPage(p => p - 1); }}
                aria-disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive aria-label={`Page ${page} of ${totalPages}`}>
                {page} / {totalPages}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(p => p + 1); }}
                aria-disabled={page >= totalPages}
                className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

function LeadDetail({ lead }: { lead: Lead }) {
  const canonical: Array<[string, any]> = [
    ["Form type", lead.form_type], ["Name", lead.name], ["Email", lead.email],
    ["Phone", lead.phone], ["Company", lead.company], ["Subject", lead.subject],
    ["Message", lead.message], ["Location", lead.location], ["Role", lead.role],
    ["Urgency", lead.urgency], ["Sector", lead.sector],
  ];
  const payloadEntries = lead.payload ? Object.entries(lead.payload) : [];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Canonical fields</h4>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
          {canonical.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v ? String(v) : <span className="text-muted-foreground/60">—</span>}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Page URL</dt>
          <dd className="break-all">
            {lead.page_url
              ? <a href={lead.page_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{lead.page_url}</a>
              : <span className="text-muted-foreground/60">—</span>}
          </dd>
        </dl>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Payload</h4>
        {payloadEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Empty</p>
        ) : (
          <dl className="grid grid-cols-[160px_1fr] gap-y-1 text-sm">
            {payloadEntries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-words">
                  {typeof v === "object" && v !== null ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre> : String(v ?? "")}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <Collapsible className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs">Technical info</Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="text-xs text-muted-foreground space-y-1 mt-2">
            <div><span className="font-medium">IP:</span> {lead.ip ?? "—"}</div>
            <div className="break-all"><span className="font-medium">User agent:</span> {lead.user_agent ?? "—"}</div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}