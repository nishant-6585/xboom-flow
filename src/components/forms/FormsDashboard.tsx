import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/hooks/useForms";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, RadialBarChart, RadialBar, Legend, ComposedChart, Line
} from "recharts";
import {
  format, subDays, startOfDay, eachDayOfInterval, isWithinInterval,
  isToday, isYesterday, startOfWeek, endOfWeek, differenceInDays,
  eachHourOfInterval, startOfHour, subHours
} from "date-fns";
import {
  Eye, Inbox, TrendingUp, FileText, Target, Activity, Clock,
  Zap, ArrowUpRight, ArrowDownRight, Minus, CalendarDays, Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormsDashboardProps {
  forms: Form[];
}

const FORM_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function FormsDashboard({ forms }: FormsDashboardProps) {
  const [dashTimeRange, setDashTimeRange] = useState<"7d" | "14d" | "30d">("7d");

  const rangeDays = dashTimeRange === "7d" ? 7 : dashTimeRange === "14d" ? 14 : 30;

  // Fetch all views
  const { data: allViews = [] } = useQuery({
    queryKey: ["dashboard-form-views"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_views")
        .select("*")
        .gte("viewed_at", subDays(new Date(), 30).toISOString())
        .order("viewed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all submissions (last 30 days)
  const { data: allSubmissions = [] } = useQuery({
    queryKey: ["dashboard-form-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .gte("submitted_at", subDays(new Date(), 30).toISOString())
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // ===== KPI Cards with Trends =====
  const kpis = useMemo(() => {
    const now = new Date();
    const rangeStart = subDays(now, rangeDays);
    const prevRangeStart = subDays(rangeStart, rangeDays);

    const currentViews = allViews.filter(v =>
      new Date(v.viewed_at) >= rangeStart
    );
    const prevViews = allViews.filter(v =>
      new Date(v.viewed_at) >= prevRangeStart && new Date(v.viewed_at) < rangeStart
    );

    const currentSubs = allSubmissions.filter(s =>
      new Date(s.submitted_at) >= rangeStart
    );
    const prevSubs = allSubmissions.filter(s =>
      new Date(s.submitted_at) >= prevRangeStart && new Date(s.submitted_at) < rangeStart
    );

    const todaySubs = allSubmissions.filter(s => isToday(new Date(s.submitted_at)));
    const yesterdaySubs = allSubmissions.filter(s => isYesterday(new Date(s.submitted_at)));

    const currentConversion = currentViews.length > 0
      ? (currentSubs.length / currentViews.length) * 100
      : 0;
    const prevConversion = prevViews.length > 0
      ? (prevSubs.length / prevViews.length) * 100
      : 0;

    const calcTrend = (current: number, prev: number) => {
      if (prev === 0 && current === 0) return 0;
      if (prev === 0) return 100;
      return ((current - prev) / prev) * 100;
    };

    return {
      totalForms: forms.length,
      activeForms: forms.filter(f => f.is_active).length,
      views: currentViews.length,
      viewsTrend: calcTrend(currentViews.length, prevViews.length),
      submissions: currentSubs.length,
      submissionsTrend: calcTrend(currentSubs.length, prevSubs.length),
      todaySubs: todaySubs.length,
      yesterdaySubs: yesterdaySubs.length,
      conversion: currentConversion,
      conversionTrend: currentConversion - prevConversion,
      avgSubsPerDay: Math.round((currentSubs.length / rangeDays) * 10) / 10,
    };
  }, [forms, allViews, allSubmissions, rangeDays]);

  // ===== Daily Trend Data =====
  const dailyTrend = useMemo(() => {
    const days = eachDayOfInterval({
      start: subDays(new Date(), rangeDays - 1),
      end: new Date(),
    });

    return days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      return {
        date: format(day, rangeDays <= 14 ? "MMM d" : "d"),
        views: allViews.filter(v =>
          isWithinInterval(new Date(v.viewed_at), { start: dayStart, end: dayEnd })
        ).length,
        submissions: allSubmissions.filter(s =>
          isWithinInterval(new Date(s.submitted_at), { start: dayStart, end: dayEnd })
        ).length,
      };
    });
  }, [allViews, allSubmissions, rangeDays]);

  // ===== Hourly Heatmap (last 24h) =====
  const hourlyData = useMemo(() => {
    const now = new Date();
    const hours = eachHourOfInterval({
      start: subHours(now, 23),
      end: startOfHour(now),
    });

    return hours.map((hour) => {
      const hourEnd = new Date(hour);
      hourEnd.setHours(hourEnd.getHours() + 1);

      return {
        hour: format(hour, "ha"),
        submissions: allSubmissions.filter(s =>
          isWithinInterval(new Date(s.submitted_at), { start: hour, end: hourEnd })
        ).length,
        views: allViews.filter(v =>
          isWithinInterval(new Date(v.viewed_at), { start: hour, end: hourEnd })
        ).length,
      };
    });
  }, [allViews, allSubmissions]);

  // ===== Form Leaderboard =====
  const leaderboard = useMemo(() => {
    const maxSubs = Math.max(...forms.map(f => f.submission_count || 0), 1);
    return forms
      .map(f => ({
        id: f.id,
        name: f.name,
        submissions: f.submission_count || 0,
        views: f.view_count || 0,
        fields: f.form_fields?.length || 0,
        isActive: f.is_active,
        conversion: (f.view_count || 0) > 0
          ? (((f.submission_count || 0) / (f.view_count || 0)) * 100).toFixed(1)
          : "0",
        progress: ((f.submission_count || 0) / maxSubs) * 100,
        recentSubs: allSubmissions.filter(s => s.form_id === f.id).length,
      }))
      .sort((a, b) => b.submissions - a.submissions);
  }, [forms, allSubmissions]);

  // ===== Conversion Funnel =====
  const funnelData = useMemo(() => {
    const totalViews = allViews.length;
    const totalSubs = allSubmissions.length;
    const uniqueForms = new Set(allSubmissions.map(s => s.form_id)).size;

    return [
      { name: "Form Views", value: totalViews, fill: "hsl(var(--chart-1))" },
      { name: "Submissions", value: totalSubs, fill: "hsl(var(--chart-2))" },
      { name: "Active Forms", value: uniqueForms, fill: "hsl(var(--chart-3))" },
    ];
  }, [allViews, allSubmissions]);

  // ===== Submission Source (by form) radial chart =====
  const radialData = useMemo(() => {
    return forms
      .filter(f => (f.submission_count || 0) > 0)
      .slice(0, 5)
      .map((f, i) => ({
        name: f.name.length > 18 ? f.name.substring(0, 18) + "…" : f.name,
        value: f.submission_count || 0,
        fill: FORM_COLORS[i % FORM_COLORS.length],
      }));
  }, [forms]);

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

  if (forms.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No dashboard data yet</h3>
          <p className="text-muted-foreground">Create forms to see your dashboard</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Dashboard Overview</span>
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

      {/* Hero KPI Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Today's Submissions */}
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</span>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold">{kpis.todaySubs}</p>
            <p className="text-xs text-muted-foreground mt-1">
              vs {kpis.yesterdaySubs} yesterday
            </p>
            <div className="absolute -bottom-2 -right-2 h-16 w-16 bg-primary/5 rounded-full" />
          </CardContent>
        </Card>

        {/* Total Views */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Views</span>
              <div className="h-8 w-8 rounded-full bg-chart-1/10 flex items-center justify-center">
                <Eye className="h-4 w-4 text-chart-1" />
              </div>
            </div>
            <p className="text-3xl font-bold">{kpis.views}</p>
            <TrendBadge value={kpis.viewsTrend} />
          </CardContent>
        </Card>

        {/* Total Submissions */}
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

        {/* Conversion Rate */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Conversion</span>
              <div className="h-8 w-8 rounded-full bg-chart-3/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-chart-3" />
              </div>
            </div>
            <p className="text-3xl font-bold">{kpis.conversion.toFixed(1)}%</p>
            <TrendBadge value={kpis.conversionTrend} suffix="pp" />
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
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
              <p className="text-lg font-bold">
                {new Set(allSubmissions.map(s => s.form_id)).size}
              </p>
              <p className="text-xs text-muted-foreground">Forms with Subs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily Trend – takes 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Submission & View Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend}>
                  <defs>
                    <linearGradient id="dashViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
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
                  <Area
                    type="monotone"
                    dataKey="views"
                    fill="url(#dashViews)"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    name="Views"
                  />
                  <Bar
                    dataKey="submissions"
                    fill="hsl(var(--primary))"
                    name="Submissions"
                    radius={[4, 4, 0, 0]}
                    barSize={rangeDays <= 14 ? 20 : 12}
                    opacity={0.85}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-chart-3" />
              Conversion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5 py-4">
              {funnelData.map((item, i) => {
                const maxVal = Math.max(...funnelData.map(d => d.value), 1);
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
                        style={{
                          width: `${Math.max(pct, 5)}%`,
                          backgroundColor: item.fill,
                        }}
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

      {/* Hourly Activity Heatmap */}
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
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10 }}
                  interval={window.innerWidth < 768 ? 3 : 1}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="views" fill="hsl(var(--chart-1))" name="Views" radius={[2, 2, 0, 0]} opacity={0.5} stackId="a" />
                <Bar dataKey="submissions" fill="hsl(var(--primary))" name="Submissions" radius={[2, 2, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Form Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-green-500" />
            Form Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {leaderboard.map((form, i) => (
              <div key={form.id} className="space-y-2">
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
                      <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-none">{form.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{form.fields} fields</span>
                        <span>•</span>
                        <span>{form.conversion}% conv.</span>
                        <span>•</span>
                        <Badge variant={form.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {form.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {form.views}
                      </span>
                      <span className="font-bold flex items-center gap-1">
                        <Inbox className="h-3 w-3" /> {form.submissions}
                      </span>
                    </div>
                    {form.recentSubs > 0 && (
                      <p className="text-xs text-green-600">+{form.recentSubs} in {rangeDays}d</p>
                    )}
                  </div>
                </div>
                <Progress value={form.progress} className="h-2" />
              </div>
            ))}
            {leaderboard.length === 0 && (
              <p className="text-center text-muted-foreground py-6">No forms to show</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-chart-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[350px] overflow-y-auto">
            {allSubmissions.slice(0, 15).map((submission) => {
              const form = forms.find(f => f.id === submission.form_id);
              const subDate = new Date(submission.submitted_at);
              const timeAgo = differenceInDays(new Date(), subDate);

              return (
                <div
                  key={submission.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
                      isToday(subDate) ? "bg-green-500/10" : "bg-primary/10"
                    }`}>
                      <Inbox className={`h-4 w-4 ${isToday(subDate) ? "text-green-500" : "text-primary"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{form?.name || "Unknown Form"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(subDate, "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {Object.keys(submission.submission_data as object).length} fields
                    </Badge>
                    {isToday(subDate) && (
                      <Badge className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
                        Today
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
            {allSubmissions.length === 0 && (
              <p className="text-center text-muted-foreground py-6">No submissions yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
