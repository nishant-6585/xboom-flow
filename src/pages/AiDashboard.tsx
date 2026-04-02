import { useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BrainCircuit, Zap, Database, Bot, Target, Clock, Code, ChevronLeft, ChevronRight } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  useAiResolutionMetrics,
  computeKpis,
  computeCodeContextStats,
  computeDailyData,
  computeSourceDistribution,
  type MetricsFilters,
  type AiMetricRow,
} from "@/hooks/useAiResolutionMetrics";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

const PAGE_SIZE = 15;

export default function AiDashboard() {
  const [filters, setFilters] = useState<MetricsFilters>({
    dateFrom: format(subDays(new Date(), 7), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd'T'23:59:59"),
    source: "all",
  });
  const [dateRange, setDateRange] = useState("7d");
  const [page, setPage] = useState(0);

  const { data: rows = [], isLoading } = useAiResolutionMetrics(filters);

  const kpis = useMemo(() => computeKpis(rows), [rows]);
  const codeCtx = useMemo(() => computeCodeContextStats(rows), [rows]);
  const dailyData = useMemo(() => computeDailyData(rows), [rows]);
  const pieData = useMemo(() => computeSourceDistribution(rows), [rows]);

  const pagedRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  function handleDateRange(val: string) {
    setDateRange(val);
    const days = val === "30d" ? 30 : val === "90d" ? 90 : 7;
    setFilters((f) => ({
      ...f,
      dateFrom: format(subDays(new Date(), days), "yyyy-MM-dd"),
      dateTo: format(new Date(), "yyyy-MM-dd'T'23:59:59"),
    }));
    setPage(0);
  }

  function handleSource(val: string) {
    setFilters((f) => ({ ...f, source: val as MetricsFilters["source"] }));
    setPage(0);
  }

  function resolveSource(row: AiMetricRow): string {
    if (row.used_rule) return "Rule";
    if (row.used_cache) return "Cache";
    if (row.ai_called) return "AI";
    return "Unknown";
  }

  const kpiCards = [
    { label: "Total Requests", value: kpis.total, icon: BrainCircuit, color: "text-primary" },
    { label: "AI Calls", value: `${kpis.aiPct}%`, icon: Bot, color: "text-chart-3" },
    { label: "Cache Hits", value: `${kpis.cachePct}%`, icon: Database, color: "text-chart-2" },
    { label: "Rule Usage", value: `${kpis.rulePct}%`, icon: Zap, color: "text-chart-1" },
    { label: "Avg Confidence", value: `${kpis.avgConfidence}%`, icon: Target, color: "text-green-600" },
    { label: "Avg Response", value: `${kpis.avgResponseMs}ms`, icon: Clock, color: "text-amber-600" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BrainCircuit className="w-6 h-6 text-primary" />
              AI Observability
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Monitor AI debugging system performance</p>
          </div>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={handleDateRange}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.source} onValueChange={handleSource}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="rule">Rule</SelectItem>
                <SelectItem value="cache">Cache</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {kpiCards.map((kpi) => (
                <Card key={kpi.label} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                      <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pie Chart */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Resolution Source</CardTitle>
                </CardHeader>
                <CardContent>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-10 text-sm">No data</p>
                  )}
                </CardContent>
              </Card>

              {/* Requests Over Time */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Requests Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => format(new Date(d), "MMM d")} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="requests" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-10 text-sm">No data</p>
                  )}
                </CardContent>
              </Card>

              {/* Confidence Trend */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Confidence Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => format(new Date(d), "MMM d")} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="avgConfidence" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-10 text-sm">No data</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Code Context Analysis */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Code className="w-4 h-4" /> Code Context Effectiveness
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-foreground">{codeCtx.withContextPct}%</p>
                    <p className="text-xs text-muted-foreground mt-1">Requests with Code Context</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-green-600">{codeCtx.avgConfWithCtx}%</p>
                    <p className="text-xs text-muted-foreground mt-1">Avg Confidence (with context)</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-amber-600">{codeCtx.avgConfWithoutCtx}%</p>
                    <p className="text-xs text-muted-foreground mt-1">Avg Confidence (without context)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Drill-down Table */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Resolution Details ({rows.length} records)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Ticket ID</TableHead>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Confidence</TableHead>
                        <TableHead className="text-xs">Response (ms)</TableHead>
                        <TableHead className="text-xs">Code Context</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No metrics data available
                          </TableCell>
                        </TableRow>
                      ) : (
                        pagedRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-xs font-mono">
                              {row.ticket_id?.substring(0, 8)}…
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  row.used_rule
                                    ? "border-chart-1 text-chart-1"
                                    : row.used_cache
                                    ? "border-chart-2 text-chart-2"
                                    : "border-chart-3 text-chart-3"
                                }
                              >
                                {resolveSource(row)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.confidence_score != null ? `${row.confidence_score}%` : "—"}
                            </TableCell>
                            <TableCell className="text-xs">{row.response_time_ms ?? "—"}</TableCell>
                            <TableCell className="text-xs">
                              {row.used_code_context ? (
                                <Badge variant="secondary" className="text-[10px]">Yes</Badge>
                              ) : (
                                <span className="text-muted-foreground">No</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(row.created_at), "MMM d, HH:mm")}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
