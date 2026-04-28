import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, PhoneCall, ArrowRightCircle, Target, CheckCircle2, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { format, startOfMonth, endOfMonth, subDays, subMonths, eachDayOfInterval } from "date-fns";

const PERIOD_OPTIONS = [
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 14 Days", value: "14d" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "Last 3 Months", value: "3m" },
];

type SourceKey = "qforms" | "elevenlabs";

interface DrillRow {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  product_name: string | null;
  created_at: string;
  bucket: "lead" | "prospect" | "enquiry";
}

interface DrillState {
  open: boolean;
  source: SourceKey;
  bucket: "lead" | "prospect" | "enquiry" | null;
  day: string | null; // yyyy-MM-dd or null = totals
  rows: DrillRow[];
  title: string;
}

function rangeFromPeriod(period: string) {
  const now = new Date();
  if (period === "7d") return { start: subDays(now, 6), end: now };
  if (period === "14d") return { start: subDays(now, 13), end: now };
  if (period === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (period === "last_month") {
    const lm = subMonths(now, 1);
    return { start: startOfMonth(lm), end: endOfMonth(lm) };
  }
  return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
}

export function QFormsElevenLabsConversionAnalytics() {
  const [period, setPeriod] = useState("14d");
  const [drill, setDrill] = useState<DrillState>({ open: false, source: "qforms", bucket: null, day: null, rows: [], title: "" });

  const { start, end } = useMemo(() => rangeFromPeriod(period), [period]);
  const startISO = format(start, "yyyy-MM-dd") + "T00:00:00";
  const endISO = format(end, "yyyy-MM-dd") + "T23:59:59";

  const { data, isLoading } = useQuery({
    queryKey: ["qforms-elevenlabs-conv", startISO, endISO],
    queryFn: async () => {
      const [formLeadsRes, callLogsRes] = await Promise.all([
        supabase.from("form_leads")
          .select("id, name, phone, email, subject, form_type, created_at, is_enquiry_converted")
          .gte("created_at", startISO).lte("created_at", endISO),
        supabase.from("call_logs")
          .select("id, caller_name, caller_number, requirement, created_at, is_enquiry_converted, lead_source")
          .eq("lead_source", "ElevenLabs")
          .gte("created_at", startISO).lte("created_at", endISO),
      ]);
      const formLeads = formLeadsRes.data || [];
      const callLogs = callLogsRes.data || [];

      // Prospects converted from these (via source_id link)
      const formIds = formLeads.map((f: any) => f.id);
      const callIds = callLogs.map((c: any) => c.id);
      const allIds = [...formIds, ...callIds];
      let prospects: any[] = [];
      if (allIds.length > 0) {
        const { data: pData } = await supabase.from("prospects")
          .select("id, customer_name, phone_number, email, product_name, created_at, source_id, source_type")
          .in("source_id", allIds as any);
        prospects = pData || [];
      }
      const formIdSet = new Set(formIds);
      const callIdSet = new Set(callIds);
      const prospectsForForms = prospects.filter(p => formIdSet.has(p.source_id));
      const prospectsForCalls = prospects.filter(p => callIdSet.has(p.source_id));

      return {
        formLeads,
        callLogs,
        prospectsForForms,
        prospectsForCalls,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  // Build day-wise series for both sources
  const days = useMemo(() => eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd")), [start, end]);

  const buildSeries = (sourceKey: SourceKey) => {
    if (!data) return [];
    const leads = sourceKey === "qforms" ? data.formLeads : data.callLogs;
    const prospects = sourceKey === "qforms" ? data.prospectsForForms : data.prospectsForCalls;
    const idToCreated = new Map<string, string>();
    leads.forEach((l: any) => idToCreated.set(l.id, format(new Date(l.created_at), "yyyy-MM-dd")));

    const counts: Record<string, { leads: number; prospects: number; enquiries: number }> = {};
    days.forEach(d => { counts[d] = { leads: 0, prospects: 0, enquiries: 0 }; });
    leads.forEach((l: any) => {
      const d = format(new Date(l.created_at), "yyyy-MM-dd");
      if (counts[d]) {
        counts[d].leads++;
        if (l.is_enquiry_converted) counts[d].enquiries++;
      }
    });
    prospects.forEach((p: any) => {
      // Bucket prospects under the lead's creation day for cohort clarity
      const d = idToCreated.get(p.source_id);
      if (d && counts[d]) counts[d].prospects++;
    });
    return days.map(d => ({ day: format(new Date(d), "dd MMM"), date: d, ...counts[d] }));
  };

  const qformsSeries = useMemo(() => buildSeries("qforms"), [data, days]);
  const elevenSeries = useMemo(() => buildSeries("elevenlabs"), [data, days]);

  const totals = (sourceKey: SourceKey) => {
    if (!data) return { leads: 0, prospects: 0, enquiries: 0, prospectRate: 0, enquiryRate: 0 };
    const leads = sourceKey === "qforms" ? data.formLeads.length : data.callLogs.length;
    const prospects = sourceKey === "qforms" ? data.prospectsForForms.length : data.prospectsForCalls.length;
    const enquiries = (sourceKey === "qforms" ? data.formLeads : data.callLogs).filter((l: any) => l.is_enquiry_converted).length;
    return {
      leads,
      prospects,
      enquiries,
      prospectRate: leads ? (prospects / leads) * 100 : 0,
      enquiryRate: leads ? (enquiries / leads) * 100 : 0,
    };
  };

  const openDrill = (sourceKey: SourceKey, bucket: "lead" | "prospect" | "enquiry", day: string | null) => {
    if (!data) return;
    const leads = sourceKey === "qforms" ? data.formLeads : data.callLogs;
    const prospects = sourceKey === "qforms" ? data.prospectsForForms : data.prospectsForCalls;
    const idToCreated = new Map<string, string>();
    leads.forEach((l: any) => idToCreated.set(l.id, format(new Date(l.created_at), "yyyy-MM-dd")));

    let rows: DrillRow[] = [];
    if (bucket === "lead") {
      const filtered = day ? leads.filter((l: any) => format(new Date(l.created_at), "yyyy-MM-dd") === day) : leads;
      rows = filtered.map((l: any) => ({
        id: l.id,
        customer_name: (sourceKey === "qforms" ? l.name : l.caller_name) || "Unknown",
        phone: sourceKey === "qforms" ? l.phone : l.caller_number,
        email: sourceKey === "qforms" ? l.email : null,
        product_name: sourceKey === "qforms" ? (l.subject || l.form_type) : l.requirement,
        created_at: l.created_at,
        bucket: "lead",
      }));
    } else if (bucket === "enquiry") {
      const filtered = leads.filter((l: any) => l.is_enquiry_converted && (!day || format(new Date(l.created_at), "yyyy-MM-dd") === day));
      rows = filtered.map((l: any) => ({
        id: l.id,
        customer_name: (sourceKey === "qforms" ? l.name : l.caller_name) || "Unknown",
        phone: sourceKey === "qforms" ? l.phone : l.caller_number,
        email: sourceKey === "qforms" ? l.email : null,
        product_name: sourceKey === "qforms" ? (l.subject || l.form_type) : l.requirement,
        created_at: l.created_at,
        bucket: "enquiry",
      }));
    } else {
      const filtered = day
        ? prospects.filter((p: any) => idToCreated.get(p.source_id) === day)
        : prospects;
      rows = filtered.map((p: any) => ({
        id: p.id,
        customer_name: p.customer_name || "Unknown",
        phone: p.phone_number,
        email: p.email,
        product_name: p.product_name,
        created_at: p.created_at,
        bucket: "prospect",
      }));
    }
    const sourceLabel = sourceKey === "qforms" ? "QForms" : "ElevenLabs";
    const bucketLabel = bucket === "lead" ? "Leads" : bucket === "prospect" ? "Prospects" : "Enquiries";
    const dayLabel = day ? format(new Date(day), "dd MMM yyyy") : "Total";
    setDrill({
      open: true,
      source: sourceKey,
      bucket,
      day,
      rows,
      title: `${sourceLabel} · ${bucketLabel} · ${dayLabel}`,
    });
  };

  const renderSourceSection = (sourceKey: SourceKey, title: string, icon: JSX.Element, series: any[]) => {
    const t = totals(sourceKey);
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {icon}
            {title} — Conversion Funnel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stat tiles - clickable */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <button
              onClick={() => openDrill(sourceKey, "lead", null)}
              className="text-left p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors border"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Target className="w-3.5 h-3.5" /> Total Leads
              </div>
              <div className="text-2xl font-bold mt-1">{t.leads}</div>
            </button>
            <button
              onClick={() => openDrill(sourceKey, "prospect", null)}
              className="text-left p-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors border border-amber-500/30"
            >
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <ArrowRightCircle className="w-3.5 h-3.5" /> → Prospects
              </div>
              <div className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-400">{t.prospects}</div>
              <div className="text-[10px] text-muted-foreground">{t.prospectRate.toFixed(1)}% rate</div>
            </button>
            <button
              onClick={() => openDrill(sourceKey, "enquiry", null)}
              className="text-left p-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-colors border border-blue-500/30"
            >
              <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> → Enquiries
              </div>
              <div className="text-2xl font-bold mt-1 text-blue-700 dark:text-blue-400">{t.enquiries}</div>
              <div className="text-[10px] text-muted-foreground">{t.enquiryRate.toFixed(1)}% rate</div>
            </button>
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-400">
                <TrendingUp className="w-3.5 h-3.5" /> Combined Conv.
              </div>
              <div className="text-2xl font-bold mt-1 text-purple-700 dark:text-purple-400">
                {t.leads ? (((t.prospects + t.enquiries) / t.leads) * 100).toFixed(1) : 0}%
              </div>
              <div className="text-[10px] text-muted-foreground">prospects + enquiries</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <div className="text-xs text-muted-foreground">Avg / Day</div>
              <div className="text-2xl font-bold mt-1">{(t.leads / Math.max(days.length, 1)).toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">leads per day</div>
            </div>
          </div>

          {/* Day-wise stacked chart - clickable bars */}
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={series}
                onClick={(e: any) => {
                  if (e?.activeLabel) {
                    const dt = series.find(s => s.day === e.activeLabel)?.date;
                    if (dt) openDrill(sourceKey, "lead", dt);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="leads" name="Leads" fill="hsl(var(--muted-foreground))" cursor="pointer" />
                <Bar dataKey="prospects" name="→ Prospects" fill="#F59E0B" cursor="pointer" />
                <Bar dataKey="enquiries" name="→ Enquiries" fill="#3B82F6" cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground italic text-center">
            Tip: click a stat tile or a bar to see the underlying records.
          </p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          QForms & ElevenLabs Conversion Analytics
        </h3>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {renderSourceSection("qforms", "QForms", <FileText className="w-4 h-4 text-primary" />, qformsSeries)}
          {renderSourceSection("elevenlabs", "ElevenLabs", <PhoneCall className="w-4 h-4 text-primary" />, elevenSeries)}
        </div>
      )}

      <Dialog open={drill.open} onOpenChange={(o) => setDrill(s => ({ ...s, open: o }))}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {drill.title}
              <Badge variant="secondary">{drill.rows.length} record{drill.rows.length !== 1 ? "s" : ""}</Badge>
            </DialogTitle>
          </DialogHeader>
          {drill.rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No records</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Product / Subject</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drill.rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className={r.customer_name === "Unknown" ? "italic text-muted-foreground" : "font-medium"}>
                      {r.customer_name}
                    </TableCell>
                    <TableCell className={!r.phone ? "italic text-muted-foreground" : ""}>{r.phone || "—"}</TableCell>
                    <TableCell className={!r.email ? "italic text-muted-foreground" : ""}>{r.email || "—"}</TableCell>
                    <TableCell className={!r.product_name ? "italic text-muted-foreground" : ""}>{r.product_name || "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
