import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Target, Users, BarChart3, ArrowUpRight, ArrowDownRight, Filter, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface CampaignData {
  campaign_id: string;
  campaign_name: string;
  leads: number;
  conversions: number;
  revenue: number;
  spend: number;
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
}: GoogleAdsOverviewTabProps) {
  const profit = totalRevenue - totalSpend;
  const roas = safeDivide(totalRevenue, totalSpend);
  const conversionRate = safeDivide(totalConversions, totalLeads) * 100;
  const revenuePerLead = safeDivide(totalRevenue, totalLeads);

  const businessMetrics = [
    {
      label: "Ad Spend",
      value: formatINR(totalSpend),
      icon: DollarSign,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      trend: null,
    },
    {
      label: "Revenue Generated",
      value: formatINR(totalRevenue),
      icon: TrendingUp,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      trend: totalRevenue > totalSpend ? "up" : "down",
    },
    {
      label: "Profit",
      value: formatINR(profit),
      icon: profit >= 0 ? TrendingUp : TrendingDown,
      color: profit >= 0 ? "text-emerald-500" : "text-destructive",
      bgColor: profit >= 0 ? "bg-emerald-500/10" : "bg-destructive/10",
      trend: profit >= 0 ? "up" : "down",
    },
    {
      label: "ROAS",
      value: `${roas.toFixed(1)}x`,
      icon: Target,
      color: roas >= 3 ? "text-emerald-500" : roas >= 1 ? "text-amber-500" : "text-destructive",
      bgColor: roas >= 3 ? "bg-emerald-500/10" : roas >= 1 ? "bg-amber-500/10" : "bg-destructive/10",
      trend: roas >= 1 ? "up" : "down",
    },
  ];

  const funnelMetrics = [
    {
      label: "Total Leads",
      value: totalLeads.toString(),
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Qualified Leads",
      value: qualifiedLeads.toString(),
      icon: Filter,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Conversions",
      value: totalConversions.toString(),
      icon: BarChart3,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: conversionRate >= 10 ? "text-emerald-500" : conversionRate >= 5 ? "text-amber-500" : "text-destructive",
      bgColor: conversionRate >= 10 ? "bg-emerald-500/10" : conversionRate >= 5 ? "bg-amber-500/10" : "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Unconverted Spend Alert */}
      {totalSpend > 0 && totalConversions === 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-destructive/10 shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-destructive">High Spend – Zero Conversions</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatINR(totalSpend)} spent across {campaigns.length} campaign(s) with {totalLeads} leads but no conversions tracked.
                  Use "Convert to Order" in the Leads tab to link orders and start tracking ROI.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Insights */}
      {aiInsights.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground">AI Insights</p>
                <ul className="space-y-1">
                  {aiInsights.map((insight, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
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
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="hsl(152, 69%, 38%)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    name="Spend"
                    stroke="hsl(217, 91%, 60%)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
