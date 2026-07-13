import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_SOURCES } from "@/hooks/useOrders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, Users, Target, CheckCircle2, XCircle, BarChart3, Edit } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useAnalyticsScope } from "@/contexts/AnalyticsScopeContext";
import { IncludeWebsiteToggle } from "@/components/analytics/IncludeWebsiteToggle";

const SOURCE_COLORS: Record<string, string> = {
  abandon_cart: "#F97316",
  call: "#3B82F6",
  chat: "#06B6D4",
  email: "#8B5CF6",
  event: "#EC4899",
  exhibition: "#14B8A6",
  google_ads: "#EF4444",
  indiamart: "#84CC16",
  interakt: "#10B981",
  myoperator: "#F59E0B",
  referral: "#6366F1",
  repeated: "#A855F7",
  social_media: "#E11D48",
  "walk-in": "#0EA5E9",
  website_form: "#D946EF",
};

const PERIOD_OPTIONS = [
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "Last 3 Months", value: "3m" },
  { label: "All Time", value: "all" },
];

function getSourceLabel(val: string): string {
  return LEAD_SOURCES.find(s => s.value === val)?.label || val;
}

interface UpdateDialogState {
  open: boolean;
  table: string;
  id: string;
  customerName: string;
  currentSource: string;
}

export function LeadSourcePerformanceDashboard() {
  const { role } = useAuth();
  const { includeWebsite } = useAnalyticsScope();
  const [period, setPeriod] = useState("this_month");
  const [tab, setTab] = useState("closures");
  const [updateDialog, setUpdateDialog] = useState<UpdateDialogState>({ open: false, table: "", id: "", customerName: "", currentSource: "" });
  const [newSource, setNewSource] = useState("");
  const [saving, setSaving] = useState(false);

  const isManager = role === "admin" || role === "sales_manager" || role === "supply_chain";

  const now = new Date();
  const dateRange = useMemo(() => {
    if (period === "this_month") return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    if (period === "last_month") { const lm = subMonths(now, 1); return { start: format(startOfMonth(lm), "yyyy-MM-dd"), end: format(endOfMonth(lm), "yyyy-MM-dd") }; }
    if (period === "3m") return { start: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    return { start: "2020-01-01", end: format(endOfMonth(now), "yyyy-MM-dd") };
  }, [period]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["lead-source-perf", dateRange.start, dateRange.end, includeWebsite],
    queryFn: async () => {
      const endDt = `${dateRange.end}T23:59:59`;
      const [pipelineRes, ordersRes, prospectsRes] = await Promise.all([
        supabase.from("pipeline_orders")
          .select("id, lead_source, status, sales_person_name, sales_person_id, customer_name, product_name, expected_price, created_at")
          .gte("created_at", dateRange.start).lte("created_at", endDt),
        (() => {
          let q = supabase.from("orders")
            .select("id, lead_source, sales_person_name, sales_person_id, customer_name, product_name, total_amount, created_at, source")
            .gte("created_at", dateRange.start).lte("created_at", endDt);
          if (!includeWebsite) {
            // Exclude analytics-website rows: source='website' OR still owned
            // by the system ingestion user (unattributed legacy backfills).
            // PostgREST: chained .or() clauses AND together; each clause must
            // also handle NULL explicitly since .neq drops NULL rows.
            q = q
              .or("source.is.null,source.neq.website")
              .or("sales_person_id.is.null,sales_person_id.neq.a8050cc3-7d17-44ac-a083-d8023d505331");
          }
          return q;
        })(),
        supabase.from("prospects")
          .select("id, lead_source, source_type, sales_person_name, sales_person_id, customer_name, product_name, status, created_at")
          .gte("created_at", dateRange.start).lte("created_at", endDt),
      ]);
      return {
        pipeline: pipelineRes.data || [],
        orders: ordersRes.data || [],
        prospects: prospectsRes.data || [],
      };
    },
    staleTime: 3 * 60 * 1000,
  });

  // Closures by salesperson & source
  const closureData = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, Map<string, { won: number; lost: number; value: number }>>();
    
    data.pipeline.forEach((p: any) => {
      const sp = p.sales_person_name || "Unassigned";
      const src = p.lead_source || "unknown";
      if (!map.has(sp)) map.set(sp, new Map());
      const spMap = map.get(sp)!;
      if (!spMap.has(src)) spMap.set(src, { won: 0, lost: 0, value: 0 });
      const entry = spMap.get(src)!;
      if (p.status === "won") { entry.won++; entry.value += p.expected_price || 0; }
      if (p.status === "lost") entry.lost++;
    });

    return Array.from(map.entries()).map(([name, sources]) => ({
      name,
      sources: Array.from(sources.entries()).map(([src, stats]) => ({ source: src, ...stats })),
      totalWon: Array.from(sources.values()).reduce((s, v) => s + v.won, 0),
      totalLost: Array.from(sources.values()).reduce((s, v) => s + v.lost, 0),
      totalValue: Array.from(sources.values()).reduce((s, v) => s + v.value, 0),
    })).sort((a, b) => b.totalWon - a.totalWon);
  }, [data]);

  // Pipeline by salesperson & source
  const pipelineData = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, Map<string, { count: number; value: number }>>();
    
    data.pipeline.forEach((p: any) => {
      if (p.status === "won" || p.status === "lost") return;
      const sp = p.sales_person_name || "Unassigned";
      const src = p.lead_source || "unknown";
      if (!map.has(sp)) map.set(sp, new Map());
      const spMap = map.get(sp)!;
      if (!spMap.has(src)) spMap.set(src, { count: 0, value: 0 });
      const entry = spMap.get(src)!;
      entry.count++;
      entry.value += p.expected_price || 0;
    });

    return Array.from(map.entries()).map(([name, sources]) => ({
      name,
      sources: Array.from(sources.entries()).map(([src, stats]) => ({ source: src, ...stats })),
      totalCount: Array.from(sources.values()).reduce((s, v) => s + v.count, 0),
      totalValue: Array.from(sources.values()).reduce((s, v) => s + v.value, 0),
    })).sort((a, b) => b.totalValue - a.totalValue);
  }, [data]);

  // Prospects by salesperson & source
  const prospectData = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, Map<string, number>>();
    
    data.prospects.forEach((p: any) => {
      const sp = p.sales_person_name || "Unassigned";
      const src = p.lead_source || p.source_type || "unknown";
      if (!map.has(sp)) map.set(sp, new Map());
      const spMap = map.get(sp)!;
      spMap.set(src, (spMap.get(src) || 0) + 1);
    });

    return Array.from(map.entries()).map(([name, sources]) => ({
      name,
      sources: Array.from(sources.entries()).map(([src, count]) => ({ source: src, count })),
      total: Array.from(sources.values()).reduce((s, v) => s + v, 0),
    })).sort((a, b) => b.total - a.total);
  }, [data]);

  // Bar chart data for source-wise totals
  const sourceChartData = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { pipeline: number; won: number; lost: number; prospects: number }>();
    
    data.pipeline.forEach((p: any) => {
      const src = p.lead_source || "unknown";
      if (!map.has(src)) map.set(src, { pipeline: 0, won: 0, lost: 0, prospects: 0 });
      const e = map.get(src)!;
      if (p.status === "won") e.won++;
      else if (p.status === "lost") e.lost++;
      else e.pipeline++;
    });
    data.prospects.forEach((p: any) => {
      const src = p.lead_source || p.source_type || "unknown";
      if (!map.has(src)) map.set(src, { pipeline: 0, won: 0, lost: 0, prospects: 0 });
      map.get(src)!.prospects++;
    });

    return Array.from(map.entries())
      .map(([source, stats]) => ({ source: getSourceLabel(source), ...stats }))
      .sort((a, b) => (b.won + b.pipeline + b.prospects) - (a.won + a.pipeline + a.prospects));
  }, [data]);

  // Handle lead_source update
  const handleUpdateSource = async () => {
    if (!newSource || !updateDialog.id) return;
    setSaving(true);
    try {
      const tableMap: Record<string, string> = { pipeline: "pipeline_orders", prospect: "prospects", order: "orders" };
      const tableName = tableMap[updateDialog.table] || updateDialog.table;
      const { error } = await supabase.from(tableName as any).update({ lead_source: newSource } as any).eq("id", updateDialog.id);
      if (error) throw error;
      toast.success("Lead source updated");
      refetch();
      setUpdateDialog({ open: false, table: "", id: "", customerName: "", currentSource: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const allSources = Array.from(new Set([
    ...(data?.pipeline || []).map((p: any) => p.lead_source).filter(Boolean),
    ...(data?.prospects || []).map((p: any) => p.lead_source || p.source_type).filter(Boolean),
  ])).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Lead Source Performance
        </h3>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Source-wise overview chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Source-wise Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {sourceChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sourceChartData}>
                <XAxis dataKey="source" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="prospects" name="Prospects" fill="#8B5CF6" />
                <Bar dataKey="pipeline" name="Active Pipeline" fill="#F59E0B" />
                <Bar dataKey="won" name="Won" fill="#10B981" />
                <Bar dataKey="lost" name="Lost" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">No data for this period</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs for Closures / Pipeline / Prospects */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="closures" className="gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Closures</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-1"><TrendingUp className="w-3.5 h-3.5" />Pipeline</TabsTrigger>
          <TabsTrigger value="prospects" className="gap-1"><Target className="w-3.5 h-3.5" />Prospects</TabsTrigger>
        </TabsList>

        {/* Closures Tab */}
        <TabsContent value="closures">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10">Sales Person</TableHead>
                      {allSources.map(src => (
                        <TableHead key={src} className="text-center text-xs whitespace-nowrap">{getSourceLabel(src)}</TableHead>
                      ))}
                      <TableHead className="text-center font-bold">Total Won</TableHead>
                      <TableHead className="text-center font-bold">Total Lost</TableHead>
                      <TableHead className="text-center font-bold">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closureData.length === 0 ? (
                      <TableRow><TableCell colSpan={allSources.length + 4} className="text-center py-8 text-muted-foreground">No closure data</TableCell></TableRow>
                    ) : closureData.map(sp => (
                      <TableRow key={sp.name} className="hover:bg-muted/50">
                        <TableCell className="font-medium sticky left-0 bg-background z-10">{sp.name}</TableCell>
                        {allSources.map(src => {
                          const s = sp.sources.find(x => x.source === src);
                          return (
                            <TableCell key={src} className="text-center">
                              {s ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-green-600 font-semibold text-xs">{s.won > 0 ? `✓${s.won}` : ""}</span>
                                  <span className="text-red-500 text-[10px]">{s.lost > 0 ? `✗${s.lost}` : ""}</span>
                                </div>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-bold text-green-600">{sp.totalWon}</TableCell>
                        <TableCell className="text-center font-bold text-red-500">{sp.totalLost}</TableCell>
                        <TableCell className="text-center font-semibold">₹{(sp.totalValue / 1000).toFixed(0)}K</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10">Sales Person</TableHead>
                      {allSources.map(src => (
                        <TableHead key={src} className="text-center text-xs whitespace-nowrap">{getSourceLabel(src)}</TableHead>
                      ))}
                      <TableHead className="text-center font-bold">Total</TableHead>
                      <TableHead className="text-center font-bold">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pipelineData.length === 0 ? (
                      <TableRow><TableCell colSpan={allSources.length + 3} className="text-center py-8 text-muted-foreground">No pipeline data</TableCell></TableRow>
                    ) : pipelineData.map(sp => (
                      <TableRow key={sp.name} className="hover:bg-muted/50">
                        <TableCell className="font-medium sticky left-0 bg-background z-10">{sp.name}</TableCell>
                        {allSources.map(src => {
                          const s = sp.sources.find(x => x.source === src);
                          return (
                            <TableCell key={src} className="text-center">
                              {s ? <Badge variant="secondary" className="text-xs">{s.count}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-bold">{sp.totalCount}</TableCell>
                        <TableCell className="text-center font-semibold">₹{(sp.totalValue / 1000).toFixed(0)}K</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Quick update: list pipeline items without lead_source */}
          {isManager && data && (() => {
            const noSource = data.pipeline.filter((p: any) => !p.lead_source && p.status !== "won" && p.status !== "lost");
            if (noSource.length === 0) return null;
            return (
              <Card className="mt-4 border-amber-300/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600">
                    <Edit className="w-4 h-4" />
                    {noSource.length} Pipeline Deal{noSource.length > 1 ? "s" : ""} Missing Lead Source
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Sales Person</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {noSource.slice(0, 20).map((p: any) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium text-sm">{p.customer_name}</TableCell>
                            <TableCell className="text-sm">{p.product_name}</TableCell>
                            <TableCell className="text-sm">{p.sales_person_name}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => { setUpdateDialog({ open: true, table: "pipeline", id: p.id, customerName: p.customer_name, currentSource: "" }); setNewSource(""); }}
                              >
                                <Edit className="w-3 h-3 mr-1" /> Set Source
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* Prospects Tab */}
        <TabsContent value="prospects">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10">Sales Person</TableHead>
                      {allSources.map(src => (
                        <TableHead key={src} className="text-center text-xs whitespace-nowrap">{getSourceLabel(src)}</TableHead>
                      ))}
                      <TableHead className="text-center font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prospectData.length === 0 ? (
                      <TableRow><TableCell colSpan={allSources.length + 2} className="text-center py-8 text-muted-foreground">No prospect data</TableCell></TableRow>
                    ) : prospectData.map(sp => (
                      <TableRow key={sp.name} className="hover:bg-muted/50">
                        <TableCell className="font-medium sticky left-0 bg-background z-10">{sp.name}</TableCell>
                        {allSources.map(src => {
                          const s = sp.sources.find(x => x.source === src);
                          return (
                            <TableCell key={src} className="text-center">
                              {s ? <Badge variant="outline" className="text-xs">{s.count}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-bold">{sp.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Update Source Dialog */}
      <Dialog open={updateDialog.open} onOpenChange={open => { if (!open) setUpdateDialog(d => ({ ...d, open: false })); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Lead Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Update lead source for <strong>{updateDialog.customerName}</strong></p>
            <div className="space-y-2">
              <Label>Lead Source</Label>
              <Select value={newSource} onValueChange={setNewSource}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialog(d => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={handleUpdateSource} disabled={!newSource || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
