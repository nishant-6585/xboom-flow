import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Enquiry, PRODUCT_CATEGORIES, QueryStatus } from "@/hooks/useEnquiries";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, FunnelChart, Funnel, LabelList } from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, subMonths, startOfDay, subDays, startOfWeek, endOfWeek } from "date-fns";
import { BarChart3, Calendar, Package, TrendingUp, Download, FileSpreadsheet, FileText, Filter, IndianRupee } from "lucide-react";
import { exportToExcel, exportToPDF, exportCategorySummaryToExcel, exportCategorySummaryToPDF } from "@/lib/exportUtils";

export type ValueFilterType = "all" | "mtd" | "wtd" | "today" | "specific_day";

interface EnquiryAnalyticsProps {
  enquiries: Enquiry[];
  onValueFilterClick?: (filterType: ValueFilterType, specificDate?: Date) => void;
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

export function EnquiryAnalytics({ enquiries, onValueFilterClick }: EnquiryAnalyticsProps) {
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

  // Helper function to parse pricing value from string (handles formats like "₹1,50,000" or "1,50,000" or "150000")
  const parsePriceValue = (pricing: string | null): number => {
    if (!pricing) return 0;
    // Remove currency symbols, spaces and commas, then parse
    const cleanedValue = pricing.replace(/[₹$€£\s,]/g, '');
    const numValue = parseFloat(cleanedValue);
    return isNaN(numValue) ? 0 : numValue;
  };

  // Value-based stats (MTD, WTD, and daily value chart)
  const valueStats = useMemo(() => {
    const now = new Date();
    
    // Month to Date value
    const mtdStart = startOfMonth(now);
    const mtdEnquiries = filteredEnquiries.filter((e) =>
      isWithinInterval(new Date(e.created_at), { start: mtdStart, end: now })
    );
    const mtdValue = mtdEnquiries.reduce((sum, e) => sum + parsePriceValue(e.response_pricing), 0);

    // Week to Date value
    const wtdStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday as start
    const wtdEnquiries = filteredEnquiries.filter((e) =>
      isWithinInterval(new Date(e.created_at), { start: wtdStart, end: now })
    );
    const wtdValue = wtdEnquiries.reduce((sum, e) => sum + parsePriceValue(e.response_pricing), 0);

    // Today's value
    const todayStart = startOfDay(now);
    const todayEnquiries = filteredEnquiries.filter((e) => {
      const enquiryDate = startOfDay(new Date(e.created_at));
      return enquiryDate.getTime() === todayStart.getTime();
    });
    const todayValue = todayEnquiries.reduce((sum, e) => sum + parsePriceValue(e.response_pricing), 0);

    return {
      mtdValue,
      wtdValue,
      todayValue,
      mtdCount: mtdEnquiries.length,
      wtdCount: wtdEnquiries.length,
    };
  }, [filteredEnquiries]);

  // Day-wise value chart data for last 30 days
  const dailyValueChartData = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 29);
    const days = eachDayOfInterval({ start: thirtyDaysAgo, end: now });

    return days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnquiries = filteredEnquiries.filter((e) => {
        const enquiryDate = startOfDay(new Date(e.created_at));
        return enquiryDate.getTime() === dayStart.getTime();
      });
      
      const value = dayEnquiries.reduce((sum, e) => sum + parsePriceValue(e.response_pricing), 0);
      const count = dayEnquiries.length;

      return {
        date: format(day, "dd"),
        fullDate: format(day, "MMM dd"),
        value,
        count,
        rawDate: day,
      };
    });
  }, [filteredEnquiries]);

  // Funnel data - conversion stages
  const funnelData = useMemo(() => {
    const selectedMonthInfo = availableMonths.find((m) => m.value === selectedMonth);
    const monthEnquiries = selectedMonthInfo 
      ? filteredEnquiries.filter((e) =>
          isWithinInterval(new Date(e.created_at), {
            start: selectedMonthInfo.start,
            end: selectedMonthInfo.end,
          })
        )
      : filteredEnquiries;

    const total = monthEnquiries.length;
    const pending = monthEnquiries.filter(e => e.status === 'pending').length;
    const responded = monthEnquiries.filter(e => e.status === 'responded').length;
    const onHold = monthEnquiries.filter(e => e.status === 'on_hold').length;
    const movedToPipeline = monthEnquiries.filter(e => e.status === 'moved_to_pipeline').length;
    const orderWon = monthEnquiries.filter(e => e.status === 'order_won').length;
    const orderLost = monthEnquiries.filter(e => e.status === 'order_lost').length;

    // Calculate conversion rates
    const wonRate = total > 0 ? ((orderWon / total) * 100).toFixed(1) : '0';
    const lostRate = total > 0 ? ((orderLost / total) * 100).toFixed(1) : '0';
    const pipelineRate = total > 0 ? ((movedToPipeline / total) * 100).toFixed(1) : '0';
    const respondedRate = total > 0 ? (((responded + movedToPipeline + orderWon + orderLost) / total) * 100).toFixed(1) : '0';

    return {
      stages: [
        { name: 'Total Enquiries', value: total, fill: 'hsl(var(--primary))' },
        { name: 'Responded', value: responded + movedToPipeline + orderWon + orderLost, fill: 'hsl(var(--chart-2))' },
        { name: 'In Pipeline', value: movedToPipeline + orderWon, fill: 'hsl(280, 65%, 60%)' },
        { name: 'Order Won', value: orderWon, fill: 'hsl(142, 76%, 36%)' },
      ],
      breakdown: [
        { status: 'Pending', count: pending, color: 'hsl(var(--muted-foreground))' },
        { status: 'Responded', count: responded, color: 'hsl(var(--chart-2))' },
        { status: 'On Hold', count: onHold, color: 'hsl(45, 93%, 47%)' },
        { status: 'In Pipeline', count: movedToPipeline, color: 'hsl(280, 65%, 60%)' },
        { status: 'Order Won', count: orderWon, color: 'hsl(142, 76%, 36%)' },
        { status: 'Order Lost', count: orderLost, color: 'hsl(0, 84%, 60%)' },
      ],
      metrics: {
        total,
        wonRate,
        lostRate,
        pipelineRate,
        respondedRate,
        orderWon,
        orderLost,
      }
    };
  }, [filteredEnquiries, selectedMonth, availableMonths]);

  // Get unique categories from enquiries
  const usedCategories = useMemo(() => {
    const cats = new Set(enquiries.map((e) => e.product_category).filter(Boolean));
    return Array.from(cats).sort();
  }, [enquiries]);

  // Export handlers
  const handleExportEnquiriesExcel = () => {
    const monthLabel = availableMonths.find((m) => m.value === selectedMonth)?.label || "All Time";
    const categoryLabel = selectedCategory === "all" ? "" : ` - ${selectedCategory}`;
    exportToExcel(currentMonthData.enquiries, {
      filename: `enquiries_${format(new Date(), "yyyy-MM-dd")}`,
      title: `Enquiries Report - ${monthLabel}${categoryLabel}`,
    });
  };

  const handleExportEnquiriesPDF = () => {
    const monthLabel = availableMonths.find((m) => m.value === selectedMonth)?.label || "All Time";
    const categoryLabel = selectedCategory === "all" ? "" : ` - ${selectedCategory}`;
    exportToPDF(currentMonthData.enquiries, {
      filename: `enquiries_${format(new Date(), "yyyy-MM-dd")}`,
      title: `Enquiries Report`,
      subtitle: `${monthLabel}${categoryLabel} | Total: ${currentMonthData.enquiries.length} enquiries`,
    });
  };

  const handleExportCategoryExcel = () => {
    const monthLabel = availableMonths.find((m) => m.value === selectedMonth)?.label || "All Time";
    exportCategorySummaryToExcel(categoryData, {
      filename: `category_report_${format(new Date(), "yyyy-MM-dd")}`,
      title: `Category Summary - ${monthLabel}`,
    });
  };

  const handleExportCategoryPDF = () => {
    const monthLabel = availableMonths.find((m) => m.value === selectedMonth)?.label || "All Time";
    exportCategorySummaryToPDF(categoryData, {
      filename: `category_report_${format(new Date(), "yyyy-MM-dd")}`,
      title: `Category Summary`,
      subtitle: monthLabel,
    });
  };

  return (
    <div className="space-y-6">
      {/* Filters and Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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

        {/* Export Buttons */}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export Enquiries
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportEnquiriesExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                Download as Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportEnquiriesPDF}>
                <FileText className="w-4 h-4 mr-2 text-red-600" />
                Download as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export Category Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCategoryExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                Download as Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCategoryPDF}>
                <FileText className="w-4 h-4 mr-2 text-red-600" />
                Download as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

      {/* Value Stats Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <IndianRupee className="w-5 h-5 text-success" />
          Enquiry Value Analytics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card 
            className="glass border-success/20 cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
            onClick={() => onValueFilterClick?.("mtd")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-success/10">
                  <IndianRupee className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-success">
                    ₹{valueStats.mtdValue.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Month to Date ({valueStats.mtdCount} enquiries)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="glass border-chart-2/20 cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
            onClick={() => onValueFilterClick?.("wtd")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-chart-2/10">
                  <IndianRupee className="w-5 h-5 text-chart-2" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-chart-2">
                    ₹{valueStats.wtdValue.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Week to Date ({valueStats.wtdCount} enquiries)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="glass border-primary/20 cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
            onClick={() => onValueFilterClick?.("today")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <IndianRupee className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">
                    ₹{valueStats.todayValue.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-muted-foreground">Today's Value</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Daily Value Chart - Last 30 days */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">Daily Enquiry Value (Last 30 Days)</CardTitle>
            <CardDescription>
              Total quoted value of enquiries received per day - Click on a bar to filter
              {selectedCategory !== "all" && ` - ${selectedCategory}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {dailyValueChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={dailyValueChartData}
                    onClick={(data) => {
                      if (data?.activePayload?.[0]?.payload?.rawDate) {
                        onValueFilterClick?.("specific_day", data.activePayload[0].payload.rawDate);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                      tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                              <p className="font-medium">{payload[0].payload.fullDate}</p>
                              <p className="text-sm text-success">
                                Value: ₹{payload[0].payload.value.toLocaleString('en-IN')}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {payload[0].payload.count} enquiries
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Click to filter</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="hsl(142, 76%, 36%)"
                      radius={[4, 4, 0, 0]}
                      className="cursor-pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
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

      {/* Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Visualization */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Conversion Funnel
            </CardTitle>
            <CardDescription>
              Enquiry progression from receipt to order
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {funnelData.stages[0].value > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <FunnelChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const percentage = funnelData.stages[0].value > 0 
                            ? ((data.value / funnelData.stages[0].value) * 100).toFixed(1)
                            : 0;
                          return (
                            <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                              <p className="font-medium">{data.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {data.value} enquiries ({percentage}%)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Funnel
                      dataKey="value"
                      data={funnelData.stages}
                      isAnimationActive
                    >
                      <LabelList 
                        position="right" 
                        fill="hsl(var(--foreground))" 
                        stroke="none" 
                        dataKey="name"
                        fontSize={12}
                      />
                      <LabelList 
                        position="center" 
                        fill="#fff" 
                        stroke="none" 
                        dataKey="value"
                        fontSize={14}
                        fontWeight="bold"
                      />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">Status Breakdown</CardTitle>
            <CardDescription>
              Current distribution across all stages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {funnelData.breakdown.map((item) => {
                const percentage = funnelData.metrics.total > 0 
                  ? ((item.count / funnelData.metrics.total) * 100)
                  : 0;
                return (
                  <div key={item.status} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-medium">{item.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{percentage.toFixed(1)}%</span>
                        <span className="font-bold">{item.count}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: item.color 
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Conversion Metrics */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <p className="text-2xl font-bold text-green-600">{funnelData.metrics.wonRate}%</p>
                <p className="text-xs text-muted-foreground">Win Rate</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-500/10">
                <p className="text-2xl font-bold text-red-600">{funnelData.metrics.lostRate}%</p>
                <p className="text-xs text-muted-foreground">Loss Rate</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-purple-500/10">
                <p className="text-2xl font-bold text-purple-600">{funnelData.metrics.pipelineRate}%</p>
                <p className="text-xs text-muted-foreground">Pipeline Rate</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-500/10">
                <p className="text-2xl font-bold text-blue-600">{funnelData.metrics.respondedRate}%</p>
                <p className="text-xs text-muted-foreground">Response Rate</p>
              </div>
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
