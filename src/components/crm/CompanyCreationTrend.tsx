import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Building2, Target, GitBranch, Percent } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { format } from 'date-fns';
import type { Company } from '@/hooks/useCompanies';
import { cn } from '@/lib/utils';
import { useSalesFunnelTrend } from '@/hooks/useSalesFunnelTrend';

type Series = 'companies' | 'prospects' | 'pipeline' | 'conversionPct';

const SERIES_META: Record<Series, { label: string; color: string; icon: any }> = {
  companies:     { label: 'New Companies',  color: 'hsl(217, 91%, 60%)', icon: Building2 },
  prospects:     { label: 'New Prospects',  color: 'hsl(38, 92%, 50%)',  icon: Target },
  pipeline:      { label: 'New Pipeline',   color: 'hsl(142, 76%, 36%)', icon: GitBranch },
  conversionPct: { label: 'Pipeline / Companies %', color: 'hsl(280, 80%, 60%)', icon: Percent },
};

export function CompanyCreationTrend({ companies: _companies }: { companies: Company[] }) {
  const { data, isLoading } = useSalesFunnelTrend();
  const [enabled, setEnabled] = useState<Record<Series, boolean>>({
    companies: true,
    prospects: true,
    pipeline: true,
    conversionPct: true,
  });

  const series = data?.series ?? [];

  const totals = useMemo(() => {
    const c = series.reduce((s, p) => s + p.companies, 0);
    const pr = series.reduce((s, p) => s + p.prospects, 0);
    const pl = series.reduce((s, p) => s + p.pipeline, 0);
    const conv = c > 0 ? Math.round((pl / c) * 100) : 0;
    return { companies: c, prospects: pr, pipeline: pl, conv };
  }, [series]);

  const peak = useMemo(() => {
    return series.reduce((p, c) => {
      const t = c.companies + c.prospects + c.pipeline;
      return t > (p?.t ?? -1) ? { ...c, t } : p;
    }, null as null | (typeof series[0] & { t: number }));
  }, [series]);

  const toggle = (s: Series) => setEnabled((e) => ({ ...e, [s]: !e[s] }));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Sales Funnel Trend
            <Badge variant="outline" className="text-[10px] ml-1">
              Last 6 months · weekly
              {data && ` · ${format(data.rangeFrom, 'd MMM yy')} → ${format(data.rangeTo, 'd MMM yy')}`}
            </Badge>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Series toggles */}
            <div className="flex flex-wrap gap-1 rounded-md border border-border/50 p-0.5">
              {(Object.keys(SERIES_META) as Series[]).map((s) => {
                const meta = SERIES_META[s];
                const Icon = meta.icon;
                const active = enabled[s];
                return (
                  <button
                    key={s}
                    onClick={() => toggle(s)}
                    className={cn(
                      'px-2 py-1 text-[10px] rounded transition-colors flex items-center gap-1',
                      active ? 'bg-muted text-foreground' : 'text-muted-foreground/60 hover:text-foreground'
                    )}
                    style={active ? { boxShadow: `inset 0 -2px 0 ${meta.color}` } : undefined}
                  >
                    <Icon className="h-3 w-3" style={{ color: active ? meta.color : undefined }} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />New Companies
            </div>
            <div className="text-xl font-bold" style={{ color: SERIES_META.companies.color }}>{totals.companies}</div>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />New Prospects
            </div>
            <div className="text-xl font-bold" style={{ color: SERIES_META.prospects.color }}>{totals.prospects}</div>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3 w-3" />New Pipeline
            </div>
            <div className="text-xl font-bold" style={{ color: SERIES_META.pipeline.color }}>{totals.pipeline}</div>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Percent className="h-3 w-3" />Pipeline / Co.
            </div>
            <div className="text-xl font-bold" style={{ color: SERIES_META.conversionPct.color }}>{totals.conv}%</div>
            {peak && peak.t > 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">Peak: {peak.t} on {peak.label}</div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
            Loading historical data…
          </div>
        ) : series.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
            No data in this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={series} margin={{ left: -10, right: 8, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="companiesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES_META.companies.color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={SERIES_META.companies.color} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="prospectsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES_META.prospects.color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={SERIES_META.prospects.color} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES_META.pipeline.color} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={SERIES_META.pipeline.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="count" tick={{ fontSize: 10 }} allowDecimals={false} width={32} />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 10, fill: SERIES_META.conversionPct.color }}
                width={36}
                domain={[0, (max: number) => Math.max(100, Math.ceil(max / 25) * 25)]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 11,
                }}
                formatter={(v: number, key: string) => {
                  const meta = SERIES_META[key as Series];
                  if (!meta) return [v, key];
                  if (key === 'conversionPct') return [`${v}%`, meta.label];
                  return [v, meta.label];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {enabled.companies && (
                <Area
                  yAxisId="count"
                  type="monotone"
                  dataKey="companies"
                  name={SERIES_META.companies.label}
                  stroke={SERIES_META.companies.color}
                  fill="url(#companiesFill)"
                  strokeWidth={2}
                />
              )}
              {enabled.prospects && (
                <Area
                  yAxisId="count"
                  type="monotone"
                  dataKey="prospects"
                  name={SERIES_META.prospects.label}
                  stroke={SERIES_META.prospects.color}
                  fill="url(#prospectsFill)"
                  strokeWidth={2}
                />
              )}
              {enabled.pipeline && (
                <Area
                  yAxisId="count"
                  type="monotone"
                  dataKey="pipeline"
                  name={SERIES_META.pipeline.label}
                  stroke={SERIES_META.pipeline.color}
                  fill="url(#pipelineFill)"
                  strokeWidth={2}
                />
              )}
              {enabled.conversionPct && (
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="conversionPct"
                  name={SERIES_META.conversionPct.label}
                  stroke={SERIES_META.conversionPct.color}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}