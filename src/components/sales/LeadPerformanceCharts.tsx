import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { BarChart3, Users, XCircle } from 'lucide-react';
import { Enquiry } from '@/hooks/useEnquiries';
import { PipelineOrder } from '@/hooks/usePipelineOrders';
import { format, parseISO, eachDayOfInterval, isSameDay } from 'date-fns';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
};

function extractLeadSource(notes: string | null | undefined): string {
  if (!notes) return 'Unknown';
  const match = notes.match(/Lead Source:\s*([^|]+)/i);
  if (match) return match[1].trim();
  return 'Unknown';
}

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

interface LeadPerformanceChartsProps {
  enquiries: Enquiry[];
  pipelineOrders: PipelineOrder[];
  dateRange?: { start: Date; end: Date };
}

export function LeadPerformanceCharts({ enquiries, pipelineOrders, dateRange }: LeadPerformanceChartsProps) {

  // === Graph 1: Daily Enquiry Received vs Lead Source ===
  const dailyEnquiryBySource = useMemo(() => {
    if (enquiries.length === 0) return { data: [], sources: [] };

    const filtered = dateRange
      ? enquiries.filter(e => {
          const d = new Date(e.created_at);
          return d >= dateRange.start && d <= dateRange.end;
        })
      : enquiries;

    // Determine date range from data
    const dates = filtered.map(e => new Date(e.created_at));
    if (dates.length === 0) return { data: [], sources: [] };

    const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
    const start = dateRange?.start || sortedDates[0];
    const end = dateRange?.end || sortedDates[sortedDates.length - 1];

    // Limit to last 30 days if no date range
    const effectiveStart = !dateRange && (end.getTime() - start.getTime()) > 30 * 86400000
      ? new Date(end.getTime() - 30 * 86400000)
      : start;

    const days = eachDayOfInterval({ start: effectiveStart, end });
    const sourceSet = new Set<string>();

    // Build source counts per day
    const dayMap = new Map<string, Record<string, number>>();
    days.forEach(d => dayMap.set(format(d, 'yyyy-MM-dd'), {}));

    filtered.forEach(e => {
      const dayKey = format(new Date(e.created_at), 'yyyy-MM-dd');
      if (!dayMap.has(dayKey)) return;
      const source = extractLeadSource(e.notes);
      sourceSet.add(source);
      const dayCounts = dayMap.get(dayKey)!;
      dayCounts[source] = (dayCounts[source] || 0) + 1;
    });

    const sources = Array.from(sourceSet).sort();
    const data = days.map(d => {
      const dayKey = format(d, 'yyyy-MM-dd');
      const counts = dayMap.get(dayKey) || {};
      return {
        date: format(d, 'dd MMM'),
        ...sources.reduce((acc, s) => ({ ...acc, [s]: counts[s] || 0 }), {}),
      };
    });

    return { data, sources };
  }, [enquiries, dateRange]);

  // === Graph 2: Expected Closure vs Salesperson ===
  const closureBySalesperson = useMemo(() => {
    const activePipeline = pipelineOrders.filter(p => p.status !== 'won' && p.status !== 'lost');
    const wonPipeline = pipelineOrders.filter(p => p.status === 'won');

    // Apply date filter to pipeline
    const filterByDate = (items: PipelineOrder[]) => {
      if (!dateRange) return items;
      return items.filter(p => {
        const d = new Date(p.created_at);
        return d >= dateRange.start && d <= dateRange.end;
      });
    };

    const filteredActive = filterByDate(activePipeline);
    const filteredWon = filterByDate(wonPipeline);

    const spMap = new Map<string, { expected: number; won: number }>();

    filteredActive.forEach(p => {
      const sp = p.sales_person_name || 'Unknown';
      const current = spMap.get(sp) || { expected: 0, won: 0 };
      current.expected += p.expected_price || 0;
      spMap.set(sp, current);
    });

    filteredWon.forEach(p => {
      const sp = p.sales_person_name || 'Unknown';
      const current = spMap.get(sp) || { expected: 0, won: 0 };
      current.won += p.expected_price || 0;
      spMap.set(sp, current);
    });

    return Array.from(spMap.entries())
      .map(([name, vals]) => ({
        name: name.split(' ')[0], // First name for compact display
        fullName: name,
        expected: vals.expected,
        won: vals.won,
      }))
      .sort((a, b) => b.expected - a.expected);
  }, [pipelineOrders, dateRange]);

  // === Graph 3: Leads Lost vs Salesperson ===
  const lostBySalesperson = useMemo(() => {
    const lostEnquiries = enquiries.filter(e => e.status === 'order_lost');
    const lostPipeline = pipelineOrders.filter(p => p.status === 'lost');

    const filterEnquiries = dateRange
      ? lostEnquiries.filter(e => {
          const d = new Date(e.created_at);
          return d >= dateRange.start && d <= dateRange.end;
        })
      : lostEnquiries;

    const filterPipeline = dateRange
      ? lostPipeline.filter(p => {
          const d = new Date(p.created_at);
          return d >= dateRange.start && d <= dateRange.end;
        })
      : lostPipeline;

    const spMap = new Map<string, { enquiryLost: number; pipelineLost: number }>();

    filterEnquiries.forEach(e => {
      const sp = e.sales_person_name || 'Unknown';
      const current = spMap.get(sp) || { enquiryLost: 0, pipelineLost: 0 };
      current.enquiryLost += 1;
      spMap.set(sp, current);
    });

    filterPipeline.forEach(p => {
      const sp = p.sales_person_name || 'Unknown';
      const current = spMap.get(sp) || { enquiryLost: 0, pipelineLost: 0 };
      current.pipelineLost += 1;
      spMap.set(sp, current);
    });

    return Array.from(spMap.entries())
      .map(([name, vals]) => ({
        name: name.split(' ')[0],
        fullName: name,
        enquiryLost: vals.enquiryLost,
        pipelineLost: vals.pipelineLost,
        total: vals.enquiryLost + vals.pipelineLost,
      }))
      .sort((a, b) => b.total - a.total);
  }, [enquiries, pipelineOrders, dateRange]);

  return (
    <div className="space-y-6">
      {/* Graph 1 — Daily Enquiry by Source */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="w-5 h-5" />
            Daily Enquiry Received vs Lead Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyEnquiryBySource.data.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No data available for selected filters
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyEnquiryBySource.data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" interval="preserveStartEnd" />
                <YAxis className="text-xs" allowDecimals={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                />
                <Legend />
                {dailyEnquiryBySource.sources.map((source, i) => (
                  <Bar
                    key={source}
                    dataKey={source}
                    stackId="a"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    radius={i === dailyEnquiryBySource.sources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Graph 2 & 3 side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 2 — Expected Closure vs Salesperson */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              Expected Closure vs Salesperson
            </CardTitle>
          </CardHeader>
          <CardContent>
            {closureBySalesperson.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available for selected filters
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={closureBySalesperson}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis tickFormatter={formatCurrency} className="text-xs" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'expected' ? 'Expected Pipeline' : 'Won Value',
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item?.fullName || label;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="expected" name="Expected Pipeline" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="won" name="Won Value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Graph 3 — Leads Lost vs Salesperson */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <XCircle className="w-5 h-5" />
              Leads Lost vs Salesperson
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lostBySalesperson.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available for selected filters
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={lostBySalesperson}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item?.fullName || label;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="enquiryLost" name="Enquiries Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pipelineLost" name="Pipeline Lost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
