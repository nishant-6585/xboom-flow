import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/hooks/useForms";
import { useLeadsFormAnalytics, LeadRow } from "@/hooks/useLeadsFormAnalytics";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  format, subDays, startOfDay, eachDayOfInterval, isWithinInterval,
  subWeeks, eachWeekOfInterval,
} from "date-fns";
import {
  Inbox, TrendingUp, FileText, Target, BarChart3, Filter, Phone, CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface FormsOverallAnalyticsProps {
  forms: Form[];
}

const COLORS = ["#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5"];
const CONTACTED = new Set(["contacted", "qualified", "converted"]);
const isConverted = (l: LeadRow) => !!l.is_enquiry_converted || l.status === "converted";

export function FormsOverallAnalytics({ forms }: FormsOverallAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<"daily" | "weekly">("daily");
  const [selectedType, setSelectedType] = useState<string>("all");

  const { data: allLeads = [] } = useLeadsFormAnalytics(90);

  const formTypes = useMemo(() => {
    const counts = new Map<string, number>();
    allLeads.forEach((l) => {
      const k = l.form_type ?? "unknown";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [allLeads]);

  const filteredLeads = useMemo(() => {
    if (selectedType === "all") return allLeads;
    return allLeads.filter((l) => (l.form_type ?? "unknown") === selectedType);
  }, [allLeads, selectedType]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const contacted = filteredLeads.filter((l) => l.status && CONTACTED.has(l.status)).length;
    const converted = filteredLeads.filter(isConverted).length;
    const contactRate = total ? ((contacted / total) * 100).toFixed(1) : "0";
    const convRate = total ? ((converted / total) * 100).toFixed(1) : "0";
    return {
      totalForms: forms.length,
      activeForms: forms.filter((f) => f.is_active).length,
      totalSubmissions: total,
      contacted,
      converted,
      contactRate,
      convRate,
      activeTypes: formTypes.length,
    };
  }, [filteredLeads, forms, formTypes]);

  const timeSeriesData = useMemo(() => {
    if (timeRange === "daily") {
      const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() });
      return days.map((day) => {
        const dayStart = startOfDay(day);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const inDay = filteredLeads.filter((l) =>
          isWithinInterval(new Date(l.created_at), { start: dayStart, end: dayEnd })
        );
        return {
          date: format(day, "MMM d"),
          submissions: inDay.length,
          converted: inDay.filter(isConverted).length,
        };
      });
    }
    const weeks = eachWeekOfInterval({ start: subWeeks(new Date(), 7), end: new Date() });
    return weeks.map((weekStart, i) => {
      const weekEnd = weeks[i + 1] || new Date();
      const inWeek = filteredLeads.filter((l) =>
        isWithinInterval(new Date(l.created_at), { start: weekStart, end: weekEnd })
      );
      return {
        date: `Week ${format(weekStart, "MMM d")}`,
        submissions: inWeek.length,
        converted: inWeek.filter(isConverted).length,
      };
    });
  }, [filteredLeads, timeRange]);

  const formPerformanceData = useMemo(() => {
    const map = new Map<string, { submissions: number; converted: number }>();
    filteredLeads.forEach((l) => {
      const k = l.form_type ?? "unknown";
      const b = map.get(k) ?? { submissions: 0, converted: 0 };
      b.submissions += 1;
      if (isConverted(l)) b.converted += 1;
      map.set(k, b);
    });
    return Array.from(map.entries())
      .map(([type, v]) => ({
        name: type.length > 18 ? type.slice(0, 18) + "…" : type,
        fullName: type,
        submissions: v.submissions,
        converted: v.converted,
      }))
      .sort((a, b) => b.submissions - a.submissions)
      .slice(0, 8);
  }, [filteredLeads]);

  const pieData = useMemo(() => {
    return formPerformanceData
      .filter((d) => d.submissions > 0)
      .slice(0, 6)
      .map((d) => ({ name: d.name, value: d.submissions }));
  }, [formPerformanceData]);

  if (allLeads.length === 0 && forms.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No analytics yet</h3>
          <p className="text-muted-foreground">Website form submissions will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  const selectedLabel = selectedType === "all" ? "All Form Types" : selectedType;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-4 rounded-lg border">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filter by Form Type:</span>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select a form type…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>All Form Types ({formTypes.length})</span>
                </div>
              </SelectItem>
              <div className="h-px bg-border my-1" />
              {formTypes.map(({ type, count }) => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center justify-between w-full gap-4">
                    <span className="truncate max-w-[200px]">{type}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{count}</Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedType !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedType("all")}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalForms}</p>
              <p className="text-xs text-muted-foreground">Total Forms</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeForms}</p>
              <p className="text-xs text-muted-foreground">Active Forms</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalSubmissions}</p>
              <p className="text-xs text-muted-foreground">Submissions</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.contactRate}%</p>
              <p className="text-xs text-muted-foreground">Contact Rate</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.convRate}%</p>
              <p className="text-xs text-muted-foreground">Enquiry Conv.</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeTypes}</p>
              <p className="text-xs text-muted-foreground">Form Types</p>
            </div>
          </div>
        </CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Submissions & Conversions Over Time
                {selectedType !== "all" && <span className="text-muted-foreground font-normal"> — {selectedLabel}</span>}
              </CardTitle>
              <div className="flex gap-1">
                <Badge variant={timeRange === "daily" ? "default" : "outline"} className="cursor-pointer" onClick={() => setTimeRange("daily")}>Daily</Badge>
                <Badge variant={timeRange === "weekly" ? "default" : "outline"} className="cursor-pointer" onClick={() => setTimeRange("weekly")}>Weekly</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Area type="monotone" dataKey="submissions" stroke="#ea580c" fillOpacity={1} fill="url(#colorSubs)" name="Submissions" />
                  <Area type="monotone" dataKey="converted" stroke="#10b981" fillOpacity={1} fill="url(#colorConv)" name="Converted" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Form Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {formPerformanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={formPerformanceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="submissions" fill="#ea580c" name="Submissions" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="converted" fill="#10b981" name="Converted" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Submission Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value"
                         label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value) => [`${value} submissions`]} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No submissions yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Recent Submissions
            {selectedType !== "all" && <span className="text-muted-foreground font-normal"> — {selectedLabel}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[320px] overflow-y-auto">
            {filteredLeads.slice(0, 15).map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Inbox className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {lead.name || lead.email || lead.phone || "Anonymous"}
                      <span className="ml-2 text-xs text-muted-foreground">{lead.form_type ?? "unknown"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(lead.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConverted(lead) && (
                    <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Converted
                    </Badge>
                  )}
                  {lead.status && (
                    <Badge variant="secondary" className="text-[10px] capitalize">{lead.status}</Badge>
                  )}
                </div>
              </div>
            ))}
            {filteredLeads.length === 0 && (
              <p className="text-center text-muted-foreground py-6">No submissions yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
