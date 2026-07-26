import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/hooks/useForms";
import { useLeadsFormAnalytics } from "@/hooks/useLeadsFormAnalytics";
import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart,
} from "recharts";
import {
  format, subDays, startOfDay, eachDayOfInterval, isWithinInterval,
  isToday, isYesterday,
  eachHourOfInterval, startOfHour, subHours,
} from "date-fns";
import {
  Inbox, TrendingUp, FileText, Target, Activity, Clock,
  Zap, ArrowUpRight, ArrowDownRight, Minus, CalendarDays, Users,
  Phone, CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface FormsDashboardProps {
  forms: Form[];
}

const CONTACTED_STATUSES = new Set(["contacted", "qualified", "converted"]);
const isConverted = (l: { is_enquiry_converted: boolean | null; status: string | null }) =>
  !!l.is_enquiry_converted || l.status === "converted";

export function FormsDashboard({ forms }: FormsDashboardProps) {
  const [dashTimeRange, setDashTimeRange] = useState<"7d" | "14d" | "30d">("7d");
  const rangeDays = dashTimeRange === "7d" ? 7 : dashTimeRange === "14d" ? 14 : 30;

  const { data: allLeads = [] } = useLeadsFormAnalytics(90);

  const inRange = useMemo(() => {
    const start = subDays(new Date(), rangeDays);
    return allLeads.filter((l) => new Date(l.created_at) >= start);
  }, [allLeads, rangeDays]);

  const kpis = useMemo(() => {
    const now = new Date();
    const rangeStart = subDays(now, rangeDays);
    const prevRangeStart = subDays(rangeStart, rangeDays);

    const current = allLeads.filter((l) => new Date(l.created_at) >= rangeStart);
    const prev = allLeads.filter(
      (l) => new Date(l.created_at) >= prevRangeStart && new Date(l.created_at) < rangeStart
    );

    const todaySubs = allLeads.filter((l) => isToday(new Date(l.created_at)));
    const yesterdaySubs = allLeads.filter((l) => isYesterday(new Date(l.created_at)));

    const contactedCurrent = current.filter((l) => l.status && CONTACTED_STATUSES.has(l.status)).length;
    const contactedPrev = prev.filter((l) => l.status && CONTACTED_STATUSES.has(l.status)).length;
    const contactRate = current.length ? (contactedCurrent / current.length) * 100 : 0;
    const prevContactRate = prev.length ? (contactedPrev / prev.length) * 100 : 0;

    const enqCurrent = current.filter(isConverted).length;
    const enqPrev = prev.filter(isConverted).length;
    const enqRate = current.length ? (enqCurrent / current.length) * 100 : 0;
    const prevEnqRate = prev.length ? (enqPrev / prev.length) * 100 : 0;

    const calcTrend = (c: number, p: number) => {
      if (p === 0 && c === 0) return 0;
      if (p === 0) return 100;
      return ((c - p) / p) * 100;
    };

    return {
      totalForms: forms.length,
      activeForms: forms.filter((f) => f.is_active).length,
      submissions: current.length,
      submissionsTrend: calcTrend(current.length, prev.length),
      todaySubs: todaySubs.length,
      yesterdaySubs: yesterdaySubs.length,
      contactRate,
      contactRateTrend: contactRate - prevContactRate,
      enqRate,
      enqRateTrend: enqRate - prevEnqRate,
      enqCount: enqCurrent,
      avgSubsPerDay: Math.round((current.length / rangeDays) * 10) / 10,
      uniqueTypes: new Set(current.map((l) => l.form_type ?? "unknown")).size,
    };
  }, [forms, allLeads, rangeDays]);

  const dailyTrend = useMemo(() => {
    const days = eachDayOfInterval({
      start: subDays(new Date(), rangeDays - 1),
      end: new Date(),
    });
    return days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const inDay = allLeads.filter((l) =>
        isWithinInterval(new Date(l.created_at), { start: dayStart, end: dayEnd })
      );
      return {
        date: format(day, rangeDays <= 14 ? "MMM d" : "d"),
        submissions: inDay.length,
        converted: inDay.filter(isConverted).length,
      };
    });
  }, [allLeads, rangeDays]);

  const hourlyData = useMemo(() => {
    const now = new Date();
    const hours = eachHourOfInterval({ start: subHours(now, 23), end: startOfHour(now) });
    return hours.map((hour) => {
      const hourEnd = new Date(hour);
      hourEnd.setHours(hourEnd.getHours() + 1);
      return {
        hour: format(hour, "ha"),
        submissions: allLeads.filter((l) =>
          isWithinInterval(new Date(l.created_at), { start: hour, end: hourEnd })
        ).length,
      };
    });
  }, [allLeads]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { count: number; converted: number; contacted: number }>();
    inRange.forEach((l) => {
      const key = l.form_type ?? "unknown";
      const b = map.get(key) ?? { count: 0, converted: 0, contacted: 0 };
      b.count += 1;
      if (isConverted(l)) b.converted += 1;
      if (l.status && CONTACTED_STATUSES.has(l.status)) b.contacted += 1;
      map.set(key, b);
    });
    const arr = Array.from(map.entries()).map(([type, v]) => ({
      form_type: type,
      submissions: v.count,
      converted: v.converted,
      contacted: v.contacted,
      conversion: v.count ? ((v.converted / v.count) * 100).toFixed(1) : "0",
    }));
    const max = Math.max(...arr.map((a) => a.submissions), 1);
    return arr
      .map((a) => ({ ...a, progress: (a.submissions / max) * 100 }))
      .sort((a, b) => b.submissions - a.submissions);
  }, [inRange]);

  const funnelData = useMemo(() => {
    const total = inRange.length;
    const contacted = inRange.filter((l) => l.status && CONTACTED_STATUSES.has(l.status)).length;
    const converted = inRange.filter(isConverted).length;
    return [
      { name: "Submissions", value: total, fill: "hsl(var(--chart-1))" },
      { name: "Contacted", value: contacted, fill: "hsl(var(--chart-2))" },
      { name: "Converted to Enquiry", value: converted, fill: "hsl(var(--chart-3))" },
    ];
  }, [inRange]);

  const TrendIcon = ({ value }: { value: number }) => {
    if (value > 0) return <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />;
    if (value < 0) return <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const TrendBadge = ({ value, suffix = "%" }: { value: number; suffix?: string }) => (
    <span className={`text-xs font-medium inline-flex items-center gap-0.5 ${
      value > 0 ? "text-green-600" : value < 0 ? "text-destructive" : "text-muted-foreground"
    }`}>
      <TrendIcon value={value} />
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );

  if (forms.length === 0 && allLeads.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No dashboard data yet</h3>
          <p className="text-muted-foreground">Website form submissions will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Dashboard Overview · sourced from Sales → Leads (QForms)
          </span>
        </div>
        <Select value={dashTimeRange} onValueChange={(v: any) => setDashTimeRange(v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="14d">Last 14 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</span>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold">{kpis.todaySubs}</p>
            <p className="text-xs text-muted-foreground mt-1">vs {kpis.yesterdaySubs} yesterday</p>
            <div className="absolute -bottom-2 -right-2 h-16 w-16 bg-primary/5 rounded-full" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Submissions</span>
              <div className="h-8 w-8 rounded-full bg-chart-2/10 flex items-center justify-center">
                <Inbox className="h-4 w-4 text-chart-2" />
              </div>
            </div>
            <p className="text-3xl font-bold">{kpis.submissions}</p>
            <TrendBadge value={kpis.submissionsTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact Rate</span>
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Phone className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <p className="text-3xl font-bold">{kpis.contactRate.toFixed(1)}%</p>
            <TrendBadge value={kpis.contactRateTrend} suffix="pp" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Enquiry Conv.</span>
              <div className="h-8 w-8 rounded-full bg-chart-3/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-chart-3" />
              </div>
            </div>
            <p className="text-3xl font-bold">{kpis.enqRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">{kpis.enqCount} converted</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30">
          <CardContent className="py-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="text-lg font-bold">{kpis.totalForms}</p>
              <p className="text-xs text-muted-foreground">Total Forms</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-3 flex items-center gap-3">
            <Target className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-lg font-bold">{kpis.activeForms}</p>
              <p className="text-xs text-muted-foreground">Active Forms</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-3 flex items-center gap-3">
            <Activity className="h-5 w-5 text-chart-4" />
            <div>
              <p className="text-lg font-bold">{kpis.avgSubsPerDay}</p>
              <p className="text-xs text-muted-foreground">Avg Subs/Day</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-3 flex items-center gap-3">
            <Users className="h-5 w-5 text-chart-5" />
            <div>
              <p className="text-lg font-bold">{kpis.uniqueTypes}</p>
              <p className="text-xs text-muted-foreground">Active Form Types</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Submissions & Enquiry Conversions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend}>
                  <defs>
                    <linearGradient id="dashConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="submissions"
                    fill="hsl(var(--primary))"
                    name="Submissions"
                    radius={[4, 4, 0, 0]}
                    barSize={rangeDays <= 14 ? 20 : 12}
                    opacity={0.85}
                  />
                  <Area
                    type="monotone"
                    dataKey="converted"
                    fill="url(#dashConv)"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    name="Converted"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-chart-3" />
              Lead Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5 py-4">
              {funnelData.map((item, i) => {
                const maxVal = Math.max(...funnelData.map((d) => d.value), 1);
                const pct = (item.value / maxVal) * 100;
                return (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-sm font-bold">{item.value}</span>
                    </div>
                    <div className="h-8 w-full rounded-md bg-muted overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: item.fill }}
                      >
                        {pct > 15 && (
                          <span className="text-xs font-medium text-primary-foreground">
                            {pct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {i < funnelData.length - 1 && funnelData[i].value > 0 && (
                      <p className="text-xs text-muted-foreground text-right">
                        ↓ {((funnelData[i + 1].value / funnelData[i].value) * 100).toFixed(1)}% pass-through
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-chart-4" />
            Hourly Activity (Last 24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={window.innerWidth < 768 ? 3 : 1} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="submissions" fill="hsl(var(--primary))" name="Submissions" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-green-500" />
            Form-Type Leaderboard · Last {rangeDays}d
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {leaderboard.slice(0, 15).map((row, i) => (
              <div key={row.form_type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-primary text-primary-foreground" :
                      i === 1 ? "bg-chart-2/20 text-chart-2" :
                      i === 2 ? "bg-chart-3/20 text-chart-3" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium truncate max-w-[240px] sm:max-w-none">{row.form_type}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{row.contacted} contacted</span>
                        <span>•</span>
                        <span>{row.converted} converted</span>
                        <span>•</span>
                        <span>{row.conversion}% enq. conv.</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-bold flex items-center gap-1">
                        <Inbox className="h-3 w-3" /> {row.submissions}
                      </span>
                    </div>
                  </div>
                </div>
                <Progress value={row.progress} className="h-2" />
              </div>
            ))}
            {leaderboard.length === 0 && (
              <p className="text-center text-muted-foreground py-6">No submissions in this range</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-chart-5" />
            Recent Submissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[350px] overflow-y-auto">
            {allLeads.slice(0, 15).map((lead) => {
              const subDate = new Date(lead.created_at);
              return (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
                      isToday(subDate) ? "bg-green-500/10" : "bg-primary/10"
                    }`}>
                      <Inbox className={`h-4 w-4 ${isToday(subDate) ? "text-green-500" : "text-primary"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {lead.name || lead.email || lead.phone || "Anonymous"}
                        <span className="ml-2 text-xs text-muted-foreground">{lead.form_type ?? "unknown"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(subDate, "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isConverted(lead) && (
                      <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Converted
                      </Badge>
                    )}
                    {isToday(subDate) && (
                      <Badge className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
                        Today
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
            {allLeads.length === 0 && (
              <p className="text-center text-muted-foreground py-6">No submissions yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
