import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormSubmissions, Form } from "@/hooks/useForms";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from "recharts";
import { format, subDays, startOfDay, eachDayOfInterval, isWithinInterval, subWeeks, startOfWeek, eachWeekOfInterval } from "date-fns";
import { Eye, Inbox, TrendingUp, FileText, Target, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FormsOverallAnalyticsProps {
  forms: Form[];
}

const COLORS = ["#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5"];

export function FormsOverallAnalytics({ forms }: FormsOverallAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<"daily" | "weekly">("daily");
  
  // Fetch all views
  const { data: allViews = [] } = useQuery({
    queryKey: ["all-form-views"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_views")
        .select("*")
        .order("viewed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all submissions
  const { data: allSubmissions = [] } = useQuery({
    queryKey: ["all-form-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate stats
  const stats = useMemo(() => {
    const totalForms = forms.length;
    const activeForms = forms.filter(f => f.is_active).length;
    const totalViews = allViews.length;
    const totalSubmissions = allSubmissions.length;
    const conversionRate = totalViews > 0 ? ((totalSubmissions / totalViews) * 100).toFixed(1) : "0";
    const totalFields = forms.reduce((acc, f) => acc + (f.form_fields?.length || 0), 0);

    return { totalForms, activeForms, totalViews, totalSubmissions, conversionRate, totalFields };
  }, [forms, allViews, allSubmissions]);

  // Time series data
  const timeSeriesData = useMemo(() => {
    if (timeRange === "daily") {
      const days = eachDayOfInterval({
        start: subDays(new Date(), 13),
        end: new Date(),
      });

      return days.map((day) => {
        const dayStart = startOfDay(day);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const views = allViews.filter((v) =>
          isWithinInterval(new Date(v.viewed_at), { start: dayStart, end: dayEnd })
        ).length;

        const submissions = allSubmissions.filter((s) =>
          isWithinInterval(new Date(s.submitted_at), { start: dayStart, end: dayEnd })
        ).length;

        return {
          date: format(day, "MMM d"),
          views,
          submissions,
        };
      });
    } else {
      const weeks = eachWeekOfInterval({
        start: subWeeks(new Date(), 7),
        end: new Date(),
      });

      return weeks.map((weekStart, index) => {
        const weekEnd = weeks[index + 1] || new Date();

        const views = allViews.filter((v) =>
          isWithinInterval(new Date(v.viewed_at), { start: weekStart, end: weekEnd })
        ).length;

        const submissions = allSubmissions.filter((s) =>
          isWithinInterval(new Date(s.submitted_at), { start: weekStart, end: weekEnd })
        ).length;

        return {
          date: `Week ${format(weekStart, "MMM d")}`,
          views,
          submissions,
        };
      });
    }
  }, [allViews, allSubmissions, timeRange]);

  // Form performance data (for bar chart)
  const formPerformanceData = useMemo(() => {
    return forms
      .map((form) => ({
        name: form.name.length > 15 ? form.name.substring(0, 15) + "..." : form.name,
        fullName: form.name,
        views: form.view_count || 0,
        submissions: form.submission_count || 0,
      }))
      .sort((a, b) => b.submissions - a.submissions)
      .slice(0, 6);
  }, [forms]);

  // Pie chart data for form distribution
  const pieData = useMemo(() => {
    return forms
      .filter(f => (f.submission_count || 0) > 0)
      .map((form) => ({
        name: form.name.length > 20 ? form.name.substring(0, 20) + "..." : form.name,
        value: form.submission_count || 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [forms]);

  if (forms.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No analytics yet</h3>
          <p className="text-muted-foreground">Create forms to see analytics data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalForms}</p>
                <p className="text-xs text-muted-foreground">Total Forms</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeForms}</p>
                <p className="text-xs text-muted-foreground">Active Forms</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalViews}</p>
                <p className="text-xs text-muted-foreground">Total Views</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Inbox className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalSubmissions}</p>
                <p className="text-xs text-muted-foreground">Total Submissions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.conversionRate}%</p>
                <p className="text-xs text-muted-foreground">Conversion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalFields}</p>
                <p className="text-xs text-muted-foreground">Total Fields</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Views & Submissions Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Views & Submissions Over Time</CardTitle>
              <div className="flex gap-1">
                <Badge
                  variant={timeRange === "daily" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setTimeRange("daily")}
                >
                  Daily
                </Badge>
                <Badge
                  variant={timeRange === "weekly" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setTimeRange("weekly")}
                >
                  Weekly
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSubmissions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorViews)"
                    name="Views"
                  />
                  <Area
                    type="monotone"
                    dataKey="submissions"
                    stroke="#ea580c"
                    fillOpacity={1}
                    fill="url(#colorSubmissions)"
                    name="Submissions"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Form Performance Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Performing Forms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {formPerformanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={formPerformanceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value, name) => [value, name === "submissions" ? "Submissions" : "Views"]}
                    />
                    <Bar dataKey="views" fill="#3b82f6" name="Views" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="submissions" fill="#ea580c" name="Submissions" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No form data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Submission Distribution Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Submission Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value) => [`${value} submissions`]}
                    />
                    <Legend 
                      layout="vertical" 
                      align="right" 
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No submissions yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {allSubmissions.slice(0, 10).map((submission) => {
              const form = forms.find(f => f.id === submission.form_id);
              return (
                <div 
                  key={submission.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Inbox className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{form?.name || "Unknown Form"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(submission.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {Object.keys(submission.submission_data as object).length} fields
                  </Badge>
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
