import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Enquiry, PRODUCT_CATEGORIES } from "@/hooks/useEnquiries";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, subMonths, startOfDay } from "date-fns";
import { BarChart3, Calendar, Package, TrendingUp } from "lucide-react";

interface EnquiryAnalyticsProps {
  enquiries: Enquiry[];
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(142, 76%, 36%)",
  "hsl(280, 65%, 60%)",
  "hsl(30, 80%, 55%)",
];

export function EnquiryAnalytics({ enquiries }: EnquiryAnalyticsProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>("current");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Get available months from enquiries
  const availableMonths = useMemo(() => {
    const months: { value: string; label: string; start: Date; end: Date }[] = [];
    const now = new Date();
    
    // Current month
    months.push({
      value: "current",
      label: format(now, "MMMM yyyy"),
      start: startOfMonth(now),
      end: endOfMonth(now),
    });
    
    // Previous 5 months
    for (let i = 1; i <= 5; i++) {
      const monthDate = subMonths(now, i);
      months.push({
        value: format(monthDate, "yyyy-MM"),
        label: format(monthDate, "MMMM yyyy"),
        start: startOfMonth(monthDate),
        end: endOfMonth(monthDate),
      });
    }
    
    return months;
  }, []);

  // Filter enquiries by selected category
  const filteredEnquiries = useMemo(() => {
    if (selectedCategory === "all") return enquiries;
    return enquiries.filter((e) => e.product_category === selectedCategory);
  }, [enquiries, selectedCategory]);

  // Get current month data
  const currentMonthData = useMemo(() => {
    const selectedMonthInfo = availableMonths.find((m) => m.value === selectedMonth);
    if (!selectedMonthInfo) return { enquiries: [], days: [] };

    const monthEnquiries = filteredEnquiries.filter((e) =>
      isWithinInterval(new Date(e.created_at), {
        start: selectedMonthInfo.start,
        end: selectedMonthInfo.end,
      })
    );

    const days = eachDayOfInterval({
      start: selectedMonthInfo.start,
      end: selectedMonthInfo.end,
    });

    return { enquiries: monthEnquiries, days };
  }, [filteredEnquiries, selectedMonth, availableMonths]);

  // Daily chart data
  const dailyChartData = useMemo(() => {
    const today = startOfDay(new Date());
    
    return currentMonthData.days
      .filter((day) => day <= today)
      .map((day) => {
        const dayStart = startOfDay(day);
        const count = currentMonthData.enquiries.filter((e) => {
          const enquiryDate = startOfDay(new Date(e.created_at));
          return enquiryDate.getTime() === dayStart.getTime();
        }).length;

        return {
          date: format(day, "dd"),
          fullDate: format(day, "MMM dd"),
          count,
        };
      });
  }, [currentMonthData]);

  // Category breakdown data
  const categoryData = useMemo(() => {
    const selectedMonthInfo = availableMonths.find((m) => m.value === selectedMonth);
    if (!selectedMonthInfo) return [];

    const monthEnquiries = enquiries.filter((e) =>
      isWithinInterval(new Date(e.created_at), {
        start: selectedMonthInfo.start,
        end: selectedMonthInfo.end,
      })
    );

    const categoryCount: Record<string, number> = {};
    monthEnquiries.forEach((e) => {
      const cat = e.product_category || "Uncategorized";
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    return Object.entries(categoryCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [enquiries, selectedMonth, availableMonths]);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const mtdStart = startOfMonth(now);
    const mtdEnd = now;

    const mtdEnquiries = filteredEnquiries.filter((e) =>
      isWithinInterval(new Date(e.created_at), { start: mtdStart, end: mtdEnd })
    );

    const todayStart = startOfDay(now);
    const todayEnquiries = filteredEnquiries.filter((e) => {
      const enquiryDate = startOfDay(new Date(e.created_at));
      return enquiryDate.getTime() === todayStart.getTime();
    });

    // Previous month for comparison
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));
    const prevMonthEnquiries = filteredEnquiries.filter((e) =>
      isWithinInterval(new Date(e.created_at), { start: prevMonthStart, end: prevMonthEnd })
    );

    return {
      today: todayEnquiries.length,
      mtd: mtdEnquiries.length,
      previousMonth: prevMonthEnquiries.length,
      selectedMonth: currentMonthData.enquiries.length,
    };
  }, [filteredEnquiries, currentMonthData]);

  // Get unique categories from enquiries
  const usedCategories = useMemo(() => {
    const cats = new Set(enquiries.map((e) => e.product_category).filter(Boolean));
    return Array.from(cats).sort();
  }, [enquiries]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {usedCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCategory !== "all" && (
          <Badge variant="secondary" className="h-9 px-3 flex items-center gap-1">
            {selectedCategory}
            <button
              onClick={() => setSelectedCategory("all")}
              className="ml-1 hover:text-destructive"
            >
              ×
            </button>
          </Badge>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.today}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-chart-2/10">
                <BarChart3 className="w-5 h-5 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.mtd}</p>
                <p className="text-xs text-muted-foreground">Month to Date</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-chart-3/10">
                <Calendar className="w-5 h-5 text-chart-3" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.selectedMonth}</p>
                <p className="text-xs text-muted-foreground">
                  {availableMonths.find((m) => m.value === selectedMonth)?.label || "Selected Month"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <Calendar className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.previousMonth}</p>
                <p className="text-xs text-muted-foreground">Previous Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Chart */}
        <Card className="glass lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Daily Enquiries</CardTitle>
            <CardDescription>
              {availableMonths.find((m) => m.value === selectedMonth)?.label}
              {selectedCategory !== "all" && ` - ${selectedCategory}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {dailyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                              <p className="font-medium">{payload[0].payload.fullDate}</p>
                              <p className="text-sm text-muted-foreground">
                                {payload[0].value} enquiries
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">By Category</CardTitle>
            <CardDescription>Top categories this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={CHART_COLORS[index % CHART_COLORS.length]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                              <p className="font-medium">{payload[0].name}</p>
                              <p className="text-sm text-muted-foreground">
                                {payload[0].value} enquiries
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend 
                      layout="vertical" 
                      align="right" 
                      verticalAlign="middle"
                      formatter={(value) => (
                        <span className="text-xs text-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Table */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-lg">Category Breakdown</CardTitle>
          <CardDescription>
            Enquiries by product category for {availableMonths.find((m) => m.value === selectedMonth)?.label}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryData.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categoryData.map((cat, index) => (
                <div
                  key={cat.name}
                  className="p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    <span className="text-sm font-medium truncate">{cat.name}</span>
                  </div>
                  <p className="text-2xl font-bold">{cat.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No enquiries for this period
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
