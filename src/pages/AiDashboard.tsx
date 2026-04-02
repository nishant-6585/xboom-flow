import { useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, BrainCircuit, Zap, Database, Bot, Target, Clock, Code,
  ChevronLeft, ChevronRight, AlertTriangle, X, Lightbulb, ThumbsUp,
  ThumbsDown, TrendingUp, ArrowRight, Shield,
} from "lucide-react";
import { format, subDays } from "date-fns";
import {
  useAiResolutionMetrics,
  computeKpis,
  computeCodeContextStats,
  computeDailyData,
  computeSourceDistribution,
  computeSmartAlerts,
  computeInsights,
  computeRecommendations,
  type MetricsFilters,
  type AiMetricRow,
  type SmartAlert,
} from "@/hooks/useAiResolutionMetrics";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";

const PAGE_SIZE = 15;

const SEVERITY_STYLES: Record<SmartAlert["severity"], string> = {
  critical: "border-destructive/50 bg-destructive/5 text-destructive",
  warning: "border-yellow-500/50 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400",
  info: "border-primary/50 bg-primary/5 text-primary",
};

export default function AiDashboard() {
  const [filters, setFilters] = useState<MetricsFilters>({
    dateFrom: format(subDays(new Date(), 7), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd'T'23:59:59"),
    source: "all",
  });
  const [dateRange, setDateRange] = useState("7d");
  const [page, setPage] = useState(0);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useAiResolutionMetrics(filters);

  const kpis = useMemo(() => computeKpis(rows), [rows]);
  const codeCtx = useMemo(() => computeCodeContextStats(rows), [rows]);
  const dailyData = useMemo(() => computeDailyData(rows), [rows]);
  const pieData = useMemo(() => computeSourceDistribution(rows), [rows]);
  const alerts = useMemo(() => computeSmartAlerts(kpis), [kpis]);
  const insights = useMemo(() => computeInsights(kpis, codeCtx), [kpis, codeCtx]);
  const recommendations = useMemo(() => computeRecommendations(kpis, codeCtx), [kpis, codeCtx]);

  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));

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
    { label: "Avg Confidence", value: `${kpis.avgConfidence}%`, icon: Target, color: "text-primary" },
    { label: "Avg Response", value: `${kpis.avgResponseMs}ms`, icon: Clock, color: "text-muted-foreground" },
    { label: "User Accuracy", value: kpis.feedbackCount > 0 ? `${kpis.accuracyPct}%` : "—", icon: ThumbsUp, color: "text-primary" },
    { label: "Feedback", value: kpis.feedbackCount, icon: ThumbsDown, color: "text-muted-foreground" },
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
            <p className="text-sm text-muted-foreground mt-1">Monitor & improve AI debugging performance</p>
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
            {/* Smart Alerts */}
            {visibleAlerts.length > 0 && (
              <div className="space-y-2">
                {visibleAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${SEVERITY_STYLES[alert.severity]}`}
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="text-xs opacity-80 mt-0.5">{alert.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
                      onClick={() => setDismissedAlerts((prev) => new Set(prev).add(alert.id))}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {kpiCards.map((kpi) => (
                <Card key={kpi.label} className="border-border/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                      <span className="text-[10px] text-muted-foreground font-medium truncate">{kpi.label}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Insights & Recommendations */}
            {(insights.length > 0 || recommendations.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Insights */}
                {insights.length > 0 && (
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-primary" /> AI Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-0.5 shrink-0">
                            {insight.type === "positive" ? (
                              <TrendingUp className="w-3.5 h-3.5 text-primary" />
                            ) : insight.type === "negative" ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                            ) : (
                              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </span>
                          <span className="text-foreground/80">{insight.text}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" /> Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <Badge
                            variant="outline"
                            className={`text-[9px] shrink-0 mt-0.5 ${
                              rec.priority === "high"
                                ? "border-destructive text-destructive"
                                : rec.priority === "medium"
                                ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                                : "border-muted-foreground text-muted-foreground"
                            }`}
                          >
                            {rec.priority}
                          </Badge>
                          <span className="text-foreground/80">{rec.text}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

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
                    <p className="text-2xl font-bold text-primary">{codeCtx.avgConfWithCtx}%</p>
                    <p className="text-xs text-muted-foreground mt-1">Avg Confidence (with context)</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-muted-foreground">{codeCtx.avgConfWithoutCtx}%</p>
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
                        <TableHead className="text-xs">Feedback</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                            <TableCell className="text-xs">
                              {row.user_feedback === "helpful" ? (
                                <span className="text-primary">👍</span>
                              ) : row.user_feedback === "not_helpful" ? (
                                <span className="text-destructive">👎</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
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
