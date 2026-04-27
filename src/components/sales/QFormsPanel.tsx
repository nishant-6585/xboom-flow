import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { toast } from "@/hooks/use-toast";

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

export default function QFormsPanel() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Filters
  const [formType, setFormType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("leads" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (formType !== "all") q = q.eq("form_type", formType);
    if (status !== "all") q = q.eq("status", status);
    if (startDate) q = q.gte("created_at", startDate.toISOString());
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      q = q.lte("created_at", e.toISOString());
    }
    const { data, error } = await q;
    if (error) {
      toast({ title: "Failed to load leads", description: error.message, variant: "destructive" });
    } else {
      setRows((data as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [formType, status, startDate, endDate]);

  // Realtime new leads
  useEffect(() => {
    const ch = supabase
      .channel("leads-incoming")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const prev = rows;
    setRows(rs => rs.map(r => r.id === id ? { ...r, status: value } : r));
    const { error } = await supabase.from("leads" as any).update({ status: value }).eq("id", id);
    if (error) {
      setRows(prev);
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    }
  };

  const clearFilters = () => {
    setFormType("all"); setStatus("all"); setStartDate(undefined); setEndDate(undefined); setSearch("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">QForms</h2>
          <p className="text-sm text-muted-foreground">
            Inbound submissions from xboom.in website forms
          </p>
        </div>
        <Badge variant="secondary">{filtered.length} leads</Badge>
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
            {loading && (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No leads match the current filters.</TableCell></TableRow>
            )}
            {!loading && filtered.map(r => {
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