import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Users, FileText, CheckCircle, Clock, AlertTriangle, Calendar } from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, subMonths, endOfMonth } from "date-fns";

interface FormLead {
  id: string;
  form_name: string;
  customer_name: string;
  status: string;
  assigned_to_name: string | null;
  created_at: string;
  city: string | null;
  product_name: string | null;
}

interface FormsLeadsAnalyticsProps {
  leads: FormLead[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 55%)",
  "hsl(200 70% 50%)",
  "hsl(350 65% 55%)",
  "hsl(170 60% 40%)",
  "hsl(30 80% 55%)",
];

const STATUS_COLORS: Record<string, string> = {
  new: "hsl(217 91% 60%)",
  contacted: "hsl(38 92% 50%)",
  qualified: "hsl(142 76% 36%)",
  converted: "hsl(280 65% 55%)",
  closed: "hsl(var(--muted-foreground))",
};

export function FormsLeadsAnalytics({ leads }: FormsLeadsAnalyticsProps) {
  const [timePeriod, setTimePeriod] = useState<string>("all");

  const filteredLeads = useMemo(() => {
    if (timePeriod === "all") return leads;
    const now = new Date();
    let start: Date;
    switch (timePeriod) {
      case "today": start = startOfDay(now); break;
      case "this_week": start = startOfWeek(now, { weekStartsOn: 1 }); break;
      case "this_month": start = startOfMonth(now); break;
      case "prev_month": {
        const prev = subMonths(now, 1);
        const pStart = startOfMonth(prev);
        const pEnd = endOfMonth(prev);
        return leads.filter(l => { const d = new Date(l.created_at); return d >= pStart && d <= pEnd; });
      }
      default: start = new Date(0);
    }
    return leads.filter(l => new Date(l.created_at) >= start);
  }, [leads, timePeriod]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const byStatus: Record<string, number> = {};
    const byForm: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const byCity: Record<string, number> = {};

    filteredLeads.forEach((l) => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      byForm[l.form_name] = (byForm[l.form_name] || 0) + 1;
      const assignee = l.assigned_to_name || "Unassigned";
      byAssignee[assignee] = (byAssignee[assignee] || 0) + 1;
      const month = l.created_at.slice(0, 7);
      byMonth[month] = (byMonth[month] || 0) + 1;
      if (l.city) byCity[l.city] = (byCity[l.city] || 0) + 1;
    });

    const statusData = Object.entries(byStatus).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: STATUS_COLORS[name] || COLORS[0],
    }));

    const formData = Object.entries(byForm)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 18) + "…" : name, count }));

    const assigneeData = Object.entries(byAssignee)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const trendData = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, count]) => ({ month: month.slice(5), count }));

    const topCities = Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const newCount = byStatus["new"] || 0;
    const contactedCount = byStatus["contacted"] || 0;
    const qualifiedCount = byStatus["qualified"] || 0;
    const convertedCount = byStatus["converted"] || 0;
    const conversionRate = total > 0 ? ((convertedCount / total) * 100).toFixed(1) : "0";

    return { total, statusData, formData, assigneeData, trendData, topCities, newCount, contactedCount, qualifiedCount, convertedCount, conversionRate };
  }, [filteredLeads]);

  const chartConfig = {
    count: { label: "Leads", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-4">
      {/* Timeline Filter */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <Select value={timePeriod} onValueChange={setTimePeriod}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="prev_month">Previous Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Leads", value: stats.total, icon: FileText, color: "text-primary" },
          { label: "New", value: stats.newCount, icon: Clock, color: "text-blue-500" },
          { label: "Contacted", value: stats.contactedCount, icon: Users, color: "text-amber-500" },
          { label: "Qualified", value: stats.qualifiedCount, icon: CheckCircle, color: "text-green-500" },
          { label: "Converted", value: stats.convertedCount, icon: TrendingUp, color: "text-purple-500" },
          { label: "Conversion %", value: `${stats.conversionRate}%`, icon: AlertTriangle, color: "text-orange-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`w-5 h-5 mx-auto mb-1 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lead Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {stats.statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        {stats.trendData.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Monthly Lead Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px]">
                <BarChart data={stats.trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* By Form Source */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leads by Form Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.formData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                  <ChartTooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* By Assignee */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leads by Assignee</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.assigneeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} fontSize={11} />
                  <ChartTooltip />
                  <Bar dataKey="count" fill="hsl(142 76% 36%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Cities */}
      {stats.topCities.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Cities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.topCities.map(([city, count]) => (
                <Badge key={city} variant="outline" className="text-sm px-3 py-1">
                  {city}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
