import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_CATEGORIES } from "@/hooks/useEnquiries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowRight, TrendingUp, Package, CheckCircle2, XCircle, Target, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";

interface CategoryFunnelData {
  category: string;
  enquiries: number;
  prospects: number;
  pipeline: number;
  won: number;
  lost: number;
  conversionRate: number;
}

const SPECIAL_CATEGORIES = [
  "Cleaning Drones", "Tether Drones", "Custom Drones", "Underwater Drones",
  "Sensors", "Drone Repair", "Drone Training", "Internal Inspection Drone",
  "Drone as a Service", "Drone Shows", "Drone Rentals",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Cleaning Drones": "#06B6D4",
  "Tether Drones": "#8B5CF6",
  "Custom Drones": "#F59E0B",
  "Underwater Drones": "#3B82F6",
  "Sensors": "#10B981",
  "Drone Repair": "#EF4444",
  "Drone Training": "#EC4899",
  "Internal Inspection Drone": "#14B8A6",
  "Drone as a Service": "#6366F1",
  "Drone Shows": "#F97316",
  "Drone Rentals": "#84CC16",
};

const PERIOD_OPTIONS = [
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "Last 3 Months", value: "3m" },
  { label: "Last 6 Months", value: "6m" },
  { label: "All Time", value: "all" },
];

export function CategoryFunnelDashboard() {
  const [period, setPeriod] = useState("this_month");
  const [viewMode, setViewMode] = useState<"special" | "all">("special");
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [drillStage, setDrillStage] = useState<string | null>(null);

  const now = new Date();
  const dateRange = useMemo(() => {
    if (period === "this_month") return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    if (period === "last_month") { const lm = subMonths(now, 1); return { start: format(startOfMonth(lm), "yyyy-MM-dd"), end: format(endOfMonth(lm), "yyyy-MM-dd") }; }
    if (period === "3m") return { start: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    if (period === "6m") return { start: format(startOfMonth(subMonths(now, 5)), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    return { start: "2020-01-01", end: format(endOfMonth(now), "yyyy-MM-dd") };
  }, [period]);

  const { data, isLoading } = useQuery({
    queryKey: ["category-funnel", dateRange.start, dateRange.end],
    queryFn: async () => {
      const endDateTime = `${dateRange.end}T23:59:59`;

      const [enquiriesRes, prospectsRes, pipelineRes] = await Promise.all([
        supabase.from("enquiries")
          .select("id, product_category, status, order_outcome")
          .gte("created_at", dateRange.start)
          .lte("created_at", endDateTime),
        supabase.from("prospects")
          .select("id, product_category, status")
          .gte("created_at", dateRange.start)
          .lte("created_at", endDateTime),
        supabase.from("pipeline_orders")
          .select("id, product_category, status, customer_name, product_name, expected_price, sales_person_name, created_at")
          .gte("created_at", dateRange.start)
          .lte("created_at", endDateTime),
      ]);

      // Also count leads from other sources by product_category
      const [callsRes, interaktRes, emailRes] = await Promise.all([
        supabase.from("call_logs")
          .select("id, product_category")
          .gte("created_at", dateRange.start)
          .lte("created_at", endDateTime)
          .not("product_category", "is", null),
        supabase.from("interakt_leads")
          .select("id, product_category")
          .gte("created_at", dateRange.start)
          .lte("created_at", endDateTime)
          .not("product_category", "is", null),
        supabase.from("email_leads")
          .select("id, product_category")
          .gte("created_at", dateRange.start)
          .lte("created_at", endDateTime)
          .not("product_category", "is", null),
      ]);

      return {
        enquiries: enquiriesRes.data || [],
        prospects: prospectsRes.data || [],
        pipeline: pipelineRes.data || [],
        calls: callsRes.data || [],
        interakt: interaktRes.data || [],
        email: emailRes.data || [],
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const funnelData = useMemo<CategoryFunnelData[]>(() => {
    if (!data) return [];
    const categories = viewMode === "special" ? SPECIAL_CATEGORIES : [...PRODUCT_CATEGORIES];

    return categories.map(cat => {
      // Count all leads (enquiries + calls + interakt + email) with this category
      const enquiries = data.enquiries.filter((e: any) => e.product_category === cat).length;
      const callLeads = data.calls.filter((c: any) => c.product_category === cat).length;
      const interaktLeads = data.interakt.filter((i: any) => i.product_category === cat).length;
      const emailLeads = data.email.filter((e: any) => e.product_category === cat).length;
      const totalLeads = enquiries + callLeads + interaktLeads + emailLeads;

      const prospects = data.prospects.filter((p: any) => p.product_category === cat).length;
      const pipeline = data.pipeline.filter((p: any) => p.product_category === cat).length;
      const won = data.pipeline.filter((p: any) => p.product_category === cat && p.status === "won").length;
      const lost = data.pipeline.filter((p: any) => p.product_category === cat && p.status === "lost").length;
      const conversionRate = totalLeads > 0 ? Math.round((won / totalLeads) * 100) : 0;

      return { category: cat, enquiries: totalLeads, prospects, pipeline, won, lost, conversionRate };
    }).filter(d => d.enquiries > 0 || d.prospects > 0 || d.pipeline > 0);
  }, [data, viewMode]);

  // Totals
  const totals = useMemo(() => {
    return funnelData.reduce((acc, d) => ({
      enquiries: acc.enquiries + d.enquiries,
      prospects: acc.prospects + d.prospects,
      pipeline: acc.pipeline + d.pipeline,
      won: acc.won + d.won,
      lost: acc.lost + d.lost,
    }), { enquiries: 0, prospects: 0, pipeline: 0, won: 0, lost: 0 });
  }, [funnelData]);

  // Funnel chart data
  const funnelChartData = useMemo(() => [
    { name: "Leads", value: totals.enquiries, fill: "#3B82F6" },
    { name: "Prospects", value: totals.prospects, fill: "#8B5CF6" },
    { name: "Pipeline", value: totals.pipeline, fill: "#F59E0B" },
    { name: "Won", value: totals.won, fill: "#10B981" },
  ], [totals]);

  // Drill-down data
  const drillDownItems = useMemo(() => {
    if (!drillCategory || !drillStage || !data) return [];
    if (drillStage === "pipeline" || drillStage === "won" || drillStage === "lost") {
      return data.pipeline.filter((p: any) => {
        if (p.product_category !== drillCategory) return false;
        if (drillStage === "won") return p.status === "won";
        if (drillStage === "lost") return p.status === "lost";
        return true;
      });
    }
    return [];
  }, [drillCategory, drillStage, data]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Category-wise Lead Funnel
        </h3>
        <div className="flex gap-2">
          <Select value={viewMode} onValueChange={(v: "special" | "all") => setViewMode(v)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="special">Special Categories</SelectItem>
              <SelectItem value="all">All Categories</SelectItem>
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="w-4 h-4 mx-auto text-blue-500 mb-1" />
            <p className="text-xs text-muted-foreground">Total Leads</p>
            <p className="text-xl font-bold">{totals.enquiries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Target className="w-4 h-4 mx-auto text-purple-500 mb-1" />
            <p className="text-xs text-muted-foreground">Prospects</p>
            <p className="text-xl font-bold">{totals.prospects}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-4 h-4 mx-auto text-amber-500 mb-1" />
            <p className="text-xs text-muted-foreground">Pipeline</p>
            <p className="text-xl font-bold">{totals.pipeline}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="w-4 h-4 mx-auto text-green-500 mb-1" />
            <p className="text-xs text-muted-foreground">Won</p>
            <p className="text-xl font-bold text-green-600">{totals.won}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <XCircle className="w-4 h-4 mx-auto text-red-500 mb-1" />
            <p className="text-xs text-muted-foreground">Lost</p>
            <p className="text-xl font-bold text-red-600">{totals.lost}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart by category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, funnelData.length * 35)}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="category" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="enquiries" name="Leads" fill="#3B82F6" stackId="a" />
                  <Bar dataKey="prospects" name="Prospects" fill="#8B5CF6" stackId="a" />
                  <Bar dataKey="won" name="Won" fill="#10B981" stackId="a" />
                  <Bar dataKey="lost" name="Lost" fill="#EF4444" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">No data for this period</p>
            )}
          </CardContent>
        </Card>

        {/* Overall funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {totals.enquiries > 0 ? (
              <div className="space-y-3">
                {funnelChartData.map((stage, i) => {
                  const pct = totals.enquiries > 0 ? Math.round((stage.value / totals.enquiries) * 100) : 0;
                  const width = totals.enquiries > 0 ? Math.max(10, (stage.value / totals.enquiries) * 100) : 10;
                  return (
                    <div key={stage.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{stage.name}</span>
                        <span className="text-muted-foreground">{stage.value} ({pct}%)</span>
                      </div>
                      <div className="h-8 bg-muted/50 rounded-lg overflow-hidden">
                        <div className="h-full rounded-lg transition-all duration-500 flex items-center justify-center text-white text-xs font-medium" style={{ width: `${width}%`, backgroundColor: stage.fill }}>
                          {stage.value > 0 && stage.value}
                        </div>
                      </div>
                      {i < funnelChartData.length - 1 && (
                        <div className="flex justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" /></div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Category Funnel Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Prospects</TableHead>
                  <TableHead className="text-center">Pipeline</TableHead>
                  <TableHead className="text-center">Won</TableHead>
                  <TableHead className="text-center">Lost</TableHead>
                  <TableHead className="text-center">Conv. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funnelData.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No category data for this period</TableCell></TableRow>
                ) : (
                  funnelData.map(d => (
                    <TableRow key={d.category} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[d.category] || "#94A3B8" }} />
                          <span className="font-medium text-sm">{d.category}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{d.enquiries}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-purple-600 border-purple-300">{d.prospects}</Badge>
                      </TableCell>
                      <TableCell className="text-center cursor-pointer" onClick={() => { setDrillCategory(d.category); setDrillStage("pipeline"); }}>
                        <Badge variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50">{d.pipeline}</Badge>
                      </TableCell>
                      <TableCell className="text-center cursor-pointer" onClick={() => { setDrillCategory(d.category); setDrillStage("won"); }}>
                        <Badge className="bg-green-100 text-green-700 border-0 hover:bg-green-200">{d.won}</Badge>
                      </TableCell>
                      <TableCell className="text-center cursor-pointer" onClick={() => { setDrillCategory(d.category); setDrillStage("lost"); }}>
                        <Badge className="bg-red-100 text-red-700 border-0 hover:bg-red-200">{d.lost}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold ${d.conversionRate > 20 ? "text-green-600" : d.conversionRate > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {d.conversionRate}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {funnelData.length > 0 && (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-center">{totals.enquiries}</TableCell>
                    <TableCell className="text-center">{totals.prospects}</TableCell>
                    <TableCell className="text-center">{totals.pipeline}</TableCell>
                    <TableCell className="text-center text-green-600">{totals.won}</TableCell>
                    <TableCell className="text-center text-red-600">{totals.lost}</TableCell>
                    <TableCell className="text-center">{totals.enquiries > 0 ? Math.round((totals.won / totals.enquiries) * 100) : 0}%</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down Dialog */}
      <Dialog open={!!drillCategory && !!drillStage} onOpenChange={open => { if (!open) { setDrillCategory(null); setDrillStage(null); } }}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drillCategory} — {drillStage === "won" ? "Orders Won" : drillStage === "lost" ? "Orders Lost" : "Pipeline Deals"}</DialogTitle>
          </DialogHeader>
          {drillDownItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No records found</p>
          ) : (
            <div className="space-y-2">
              {drillDownItems.map((item: any) => (
                <Card key={item.id}>
                  <CardContent className="p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{item.customer_name}</span>
                      <Badge variant={item.status === "won" ? "default" : item.status === "lost" ? "destructive" : "secondary"} className="text-xs">{item.status}</Badge>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>{item.product_name}</span>
                      <span>₹{item.expected_price?.toLocaleString() || "N/A"}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>{item.sales_person_name}</span>
                      <span>{item.created_at ? format(parseISO(item.created_at), "dd MMM yyyy") : ""}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
