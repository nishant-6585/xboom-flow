import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import type { DailyFlowEntry } from '@/hooks/useDailyFlow';

interface DailyFlowAnalyticsProps {
  entries: DailyFlowEntry[];
  rangeEntries: DailyFlowEntry[];
}

const chartConfig = {
  target: { label: 'Target', color: 'hsl(var(--primary))' },
  actual: { label: 'Actual', color: 'hsl(142 76% 36%)' },
};

export function DailyFlowAnalytics({ entries, rangeEntries }: DailyFlowAnalyticsProps) {
  // Today's target vs actual bar chart
  const todayData = useMemo(() =>
    entries
      .filter(e => !e.is_break && e.target_value > 0)
      .map(e => ({
        name: e.description.length > 15 ? e.description.slice(0, 15) + '…' : e.description,
        target: e.target_value,
        actual: e.actual_value,
      })),
    [entries]
  );

  // Aggregate across range for radar
  const radarData = useMemo(() => {
    const map = new Map<string, { target: number; actual: number }>();
    rangeEntries.filter(e => !e.is_break && e.target_value > 0).forEach(e => {
      const existing = map.get(e.description) || { target: 0, actual: 0 };
      existing.target += e.target_value;
      existing.actual += e.actual_value;
      map.set(e.description, existing);
    });
    return Array.from(map.entries()).map(([name, v]) => ({
      subject: name.length > 12 ? name.slice(0, 12) + '…' : name,
      target: v.target,
      actual: v.actual,
    }));
  }, [rangeEntries]);

  // Daily completion trend
  const trendData = useMemo(() => {
    const dateMap = new Map<string, { target: number; actual: number }>();
    rangeEntries.filter(e => !e.is_break).forEach(e => {
      const existing = dateMap.get(e.flow_date) || { target: 0, actual: 0 };
      existing.target += e.target_value;
      existing.actual += e.actual_value;
      dateMap.set(e.flow_date, existing);
    });
    return Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date: date.slice(5), // MM-DD
        target: v.target,
        actual: v.actual,
        pct: v.target > 0 ? Math.round((v.actual / v.target) * 100) : 0,
      }));
  }, [rangeEntries]);

  const overallPct = useMemo(() => {
    const t = entries.filter(e => !e.is_break).reduce((s, e) => s + e.target_value, 0);
    const a = entries.filter(e => !e.is_break).reduce((s, e) => s + e.actual_value, 0);
    return t > 0 ? Math.round((a / t) * 100) : 0;
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Summary card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Today's Achievement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className={`text-4xl font-bold ${overallPct >= 100 ? 'text-green-600' : overallPct >= 70 ? 'text-amber-600' : 'text-destructive'}`}>
              {overallPct}%
            </div>
            <div className="text-sm text-muted-foreground">
              Overall completion rate for today
            </div>
          </div>
          {todayData.length > 0 && (
            <ChartContainer config={chartConfig} className="h-[250px]">
              <BarChart data={todayData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="target" fill="var(--color-target)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="var(--color-actual)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Trend chart */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Completion Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="target" fill="var(--color-target)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="var(--color-actual)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Radar */}
      {radarData.length >= 3 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Task Performance Radar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" fontSize={11} />
                  <PolarRadiusAxis />
                  <Radar name="Target" dataKey="target" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                  <Radar name="Actual" dataKey="actual" stroke="hsl(142 76% 36%)" fill="hsl(142 76% 36%)" fillOpacity={0.3} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
