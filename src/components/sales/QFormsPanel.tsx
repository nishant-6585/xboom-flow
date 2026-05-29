import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, subDays, isToday, isYesterday } from "date-fns";
import {
  ChevronDown, ChevronRight, Search, X, Phone, Mail, MessageCircle,
  UserCheck, Inbox, CheckCircle2, Flame, FileText, LayoutGrid, Table as TableIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from "recharts";
import { EnquiryConvertButton } from "./EnquiryConvertButton";
import { ProspectButton } from "./ProspectButton";
import { AttentionButton } from "./AttentionButton";
import { LeadContactDrawer, LeadContactData } from "./LeadContactDrawer";
import { LinkToCompanyButton } from "./LinkToCompanyButton";
import { LeadActionsCell } from "./LeadActionsCell";
import { touchedRowCn, isRowTouched } from "@/lib/touchedRow";
import { useEngagedLeadIds } from "@/hooks/useEngagedLeadIds";

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

const TEMP_COLORS: Record<string, string> = {
  hot:  "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  warm: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  cold: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
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
  assigned_to: string | null;
  assigned_to_name: string | null;
  last_contacted_at: string | null;
  is_enquiry_converted: boolean;
  lead_temperature: string;
}

interface SalesUser { user_id: string; name: string }

function truncate(s: string | null, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function relativeTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "HH:mm")}`;
  return format(d, "dd MMM, HH:mm");
}

export default function QFormsPanel() {
  const { user, profile, role } = useAuth();
  const { data: engagedIds } = useEngagedLeadIds('lead');
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [salesPool, setSalesPool] = useState<SalesUser[]>([]);

  // Drawer
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);

  // Filters
  const [formType, setFormType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [temperature, setTemperature] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const canManage = role === "admin" || role === "sales" || role === "sales_manager";

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("leads" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (formType !== "all") q = q.eq("form_type", formType);
    if (status !== "all") q = q.eq("status", status);
    if (assignee !== "all") {
      if (assignee === "unassigned") q = q.is("assigned_to", null);
      else if (assignee === "mine" && user) q = q.eq("assigned_to", user.id);
      else q = q.eq("assigned_to", assignee);
    }
    if (temperature !== "all") q = q.eq("lead_temperature", temperature);
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

  // Load sales pool (for assignment dropdown)
  useEffect(() => {
    (async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["sales", "sales_manager"]);
      const ids = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
      if (ids.length === 0) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, name")
        .eq("is_approved", true)
        .in("user_id", ids);
      const { filterAllowedAssignees } = await import("@/lib/allowedAssignees");
      const filtered = filterAllowedAssignees((profs ?? []) as any[]);
      setSalesPool(filtered.sort((a: any, b: any) => a.name.localeCompare(b.name)) as any);
    })();
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [formType, status, assignee, temperature, startDate, endDate]);

  // Realtime new leads
  useEffect(() => {
    const ch = supabase
      .channel("qforms-leads-incoming")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      [r.name, r.email, r.phone, r.company, r.message, r.assigned_to_name]
        .filter(Boolean)
        .some(v => v!.toString().toLowerCase().includes(term))
    );
  }, [rows, search]);

  // Stats (computed on full rows ignoring search but respecting filters)
  const stats = useMemo(() => {
    const total = rows.length;
    const newCount = rows.filter(r => r.status === "new").length;
    const contacted = rows.filter(r => r.status === "contacted" || r.status === "qualified").length;
    const converted = rows.filter(r => r.status === "converted" || r.is_enquiry_converted).length;
    const today = startOfDay(new Date()).toISOString();
    const todayCount = rows.filter(r => r.created_at >= today).length;
    const week = subDays(new Date(), 7).toISOString();
    const weekCount = rows.filter(r => r.created_at >= week).length;
    const unassigned = rows.filter(r => !r.assigned_to).length;
    return { total, newCount, contacted, converted, todayCount, weekCount, unassigned };
  }, [rows]);

  const formTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      const k = r.form_type ?? "unknown";
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  // Daily submissions over the last 30 days (within the currently filtered rows)
  const dailyTrend = useMemo(() => {
    const days = 30;
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(startOfDay(new Date()), i);
      buckets.set(format(d, "yyyy-MM-dd"), 0);
    }
    rows.forEach(r => {
      const key = format(new Date(r.created_at), "yyyy-MM-dd");
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    return Array.from(buckets.entries()).map(([date, count]) => ({
      date: format(new Date(date), "dd MMM"),
      count,
    }));
  }, [rows]);

  // Full form-type ranking for the bar chart
  const formTypeChart = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      const k = r.form_type ?? "unknown";
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([form_type, count]) => ({ form_type, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const toggleRow = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateLeadField = async (id: number, patch: Partial<Lead>) => {
    const prev = rows;
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    const { error } = await supabase.from("leads" as any).update(patch as any).eq("id", id);
    if (error) {
      setRows(prev);
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const assignTo = async (lead: Lead, userId: string) => {
    const target = salesPool.find(s => s.user_id === userId);
    if (!target) return;
    await updateLeadField(lead.id, {
      assigned_to: target.user_id,
      assigned_to_name: target.name,
    });
    toast({ title: `Assigned to ${target.name}` });
  };

  const markContacted = async (lead: Lead) => {
    await updateLeadField(lead.id, {
      status: "contacted",
      last_contacted_at: new Date().toISOString(),
    });
  };

  const clearFilters = () => {
    setFormType("all"); setStatus("all"); setAssignee("all"); setTemperature("all");
    setStartDate(undefined); setEndDate(undefined); setSearch("");
  };

  // Build LeadContactData for drawer
  const drawerData: LeadContactData | null = drawerLead ? (() => {
    // Merge fixed columns with raw payload so the drawer shows every field the user filled in
    const base: Record<string, string | number | boolean | null> = {
      "Form type": drawerLead.form_type,
      "Subject": drawerLead.subject,
      "Urgency": drawerLead.urgency,
      "Sector": drawerLead.sector,
      "Role": drawerLead.role,
      "Page URL": drawerLead.page_url,
    };
    if (drawerLead.payload && typeof drawerLead.payload === "object") {
      for (const [k, v] of Object.entries(drawerLead.payload)) {
        if (v == null || v === "") continue;
        // Skip duplicates already shown as primary fields
        const lower = k.toLowerCase();
        if (["name", "email", "phone", "company", "message", "subject"].includes(lower)) continue;
        const label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        if (typeof v === "object") {
          base[label] = JSON.stringify(v);
        } else {
          base[label] = v as string | number | boolean;
        }
      }
    }
    return {
      id: String(drawerLead.id),
      source_type: 'lead',
      customer_name: drawerLead.name ?? "—",
      phone: drawerLead.phone,
      email: drawerLead.email,
      company: drawerLead.company,
      city: drawerLead.location,
      notes: drawerLead.message,
      status: drawerLead.status,
      assigned_to_name: drawerLead.assigned_to_name,
      created_at: drawerLead.created_at,
      extras: base,
    };
  })() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">QForms</h2>
          <p className="text-sm text-muted-foreground">
            Inbound submissions from xboom.in website forms — auto-assigned round-robin to sales
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered.length} leads</Badge>
          <div className="inline-flex rounded-md border border-border/50 bg-muted/40 p-0.5">
            <Button
              size="sm"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => setViewMode("table")}
              title="Table view"
            >
              <TableIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "cards" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => setViewMode("cards")}
              title="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={Inbox} label="Total" value={stats.total} tint="text-foreground" />
        <StatCard icon={Flame} label="New" value={stats.newCount} tint="text-blue-600" />
        <StatCard icon={Phone} label="Contacted" value={stats.contacted} tint="text-amber-600" />
        <StatCard icon={CheckCircle2} label="Converted" value={stats.converted} tint="text-emerald-600" />
        <StatCard icon={FileText} label="Today" value={stats.todayCount} tint="text-purple-600" />
        <StatCard icon={FileText} label="Last 7d" value={stats.weekCount} tint="text-indigo-600" />
        <StatCard icon={UserCheck} label="Unassigned" value={stats.unassigned} tint="text-rose-600" />
      </div>

      {/* Form-type breakdown */}
      {formTypeBreakdown.length > 0 && (
        <Card className="p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Top form types
          </div>
          <div className="flex flex-wrap gap-2">
            {formTypeBreakdown.map(([k, v]) => (
              <Badge key={k} variant="outline" className="text-xs">
                {k} <span className="ml-1.5 font-bold text-foreground">{v}</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Charts: daily trend + form-type breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Daily submissions (last 30 days)
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RTooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Submissions by form type
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={formTypeChart}
                layout="vertical"
                margin={{ top: 5, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="form_type"
                  tick={{ fontSize: 11 }}
                  width={140}
                />
                <RTooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={formType} onValueChange={setFormType}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Form type" /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">All form types</SelectItem>
              {FORM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {salesPool.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={temperature} onValueChange={setTemperature}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Temperature" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All temps</SelectItem>
              <SelectItem value="hot">🔥 Hot</SelectItem>
              <SelectItem value="warm">Warm</SelectItem>
              <SelectItem value="cold">Cold</SelectItem>
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
            placeholder="Search name, email, phone, company, assignee, message…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      {viewMode === "table" && (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-[180px]">Actions</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Company / Location</TableHead>
              <TableHead>Temp</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Last contact</TableHead>
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
              const submittedFmt = submitted ? format(new Date(submitted), "dd MMM, HH:mm") : "—";
              const tempClass = TEMP_COLORS[r.lead_temperature] ?? TEMP_COLORS.warm;
              return (
                <>
                  <TableRow
                    key={r.id}
                    className={touchedRowCn(isRowTouched('qforms', r, engagedIds), "cursor-pointer")}
                    onClick={() => setDrawerLead(r)}
                  >
                    <TableCell className="w-8 px-2" onClick={(e) => { e.stopPropagation(); toggleRow(r.id); }}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <LeadActionsCell
                        sourceType="lead"
                        sourceId={String(r.id)}
                        customerName={r.name ?? "Unknown"}
                        phone={r.phone}
                        email={r.email}
                        company={r.company}
                        city={r.location}
                        productName={r.subject || r.form_type || ""}
                        urgency={r.urgency}
                        notes={r.message}
                        isAlreadyConverted={r.is_enquiry_converted}
                        sourceLabel="Q-Form"
                        onContacted={() => markContacted(r)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{submittedFmt}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.form_type ?? "—"}</Badge></TableCell>
                    <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-xs space-y-0.5">
                      {r.email && <a className="text-primary hover:underline block" href={`mailto:${r.email}`}>{r.email}</a>}
                      {r.phone && <a className="text-primary hover:underline block" href={`tel:${r.phone}`}>{r.phone}</a>}
                      {!r.email && !r.phone && "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{r.company ?? "—"}</div>
                      <div className="text-muted-foreground">{r.location ?? ""}</div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={r.lead_temperature}
                        onValueChange={(v) => updateLeadField(r.id, { lead_temperature: v })}
                      >
                        <SelectTrigger className={`h-7 px-2 text-[11px] border ${tempClass}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hot">🔥 Hot</SelectItem>
                          <SelectItem value="warm">Warm</SelectItem>
                          <SelectItem value="cold">Cold</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canManage ? (
                        <Select
                          value={r.assigned_to ?? "unassigned"}
                          onValueChange={(v) => v !== "unassigned" && assignTo(r, v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-[140px]">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent className="max-h-80">
                            <SelectItem value="unassigned" disabled>Unassigned</SelectItem>
                            {salesPool.map(s => (
                              <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{r.assigned_to_name ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(r.last_contacted_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={r.status} onValueChange={(v) => updateLeadField(r.id, { status: v as Status })}>
                        <SelectTrigger className={`h-7 text-xs ${STATUS_COLORS[r.status] ?? ""}`}>
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
      )}

      {viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {loading && (
            <div className="col-span-full text-center text-muted-foreground py-8">Loading…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-8">
              No leads match the current filters.
            </div>
          )}
          {!loading && filtered.map(r => {
            const submitted = r.submitted_at || r.created_at;
            const submittedFmt = submitted ? format(new Date(submitted), "dd MMM, HH:mm") : "—";
            const tempClass = TEMP_COLORS[r.lead_temperature] ?? TEMP_COLORS.warm;
            return (
              <Card
                key={r.id}
                className="p-3 cursor-pointer hover:border-primary/40 transition-colors space-y-2"
                onClick={() => setDrawerLead(r)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name ?? <span className="italic text-muted-foreground">Unnamed lead</span>}</div>
                    <div className="text-[11px] text-muted-foreground">{submittedFmt}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{r.form_type ?? "—"}</Badge>
                </div>

                <div className="text-xs space-y-0.5" onClick={(e) => e.stopPropagation()}>
                  {r.email && <a className="text-primary hover:underline block truncate" href={`mailto:${r.email}`}>{r.email}</a>}
                  {r.phone && <a className="text-primary hover:underline block" href={`tel:${r.phone}`}>{r.phone}</a>}
                  {!r.email && !r.phone && <span className="italic text-muted-foreground">No contact</span>}
                </div>

                <div className="text-xs">
                  <div className={r.company ? "" : "italic text-muted-foreground"}>{r.company ?? "No company"}</div>
                  <div className="text-muted-foreground">{r.location ?? ""}</div>
                </div>

                <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <Select value={r.lead_temperature} onValueChange={(v) => updateLeadField(r.id, { lead_temperature: v })}>
                    <SelectTrigger className={`h-7 px-2 text-[11px] border w-auto ${tempClass}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">🔥 Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={r.status} onValueChange={(v) => updateLeadField(r.id, { status: v as Status })}>
                    <SelectTrigger className={`h-7 text-xs w-auto ${STATUS_COLORS[r.status] ?? ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.assigned_to_name ? `→ ${r.assigned_to_name}` : <span className="italic">Unassigned</span>}
                    <span className="mx-1">·</span>
                    {relativeTime(r.last_contacted_at)}
                  </div>
                  <div className="flex items-center gap-1">
                    {r.phone && (
                      <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Call">
                        <a href={`tel:${r.phone}`} onClick={() => markContacted(r)}>
                          <Phone className="h-3.5 w-3.5 text-blue-600" />
                        </a>
                      </Button>
                    )}
                    {r.phone && (
                      <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="WhatsApp">
                        <a href={`https://wa.me/${r.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" onClick={() => markContacted(r)}>
                          <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                        </a>
                      </Button>
                    )}
                    <ProspectButton sourceType="lead" sourceId={String(r.id)} customerName={r.name ?? "Unknown"} phoneNumber={r.phone} email={r.email} company={r.company} city={r.location} productName={r.subject || r.form_type || ""} notes={r.message} />
                    <AttentionButton sourceType="lead" sourceId={String(r.id)} customerName={r.name ?? "Unknown"} phoneNumber={r.phone} email={r.email} company={r.company} city={r.location} productName={r.subject || r.form_type || ""} notes={r.message} />
                    <EnquiryConvertButton sourceType="lead" sourceId={String(r.id)} customerName={r.name ?? "Unknown"} phoneNumber={r.phone} email={r.email} company={r.company} city={r.location} productName={r.subject || r.form_type || ""} urgency={r.urgency} notes={r.message} isAlreadyConverted={r.is_enquiry_converted} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <LeadContactDrawer
        open={!!drawerLead}
        onOpenChange={(o) => { if (!o) setDrawerLead(null); }}
        lead={drawerData}
        onSave={async (updates) => {
          if (!drawerLead) return;
          await updateLeadField(drawerLead.id, {
            name: updates.customer_name,
            phone: updates.phone ?? null,
            email: updates.email ?? null,
            company: updates.company ?? null,
            location: updates.city ?? null,
            message: updates.notes ?? null,
          });
          toast({ title: "Lead updated" });
        }}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tint }: { icon: any; label: string; value: number; tint: string }) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className={`shrink-0 ${tint}`}><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-lg font-bold leading-tight">{value}</div>
      </div>
    </Card>
  );
}

function LeadDetail({ lead }: { lead: Lead }) {
  const canonical: Array<[string, any]> = [
    ["Form type", lead.form_type], ["Name", lead.name], ["Email", lead.email],
    ["Phone", lead.phone], ["Company", lead.company], ["Subject", lead.subject],
    ["Message", lead.message], ["Location", lead.location], ["Role", lead.role],
    ["Urgency", lead.urgency], ["Sector", lead.sector],
    ["Assigned to", lead.assigned_to_name],
    ["Last contacted", lead.last_contacted_at ? format(new Date(lead.last_contacted_at), "dd MMM yyyy, HH:mm") : null],
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