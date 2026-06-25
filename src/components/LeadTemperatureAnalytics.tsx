import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  BarChart,
  Bar
} from "recharts";
import { Flame, Thermometer, Snowflake, Star, TrendingUp, Target, Trophy, XCircle } from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  lead_temperature?: string | null;
  is_mega_deal?: boolean | null;
  status: string;
  created_at: string;
}

interface LeadTemperatureAnalyticsProps {
  enquiries: Lead[];
  pipelineOrders?: Lead[];
  onFilterClick?: (filter: 'hot' | 'warm' | 'cold' | 'mega' | 'all') => void;
}

const TEMP_COLORS = {
  hot: "hsl(24, 95%, 53%)",
  warm: "hsl(45, 93%, 47%)",
  cold: "hsl(210, 100%, 50%)",
};

export function LeadTemperatureAnalytics({ 
  enquiries, 
  pipelineOrders = [],
  onFilterClick 
}: LeadTemperatureAnalyticsProps) {
  // Combine all leads
  const allLeads = useMemo(() => [
    ...enquiries.map(e => ({ ...e, source: 'enquiry' as const })),
    ...pipelineOrders.map(p => ({ ...p, source: 'pipeline' as const }))
  ], [enquiries, pipelineOrders]);

  // Active leads (not closed)
  const activeLeads = useMemo(() => 
    allLeads.filter(l => !['order_won', 'order_lost', 'won', 'lost', 'cancelled'].includes(l.status)),
  [allLeads]);

  // Stats by temperature
  const tempStats = useMemo(() => {
    const hot = allLeads.filter(l => l.lead_temperature === 'hot');
    const warm = allLeads.filter(l => l.lead_temperature === 'warm');
    const cold = allLeads.filter(l => l.lead_temperature === 'cold');
    const mega = allLeads.filter(l => l.is_mega_deal === true);

    const hotActive = activeLeads.filter(l => l.lead_temperature === 'hot').length;
    const warmActive = activeLeads.filter(l => l.lead_temperature === 'warm').length;
    const coldActive = activeLeads.filter(l => l.lead_temperature === 'cold').length;
    const megaActive = activeLeads.filter(l => l.is_mega_deal === true).length;

    // Conversion rates by temperature
    const getConversionRate = (leads: Lead[]) => {
      const total = leads.length;
      const won = leads.filter(l => l.status === 'order_won' || l.status === 'won').length;
      return total > 0 ? ((won / total) * 100) : 0;
    };

    return {
      hot: { 
        total: hot.length, 
        active: hotActive, 
        conversionRate: getConversionRate(hot),
        won: hot.filter(l => l.status === 'order_won' || l.status === 'won').length,
        lost: hot.filter(l => l.status === 'order_lost' || l.status === 'lost').length
      },
      warm: { 
        total: warm.length, 
        active: warmActive, 
        conversionRate: getConversionRate(warm),
        won: warm.filter(l => l.status === 'order_won' || l.status === 'won').length,
        lost: warm.filter(l => l.status === 'order_lost' || l.status === 'lost').length
      },
      cold: { 
        total: cold.length, 
        active: coldActive, 
        conversionRate: getConversionRate(cold),
        won: cold.filter(l => l.status === 'order_won' || l.status === 'won').length,
        lost: cold.filter(l => l.status === 'order_lost' || l.status === 'lost').length
      },
      mega: { 
        total: mega.length, 
        active: megaActive, 
        conversionRate: getConversionRate(mega),
        won: mega.filter(l => l.status === 'order_won' || l.status === 'won').length,
        lost: mega.filter(l => l.status === 'order_lost' || l.status === 'lost').length
      },
    };
  }, [allLeads, activeLeads]);

  // Temperature distribution pie chart data
  const distributionData = useMemo(() => [
    { name: 'Hot', value: tempStats.hot.total, color: TEMP_COLORS.hot, filter: 'hot' as const },
    { name: 'Warm', value: tempStats.warm.total, color: TEMP_COLORS.warm, filter: 'warm' as const },
    { name: 'Cold', value: tempStats.cold.total, color: TEMP_COLORS.cold, filter: 'cold' as const },
  ].filter(d => d.value > 0), [tempStats]);

  // Conversion rate comparison data
  const conversionComparisonData = useMemo(() => [
    { name: 'Hot', rate: tempStats.hot.conversionRate, fill: TEMP_COLORS.hot },
    { name: 'Warm', rate: tempStats.warm.conversionRate, fill: TEMP_COLORS.warm },
    { name: 'Cold', rate: tempStats.cold.conversionRate, fill: TEMP_COLORS.cold },
    { name: 'Mega', rate: tempStats.mega.conversionRate, fill: 'hsl(45, 93%, 47%)' },
  ], [tempStats]);

  // 30-day trend data by temperature
  const trendData = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 29);
    const days = eachDayOfInterval({ start: thirtyDaysAgo, end: now });

    return days.map(day => {
      const dayStart = startOfDay(day);
      const dayLeads = allLeads.filter(l => {
        const leadDate = startOfDay(new Date(l.created_at));
        return leadDate.getTime() === dayStart.getTime();
      });

      return {
        date: format(day, 'dd'),
        fullDate: format(day, 'MMM dd'),
        hot: dayLeads.filter(l => l.lead_temperature === 'hot').length,
        warm: dayLeads.filter(l => l.lead_temperature === 'warm').length,
        cold: dayLeads.filter(l => l.lead_temperature === 'cold').length,
        mega: dayLeads.filter(l => l.is_mega_deal === true).length,
      };
    });
  }, [allLeads]);

  // Win/Loss by temperature data
  const outcomeByTempData = useMemo(() => [
    { name: 'Hot', won: tempStats.hot.won, lost: tempStats.hot.lost },
    { name: 'Warm', won: tempStats.warm.won, lost: tempStats.warm.lost },
    { name: 'Cold', won: tempStats.cold.won, lost: tempStats.cold.lost },
  ], [tempStats]);

  const cardClickClass = onFilterClick 
    ? "cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg hover:ring-2 hover:ring-primary/20" 
    : "";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-1">{payload[0]?.payload?.fullDate || label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="capitalize">{entry.name}:</span>
              <span className="font-medium">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Lead Temperature Analytics</h3>
          <p className="text-sm text-muted-foreground">Track lead quality and conversion rates by temperature</p>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className={cn("border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent", cardClickClass)}
          onClick={() => onFilterClick?.('hot')}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Hot Leads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold text-orange-600">{tempStats.hot.total}</div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs bg-orange-500/10 border-orange-500/30">
                  {tempStats.hot.active} active
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>{tempStats.hot.conversionRate.toFixed(1)}% conversion</span>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn("border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent", cardClickClass)}
          onClick={() => onFilterClick?.('warm')}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-yellow-500" />
              Warm Leads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold text-yellow-600">{tempStats.warm.total}</div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs bg-yellow-500/10 border-yellow-500/30">
                  {tempStats.warm.active} active
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>{tempStats.warm.conversionRate.toFixed(1)}% conversion</span>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn("border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent", cardClickClass)}
          onClick={() => onFilterClick?.('cold')}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Snowflake className="h-4 w-4 text-blue-500" />
              Cold Leads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold text-blue-600">{tempStats.cold.total}</div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30">
                  {tempStats.cold.active} active
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>{tempStats.cold.conversionRate.toFixed(1)}% conversion</span>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn("border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent", cardClickClass)}
          onClick={() => onFilterClick?.('mega')}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              Mega Deals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold text-amber-600">{tempStats.mega.total}</div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30">
                  {tempStats.mega.active} active
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Trophy className="h-3 w-3" />
              <span>{tempStats.mega.won} won</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temperature Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead Temperature Distribution</CardTitle>
            <CardDescription>Breakdown of all leads by temperature</CardDescription>
          </CardHeader>
          <CardContent>
            {distributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    onClick={(data: { filter?: 'hot' | 'warm' | 'cold' }) => {
                      if (data?.filter) onFilterClick?.(data.filter);
                    }}
                    className="cursor-pointer"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border rounded-lg p-2 shadow-lg">
                            <p className="font-medium">{data.name}</p>
                            <p className="text-sm text-muted-foreground">{data.value} leads</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No lead data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion Rate Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversion Rate by Lead Type</CardTitle>
            <CardDescription>Compare win rates across lead temperatures</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={conversionComparisonData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={50} />
                <Tooltip 
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Conversion Rate']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar 
                  dataKey="rate" 
                  radius={[0, 4, 4, 0]}
                  className="cursor-pointer"
                >
                  {conversionComparisonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 30-Day Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Temperature Trend (Last 30 Days)</CardTitle>
          <CardDescription>Daily new leads by temperature category</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorHot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TEMP_COLORS.hot} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={TEMP_COLORS.hot} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorWarm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TEMP_COLORS.warm} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={TEMP_COLORS.warm} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TEMP_COLORS.cold} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={TEMP_COLORS.cold} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="hot" 
                name="Hot" 
                stroke={TEMP_COLORS.hot} 
                fill="url(#colorHot)"
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey="warm" 
                name="Warm" 
                stroke={TEMP_COLORS.warm} 
                fill="url(#colorWarm)"
                strokeWidth={2}
              />
              <Area 
                type="monotone" 
                dataKey="cold" 
                name="Cold" 
                stroke={TEMP_COLORS.cold} 
                fill="url(#colorCold)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Win/Loss by Temperature */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outcomes by Lead Temperature</CardTitle>
          <CardDescription>Won vs Lost comparison across temperature categories</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={outcomeByTempData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar 
                dataKey="won" 
                name="Won" 
                fill="hsl(142, 76%, 36%)" 
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="lost" 
                name="Lost" 
                fill="hsl(0, 84%, 60%)" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
