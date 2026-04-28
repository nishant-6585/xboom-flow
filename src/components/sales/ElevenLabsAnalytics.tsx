import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import {
  Phone, Flame, Sparkles, Target, Clock, TrendingUp, UserCheck, CheckCircle2,
  Calendar, Activity, Wallet, MessageCircle,
} from "lucide-react";
import {
  format, startOfDay, startOfWeek, startOfMonth, eachDayOfInterval,
  subDays, subMonths, endOfMonth,
} from "date-fns";

type ElevenLead = {
  id: string;
  caller_number: string;
  customer_name: string | null;
  call_duration: number | null;
  requirement: string | null;
  budget: string | null;
  priority: string | null;
  lead_score: number | null;
  lead_status: string | null;
  raw_transcript: string | null;
  notes: string | null;
  created_at: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  last_contacted_at: string | null;
  lead_temperature: string;
  is_enquiry_converted: boolean;
};

interface Props {
  leads: ElevenLead[];
  /** prospects whose source_id ∈ leads.id (i.e. converted to prospect) */
  prospectIds?: Set<string>;
}

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
  "hsl(24 90% 55%)", "hsl(160 60% 45%)", "hsl(280 60% 55%)",
];
const TEMP_COLORS: Record<string, string> = {
  hot: "hsl(0 80% 55%)", warm: "hsl(38 92% 50%)", cold: "hsl(200 80% 55%)", unset: "hsl(var(--muted-foreground))",
};
const STATUS_COLORS: Record<string, string> = {
  New: "hsl(217 91% 60%)", Contacted: "hsl(38 92% 50%)",
  Qualified: "hsl(280 65% 55%)", Closed: "hsl(142 76% 36%)",
};

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

function parseBudget(b: string | null | undefined): number | null {
  if (!b) return null;
  const s = b.toLowerCase().replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l|cr|crore|k|thousand)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2];
  if (!unit) return n;
  if (unit.startsWith("k") || unit === "thousand") return n * 1_000;
  if (unit === "l" || unit.startsWith("la")) return n * 100_000;
  if (unit.startsWith("cr")) return n * 10_000_000;
  return n;
}

function bucketBudget(value: number | null): string {
  if (value == null) return "Unspecified";
  if (value < 50_000) return "<₹50K";
  if (value < 200_000) return "₹50K–2L";
  if (value < 500_000) return "₹2L–5L";
  if (value < 1_000_000) return "₹5L–10L";
  return "₹10L+";
}

export function ElevenLabsAnalytics({ leads, prospectIds }: Props) {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [windowDays, setWindowDays] = useState<number>(30);

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  // KPIs
  const kpis = useMemo(() => {
    const total = leads.length;
    const today = leads.filter(l => new Date(l.created_at) >= todayStart).length;
    const week = leads.filter(l => new Date(l.created_at) >= weekStart).length;
    const month = leads.filter(l => new Date(l.created_at) >= monthStart).length;
    const hot = leads.filter(l => (l.lead_temperature || "").toLowerCase() === "hot" || (l.priority || "").toLowerCase() === "high").length;
    const converted = leads.filter(l => l.is_enquiry_converted).length;
    const prospected = prospectIds ? leads.filter(l => prospectIds.has(l.id)).length : 0;
    const unassigned = leads.filter(l => !l.assigned_to).length;
    const avgScore = total ? Math.round(leads.reduce((s, l) => s + (l.lead_score || 0), 0) / total) : 0;
    const avgDuration = total ? Math.round(leads.reduce((s, l) => s + (l.call_duration || 0), 0) / total) : 0;
    return {
      total, today, week, month, hot, converted, prospected, unassigned, avgScore, avgDuration,
      convRate: total ? ((converted / total) * 100).toFixed(1) : "0",
      prospectRate: total ? ((prospected / total) * 100).toFixed(1) : "0",
    };
  }, [leads, prospectIds, todayStart, weekStart, monthStart]);

  // Daily / weekly / monthly trend
  const dailyData = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(now, windowDays - 1), end: now });
    return days.map(d => {
      const dEnd = new Date(d); dEnd.setHours(23, 59, 59, 999);
      const inDay = leads.filter(l => { const t = new Date(l.created_at); return t >= d && t <= dEnd; });
      return {
        date: format(d, "dd MMM"),
        calls: inDay.length,
        hot: inDay.filter(l => (l.lead_temperature || "").toLowerCase() === "hot" || (l.priority || "").toLowerCase() === "high").length,
        prospects: prospectIds ? inDay.filter(l => prospectIds.has(l.id)).length : 0,
        enquiries: inDay.filter(l => l.is_enquiry_converted).length,
      };
    });
  }, [leads, prospectIds, windowDays]);

  // Status breakdown
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const s = l.lead_status || "New";
      map.set(s, (map.get(s) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({
      name, value, fill: STATUS_COLORS[name] || COLORS[0],
    }));
  }, [leads]);

  // Temperature breakdown
  const tempData = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const t = (l.lead_temperature || "unset").toLowerCase();
      map.set(t, (map.get(t) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value, fill: TEMP_COLORS[name] || "hsl(var(--muted-foreground))" }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  // Intent (requirement) keyword breakdown
  const intentData = useMemo(() => {
    const buckets: Record<string, number> = {
      "Buy / Quote": 0, "Pricing": 0, "Demo / Info": 0, "Service / Repair": 0,
      "Spare parts": 0, "Training": 0, "Other": 0,
    };
    for (const l of leads) {
      const hay = `${l.requirement || ""} ${l.notes || ""} ${l.raw_transcript || ""}`.toLowerCase();
      if (/\b(buy|purchase|order|quote|quotation)\b/.test(hay)) buckets["Buy / Quote"]++;
      else if (/\b(price|pricing|cost|discount)\b/.test(hay)) buckets["Pricing"]++;
      else if (/\b(demo|info|information|brochure|catalog)\b/.test(hay)) buckets["Demo / Info"]++;
      else if (/\b(repair|service|fix|broken|warranty)\b/.test(hay)) buckets["Service / Repair"]++;
      else if (/\b(spare|part|battery|propeller|motor)\b/.test(hay)) buckets["Spare parts"]++;
      else if (/\b(training|course|certification)\b/.test(hay)) buckets["Training"]++;
      else buckets["Other"]++;
    }
    return Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // Budget buckets
  const budgetData = useMemo(() => {
    const map = new Map<string, number>();
    const order = ["Unspecified", "<₹50K", "₹50K–2L", "₹2L–5L", "₹5L–10L", "₹10L+"];
    for (const k of order) map.set(k, 0);
    for (const l of leads) {
      const b = bucketBudget(parseBudget(l.budget));
      map.set(b, (map.get(b) || 0) + 1);
    }
    return order.map(name => ({ name, count: map.get(name) || 0 }));
  }, [leads]);

  // Assignee leaderboard
  const assigneeData = useMemo(() => {
    const map = new Map<string, { calls: number; converted: number }>();
    for (const l of leads) {
      const a = l.assigned_to_name || "Unassigned";
      if (!map.has(a)) map.set(a, { calls: 0, converted: 0 });
      const e = map.get(a)!;
      e.calls++;
      if (l.is_enquiry_converted) e.converted++;
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, convPct: v.calls ? Math.round((v.converted / v.calls) * 100) : 0 }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 10);
  }, [leads]);

  // Hour-of-day distribution
  const hourData = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${h.toString().padStart(2, "0")}:00`, calls: 0 }));
    for (const l of leads) {
      const h = new Date(l.created_at).getHours();
      arr[h].calls++;
    }
    return arr;
  }, [leads]);

  // Day-of-week distribution
  const dowData = useMemo(() => {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const arr = labels.map(d => ({ day: d, calls: 0 }));
    for (const l of leads) {
      const js = new Date(l.created_at).getDay(); // 0=Sun
      const idx = js === 0 ? 6 : js - 1;
      arr[idx].calls++;
    }
    return arr;
  }, [leads]);

  // Score distribution
  const scoreData = useMemo(() => {
    const buckets = [
      { name: "0-25", min: 0, max: 25, count: 0 },
      { name: "26-50", min: 26, max: 50, count: 0 },
      { name: "51-75", min: 51, max: 75, count: 0 },
      { name: "76-90", min: 76, max: 90, count: 0 },
      { name: "91-100", min: 91, max: 100, count: 0 },
    ];
    for (const l of leads) {
      const s = l.lead_score || 0;
      const b = buckets.find(x => s >= x.min && s <= x.max);
      if (b) b.count++;
    }
    return buckets;
  }, [leads]);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "Today", value: kpis.today, icon: Clock, color: "text-emerald-500" },
          { label: "This Week", value: kpis.week, icon: Calendar, color: "text-blue-500" },
          { label: "This Month", value: kpis.month, icon: TrendingUp, color: "text-purple-500" },
          { label: "🔥 Hot", value: kpis.hot, icon: Flame, color: "text-rose-500" },
          { label: "→ Prospects", value: `${kpis.prospected} (${kpis.prospectRate}%)`, icon: Target, color: "text-amber-500" },
          { label: "→ Enquiries", value: `${kpis.converted} (${kpis.convRate}%)`, icon: CheckCircle2, color: "text-indigo-500" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <k.icon className={`h-4 w-4 ${k.color}`} /> {k.label}
              </div>
              <div className="text-xl font-bold mt-1">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-4 w-4 text-primary" /> Avg Score</div>
          <div className="text-lg font-semibold mt-1">{kpis.avgScore}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-4 w-4 text-primary" /> Avg Duration</div>
          <div className="text-lg font-semibold mt-1">{Math.floor(kpis.avgDuration / 60)}m {kpis.avgDuration % 60}s</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><UserCheck className="h-4 w-4 text-primary" /> Unassigned</div>
          <div className="text-lg font-semibold mt-1">{kpis.unassigned}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><MessageCircle className="h-4 w-4 text-primary" /> Total Leads</div>
          <div className="text-lg font-semibold mt-1">{kpis.total}</div>
        </CardContent></Card>
      </div>

      {/* Trend + funnel side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Daily Call Trend & Conversions
            </CardTitle>
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(parseInt(v))}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7d</SelectItem>
                <SelectItem value="14">Last 14d</SelectItem>
                <SelectItem value="30">Last 30d</SelectItem>
                <SelectItem value="60">Last 60d</SelectItem>
                <SelectItem value="90">Last 90d</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="elCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="calls" stroke="hsl(var(--primary))" fill="url(#elCalls)" name="Total calls" />
                <Line type="monotone" dataKey="hot" stroke="hsl(0 80% 55%)" strokeWidth={2} name="🔥 Hot" dot={false} />
                <Line type="monotone" dataKey="prospects" stroke="hsl(38 92% 50%)" strokeWidth={2} name="→ Prospects" dot={false} />
                <Line type="monotone" dataKey="enquiries" stroke="hsl(217 91% 60%)" strokeWidth={2} name="→ Enquiries" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Total Calls", value: kpis.total, color: "bg-primary", pct: 100 },
              { label: "🔥 Hot Leads", value: kpis.hot, color: "bg-rose-500", pct: kpis.total ? (kpis.hot / kpis.total) * 100 : 0 },
              { label: "Prospects", value: kpis.prospected, color: "bg-amber-500", pct: kpis.total ? (kpis.prospected / kpis.total) * 100 : 0 },
              { label: "Enquiries", value: kpis.converted, color: "bg-indigo-500", pct: kpis.total ? (kpis.converted / kpis.total) * 100 : 0 },
            ].map(s => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-semibold">{s.value} <span className="text-muted-foreground">({s.pct.toFixed(1)}%)</span></span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} transition-all`} style={{ width: `${Math.min(s.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Status + Temperature pies */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Lead Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {statusData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Temperature Mix</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={tempData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {tempData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Lead Score Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Intent + Budget + Assignee */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Caller Intent</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={intentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(280 65% 55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Budget Buckets</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={budgetData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(160 60% 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Assignee Leaderboard</CardTitle></CardHeader>
          <CardContent>
            {assigneeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No assignments yet</p>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {assigneeData.map((a, i) => (
                  <div key={a.name} className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{a.name}</span>
                        <span className="text-xs font-semibold ml-2">{a.calls}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${a.convPct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-10 text-right">{a.convPct}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hour + Day-of-week heat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Calls by Hour of Day</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="calls" fill="hsl(217 91% 60%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Calls by Day of Week</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dowData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="calls" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
