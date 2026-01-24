import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BarChart3 } from "lucide-react";
import { format, subDays, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval, subWeeks, eachWeekOfInterval, startOfWeek, endOfWeek } from "date-fns";

interface AnalyticsData {
  period: string;
  views: number;
  submissions: number;
}

type ViewMode = "daily" | "weekly";

interface FormAnalyticsChartProps {
  formId: string;
}

export function FormAnalyticsChart({ formId }: FormAnalyticsChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ views: 0, submissions: 0, conversionRate: 0 });

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        let intervals: { start: Date; end: Date; label: string }[] = [];

        if (viewMode === "daily") {
          // Last 14 days
          const days = eachDayOfInterval({
            start: subDays(now, 13),
            end: now,
          });
          intervals = days.map((day) => ({
            start: startOfDay(day),
            end: endOfDay(day),
            label: format(day, "MMM dd"),
          }));
        } else {
          // Last 8 weeks
          const weeks = eachWeekOfInterval(
            { start: subWeeks(now, 7), end: now },
            { weekStartsOn: 1 }
          );
          intervals = weeks.map((weekStart) => ({
            start: startOfWeek(weekStart, { weekStartsOn: 1 }),
            end: endOfWeek(weekStart, { weekStartsOn: 1 }),
            label: format(weekStart, "MMM dd"),
          }));
        }

        // Fetch views and submissions for this form
        const [viewsRes, submissionsRes] = await Promise.all([
          supabase
            .from("form_views")
            .select("id, viewed_at")
            .eq("form_id", formId),
          supabase
            .from("form_submissions")
            .select("id, submitted_at")
            .eq("form_id", formId),
        ]);

        const views = viewsRes.data || [];
        const submissions = submissionsRes.data || [];

        // Set totals
        const totalViews = views.length;
        const totalSubmissions = submissions.length;
        const conversionRate = totalViews > 0 ? (totalSubmissions / totalViews) * 100 : 0;
        setTotals({ views: totalViews, submissions: totalSubmissions, conversionRate });

        // Aggregate data by interval
        const analyticsData: AnalyticsData[] = intervals.map((interval) => {
          const viewsInPeriod = views.filter((v) =>
            isWithinInterval(new Date(v.viewed_at), { start: interval.start, end: interval.end })
          );
          const submissionsInPeriod = submissions.filter((s) =>
            isWithinInterval(new Date(s.submitted_at), { start: interval.start, end: interval.end })
          );

          return {
            period: interval.label,
            views: viewsInPeriod.length,
            submissions: submissionsInPeriod.length,
          };
        });

        setData(analyticsData);
      } catch (error) {
        console.error("Error fetching analytics data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticsData();
  }, [formId, viewMode]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Form Analytics</CardTitle>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="daily" className="text-xs px-3">
                Daily
              </TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs px-3">
                Weekly
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-primary">{totals.views}</p>
            <p className="text-xs text-muted-foreground">Total Views</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{totals.submissions}</p>
            <p className="text-xs text-muted-foreground">Submissions</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{totals.conversionRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Conversion Rate</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-[250px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : data.every(d => d.views === 0 && d.submissions === 0) ? (
          <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
            <BarChart3 className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm">No analytics data yet</p>
            <p className="text-xs">Views and submissions will appear here</p>
          </div>
        ) : (
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSubmissions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: "12px" }}
                  iconType="square"
                  iconSize={10}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  name="Views"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorViews)"
                />
                <Area
                  type="monotone"
                  dataKey="submissions"
                  name="Submissions"
                  stroke="hsl(142, 71%, 45%)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSubmissions)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span>Page Views</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(142, 71%, 45%)" }} />
            <span>Form Submissions</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
