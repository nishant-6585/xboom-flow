import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TrendingUp, CalendarRange, Building2 } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  format, startOfDay, startOfWeek, startOfMonth, startOfYear,
  subDays, subMonths, subYears, eachDayOfInterval, eachWeekOfInterval,
  eachMonthOfInterval, eachYearOfInterval, isAfter, isBefore, isEqual,
} from 'date-fns';
import type { Company } from '@/hooks/useCompanies';
import { cn } from '@/lib/utils';

type Granularity = 'day' | 'week' | 'month' | 'year';
type RangePreset = '7d' | '30d' | '90d' | '12m' | 'ytd' | 'all' | 'custom';

const PRESETS: { value: RangePreset; label: string; defaultGran: Granularity }[] = [
  { value: '7d', label: 'Last 7 days', defaultGran: 'day' },
  { value: '30d', label: 'Last 30 days', defaultGran: 'day' },
  { value: '90d', label: 'Last 90 days', defaultGran: 'week' },
  { value: '12m', label: 'Last 12 months', defaultGran: 'month' },
  { value: 'ytd', label: 'Year to date', defaultGran: 'month' },
  { value: 'all', label: 'All time', defaultGran: 'month' },
  { value: 'custom', label: 'Custom range', defaultGran: 'day' },
];

const GRANS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function bucketKey(d: Date, g: Granularity) {
  if (g === 'day') return format(startOfDay(d), 'yyyy-MM-dd');
  if (g === 'week') return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  if (g === 'month') return format(startOfMonth(d), 'yyyy-MM');
  return format(startOfYear(d), 'yyyy');
}

function formatTick(key: string, g: Granularity) {
  if (g === 'day') return format(new Date(key), 'd MMM');
  if (g === 'week') return `W ${format(new Date(key), 'd MMM')}`;
  if (g === 'month') return format(new Date(key + '-01'), 'MMM yy');
  return key;
}

export function CompanyCreationTrend({ companies }: { companies: Company[] }) {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [customFrom, setCustomFrom] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [pickerOpen, setPickerOpen] = useState(false);

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === 'custom') {
      return { from: startOfDay(new Date(customFrom)), to: startOfDay(new Date(customTo)) };
    }
    if (preset === '7d') return { from: startOfDay(subDays(now, 6)), to: startOfDay(now) };
    if (preset === '30d') return { from: startOfDay(subDays(now, 29)), to: startOfDay(now) };
    if (preset === '90d') return { from: startOfDay(subDays(now, 89)), to: startOfDay(now) };
    if (preset === '12m') return { from: startOfDay(subMonths(now, 11)), to: startOfDay(now) };
    if (preset === 'ytd') return { from: startOfYear(now), to: startOfDay(now) };
    // all time
    const earliest = companies.reduce<Date>((min, c) => {
      const d = new Date(c.created_at);
      return d < min ? d : min;
    }, now);
    return { from: startOfDay(earliest), to: startOfDay(now) };
  }, [preset, customFrom, customTo, companies]);

  const inRange = useMemo(() => {
    return companies.filter((c) => {
      const d = new Date(c.created_at);
      return (isAfter(d, from) || isEqual(d, from)) && (isBefore(d, new Date(to.getTime() + 86400000)));
    });
  }, [companies, from, to]);

  const series = useMemo(() => {
    if (!from || !to || isAfter(from, to)) return [];
    let buckets: Date[] = [];
    if (granularity === 'day') buckets = eachDayOfInterval({ start: from, end: to });
    else if (granularity === 'week') buckets = eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 });
    else if (granularity === 'month') buckets = eachMonthOfInterval({ start: from, end: to });
    else buckets = eachYearOfInterval({ start: from, end: to });

    const counts = new Map<string, { total: number; leads: number; customers: number }>();
    buckets.forEach((b) => counts.set(bucketKey(b, granularity), { total: 0, leads: 0, customers: 0 }));

    inRange.forEach((c) => {
      const key = bucketKey(new Date(c.created_at), granularity);
      const slot = counts.get(key);
      if (!slot) return;
      slot.total += 1;
      if (c.status === 'customer') slot.customers += 1;
      else slot.leads += 1;
    });

    return Array.from(counts.entries()).map(([key, v]) => ({
      key,
      label: formatTick(key, granularity),
      total: v.total,
      leads: v.leads,
      customers: v.customers,
    }));
  }, [inRange, from, to, granularity]);

  const totals = useMemo(() => {
    const total = inRange.length;
    const customers = inRange.filter((c) => c.status === 'customer').length;
    const leads = total - customers;
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
    return { total, customers, leads, perDay: total / days };
  }, [inRange, from, to]);

  const peak = useMemo(() => {
    return series.reduce((p, c) => (c.total > (p?.total ?? -1) ? c : p), null as null | typeof series[0]);
  }, [series]);

  const handlePreset = (p: RangePreset) => {
    setPreset(p);
    const def = PRESETS.find((x) => x.value === p)?.defaultGran;
    if (def) setGranularity(def);
    if (p === 'custom') setPickerOpen(true);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Company Creation Trend
            <Badge variant="outline" className="text-[10px] ml-1">
              {totals.total} new · {format(from, 'd MMM yy')} → {format(to, 'd MMM yy')}
            </Badge>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Range presets */}
            <div className="flex flex-wrap gap-1 rounded-md border border-border/50 p-0.5">
              {PRESETS.filter((p) => p.value !== 'custom').map((p) => (
                <button
                  key={p.value}
                  onClick={() => handlePreset(p.value)}
                  className={cn(
                    'px-2 py-1 text-[10px] rounded transition-colors',
                    preset === p.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    onClick={() => handlePreset('custom')}
                    className={cn(
                      'px-2 py-1 text-[10px] rounded transition-colors flex items-center gap-1',
                      preset === 'custom'
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground'
                    )}
                  >
                    <CalendarRange className="h-3 w-3" />
                    Custom
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3 space-y-2" align="end">
                  <div className="text-[11px] font-medium text-muted-foreground">Custom range</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">From</label>
                      <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">To</label>
                      <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <Button size="sm" className="w-full h-8 text-xs" onClick={() => { setPreset('custom'); setPickerOpen(false); }}>
                    Apply
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
            {/* Granularity */}
            <div className="flex gap-1 rounded-md border border-border/50 p-0.5">
              {GRANS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGranularity(g.value)}
                  className={cn(
                    'px-2 py-1 text-[10px] rounded transition-colors',
                    granularity === g.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />Total new
            </div>
            <div className="text-xl font-bold">{totals.total}</div>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground">New customers</div>
            <div className="text-xl font-bold text-green-600 dark:text-green-400">{totals.customers}</div>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground">New leads</div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{totals.leads}</div>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <div className="text-[10px] text-muted-foreground">Avg / day</div>
            <div className="text-xl font-bold">{totals.perDay.toFixed(1)}</div>
            {peak && peak.total > 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">Peak: {peak.total} on {peak.label}</div>
            )}
          </div>
        </div>

        {series.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
            No companies created in this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series} margin={{ left: -10, right: 8, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="newLeadsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="newCustomersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 11,
                }}
                formatter={(v: number, key) => [v, key === 'leads' ? 'New leads' : key === 'customers' ? 'New customers' : 'Total']}
              />
              <Area type="monotone" dataKey="leads" stackId="1" stroke="hsl(217, 91%, 60%)" fill="url(#newLeadsFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="customers" stackId="1" stroke="hsl(142, 76%, 36%)" fill="url(#newCustomersFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}