import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Target, Users, BarChart3, ArrowUpRight, ArrowDownRight, Filter, AlertTriangle, Brain, Clock, Flame, UserCheck, AlertOctagon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface CampaignData {
  campaign_id: string;
  campaign_name: string;
  leads: number;
  conversions: number;
  revenue: number;
  spend: number;
}

interface SalespersonPerf {
  salesperson_id: string;
  salesperson_name: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversion_rate: number;
}

interface GoogleAdsOverviewTabProps {
  campaigns: CampaignData[];
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  totalSpend: number;
  qualifiedLeads: number;
  chartData: { date: string; revenue: number; spend: number }[];
  aiInsights: string[];
  salesPerformance?: SalespersonPerf[];
  avgConversionHours?: number;
  agingLeadsCount?: number;
}

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function GoogleAdsOverviewTab({
  campaigns,
  totalLeads,
  totalConversions,
  totalRevenue,
  totalSpend,
  qualifiedLeads,
  chartData,
  aiInsights,
  salesPerformance = [],
  avgConversionHours = 0,
  agingLeadsCount = 0,
}: GoogleAdsOverviewTabProps) {
  const profit = totalRevenue - totalSpend;
  const roas = safeDivide(totalRevenue, totalSpend);
  const conversionRate = safeDivide(totalConversions, totalLeads) * 100;

  // === DECISION ENGINE INSIGHTS ===
  const decisionInsights = useMemo(() => {
    if (campaigns.length === 0) return [];
    const insights: { type: "critical" | "warning" | "success" | "info"; icon: typeof AlertTriangle; message: string }[] = [];

    // Global summary
    if (totalSpend > 0 && totalRevenue > 0) {
      insights.push({
        type: "info",
        icon: Brain,
        message: `${formatINR(totalSpend)} spent → ${formatINR(totalRevenue)} revenue (${roas.toFixed(1)}x ROAS). ${profit >= 0 ? `Net profit: ${formatINR(profit)}` : `Net loss: ${formatINR(Math.abs(profit))}`}`,
      });
    }

    // Revenue leakage
    if (totalLeads > 50 && totalConversions === 0) {
      insights.push({
        type: "critical",
        icon: AlertOctagon,
        message: `Revenue leakage detected — ${totalLeads} leads captured but zero conversions. Sales follow-up needs urgent attention.`,
      });
    } else if (totalSpend > 0 && totalConversions === 0) {
      insights.push({
        type: "critical",
        icon: AlertTriangle,
        message: `${formatINR(totalSpend)} spent with zero revenue. Link orders to leads using "Convert to Order" to start tracking ROI.`,
      });
    }

    // Funnel drop
    if (totalLeads > 10 && totalConversions === 0 && totalSpend === 0) {
      insights.push({
        type: "warning",
        icon: Filter,
        message: `${totalLeads} leads generated but not converting — possible sales follow-up gap.`,
      });
    }

    // Campaign-level insights
    campaigns.forEach((c) => {
      const campRoas = safeDivide(c.revenue, c.spend);
      if (campRoas >= 3 && c.conversions >= 5) {
        insights.push({
          type: "success",
          icon: TrendingUp,
          message: `"${c.campaign_name}" has ${campRoas.toFixed(1)}x ROAS with ${c.conversions} conversions. Consider increasing budget.`,
        });
      }
      if (campRoas < 1 && c.spend > 0 && c.conversions > 0) {
        insights.push({
          type: "warning",
          icon: TrendingDown,
          message: `"${c.campaign_name}" losing money (${campRoas.toFixed(1)}x ROAS). Consider pausing or optimizing.`,
        });
      }
    });

    // Aging leads
    if (agingLeadsCount > 0) {
      insights.push({
        type: "warning",
        icon: Flame,
        message: `${agingLeadsCount} lead(s) aging beyond 24 hours without conversion — they're getting cold.`,
      });
    }

    // Conversion time
    if (avgConversionHours > 0) {
      insights.push({
        type: "info",
        icon: Clock,
        message: `Average time to convert: ${avgConversionHours < 24 ? `${Math.round(avgConversionHours)} hours` : `${(avgConversionHours / 24).toFixed(1)} days`}.`,
      });
    }

    return insights;
  }, [campaigns, totalLeads, totalConversions, totalSpend, totalRevenue, profit, roas, agingLeadsCount, avgConversionHours]);

  const insightStyles = {
    critical: "border-red-900/30 bg-red-900/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    success: "border-emerald-500/30 bg-emerald-500/5",
    info: "border-primary/20 bg-primary/5",
  };
  const insightIconStyles = {
    critical: "text-red-900 bg-red-900/10",
    warning: "text-amber-600 bg-amber-500/10",
    success: "text-emerald-600 bg-emerald-500/10",
    info: "text-primary bg-primary/10",
  };

  const businessMetrics = [
    { label: "Ad Spend", value: formatINR(totalSpend), icon: DollarSign, color: "text-blue-500", bgColor: "bg-blue-500/10", trend: null },
    { label: "Revenue Generated", value: formatINR(totalRevenue), icon: TrendingUp, color: "text-emerald-500", bgColor: "bg-emerald-500/10", trend: totalRevenue > totalSpend ? "up" as const : "down" as const },
    { label: "Profit", value: formatINR(profit), icon: profit >= 0 ? TrendingUp : TrendingDown, color: profit >= 0 ? "text-emerald-500" : "text-destructive", bgColor: profit >= 0 ? "bg-emerald-500/10" : "bg-destructive/10", trend: profit >= 0 ? "up" as const : "down" as const },
    { label: "ROAS", value: `${roas.toFixed(1)}x`, icon: Target, color: roas >= 3 ? "text-emerald-500" : roas >= 1 ? "text-amber-500" : "text-destructive", bgColor: roas >= 3 ? "bg-emerald-500/10" : roas >= 1 ? "bg-amber-500/10" : "bg-destructive/10", trend: roas >= 1 ? "up" as const : "down" as const },
  ];

  const funnelMetrics = [
    { label: "Total Leads", value: totalLeads.toString(), icon: Users, color: "text-primary", bgColor: "bg-primary/10" },
    { label: "Qualified Leads", value: qualifiedLeads.toString(), icon: Filter, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { label: "Conversions", value: totalConversions.toString(), icon: BarChart3, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
    { label: "Conversion Rate", value: `${conversionRate.toFixed(1)}%`, icon: TrendingUp, color: conversionRate >= 10 ? "text-emerald-500" : conversionRate >= 5 ? "text-amber-500" : "text-destructive", bgColor: conversionRate >= 10 ? "bg-emerald-500/10" : conversionRate >= 5 ? "bg-amber-500/10" : "bg-destructive/10" },
  ];

  // Salesperson best/worst
  const bestSP = salesPerformance.length > 0 ? salesPerformance.reduce((a, b) => a.revenue > b.revenue ? a : b) : null;
  const worstSP = salesPerformance.length > 1 ? salesPerformance.reduce((a, b) => a.conversion_rate < b.conversion_rate ? a : b) : null;

  return (
    <div className="space-y-6">
      {/* Decision Engine Insights */}
      {decisionInsights.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">AI Decision Engine</p>
            </div>
            <div className="space-y-2 ml-12">
              {decisionInsights.map((insight, i) => {
                const Icon = insight.icon;
                return (
                  <div key={i} className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${insightStyles[insight.type]}`}>
                    <div className={`p-1 rounded shrink-0 ${insightIconStyles[insight.type]}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-sm text-foreground/80">{insight.message}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Business Metrics */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Business Performance</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {businessMetrics.map((m) => (
            <Card key={m.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${m.bgColor}`}>
                    <m.icon className={`w-5 h-5 ${m.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{m.label}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xl font-bold">{m.value}</p>
                      {m.trend === "up" && <ArrowUpRight className="w-4 h-4 text-emerald-500" />}
                      {m.trend === "down" && <ArrowDownRight className="w-4 h-4 text-destructive" />}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Funnel Metrics */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Lead Funnel</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {funnelMetrics.map((m) => (
            <Card key={m.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${m.bgColor}`}>
                    <m.icon className={`w-5 h-5 ${m.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="text-xl font-bold">{m.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Sales Performance Table */}
      {salesPerformance.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sales Performance (Google Ads Leads)</h3>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salesperson</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">Conversions</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Conv. %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesPerformance.map((sp) => {
                    const isBest = bestSP && sp.salesperson_id === bestSP.salesperson_id && salesPerformance.length > 1;
                    const isWorstPerf = worstSP && sp.salesperson_id === worstSP.salesperson_id && salesPerformance.length > 1 && sp.salesperson_id !== bestSP?.salesperson_id;
                    return (
                      <TableRow key={sp.salesperson_id} className={isBest ? "bg-emerald-500/5" : isWorstPerf ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-muted-foreground" />
                            {sp.salesperson_name}
                            {isBest && <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 border-emerald-200 px-1.5 py-0">Top</Badge>}
                            {isWorstPerf && <Badge variant="outline" className="text-[10px] text-destructive bg-destructive/5 border-destructive/20 px-1.5 py-0">Needs Attention</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{sp.leads}</TableCell>
                        <TableCell className="text-center">{sp.conversions}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-600">{formatINR(sp.revenue)}</TableCell>
                        <TableCell className="text-right">
                          <span className={sp.conversion_rate >= 10 ? "text-emerald-600 font-semibold" : sp.conversion_rate >= 5 ? "text-amber-600" : "text-destructive"}>
                            {sp.conversion_rate.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revenue vs Spend Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">Revenue vs Spend Trend</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatINR(value), name]}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(152, 69%, 38%)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="spend" name="Spend" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
