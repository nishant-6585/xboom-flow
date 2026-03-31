import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Building2, Users, Landmark, Store } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const CUSTOMER_TYPES = ['B2B (Business)', 'B2C (Consumer)', 'B2G (Government)', 'Reseller'] as const;

const TYPE_CONFIG: Record<string, { label: string; short: string; color: string; icon: typeof Building2 }> = {
  'B2B (Business)': { label: 'B2B', short: 'B2B', color: 'hsl(var(--primary))', icon: Building2 },
  'B2C (Consumer)': { label: 'B2C', short: 'B2C', color: '#22c55e', icon: Users },
  'B2G (Government)': { label: 'B2G', short: 'B2G', color: '#8b5cf6', icon: Landmark },
  'Reseller': { label: 'Reseller', short: 'Reseller', color: '#f59e0b', icon: Store },
};

const SOURCES = ['interakt_leads', 'email_leads', 'call_logs', 'form_leads'] as const;
const SOURCE_LABELS: Record<string, string> = {
  interakt_leads: 'Interakt',
  email_leads: 'Email',
  call_logs: 'Calls',
  form_leads: 'Forms',
};
const SOURCE_COLORS: Record<string, string> = {
  interakt_leads: 'hsl(var(--primary))',
  email_leads: '#22c55e',
  call_logs: '#f59e0b',
  form_leads: '#8b5cf6',
};

interface SourceData {
  source: string;
  customer_type: string | null;
}

export function CustomerTypeAnalytics() {
  const { data: allData, isLoading } = useQuery({
    queryKey: ['customer-type-analytics'],
    queryFn: async () => {
      const [interakt, email, calls, forms] = await Promise.all([
        supabase.from('interakt_leads').select('customer_type'),
        supabase.from('email_leads').select('customer_type'),
        supabase.from('call_logs').select('customer_type'),
        supabase.from('form_leads').select('customer_type'),
      ]);

      const result: SourceData[] = [];
      (interakt.data || []).forEach(r => result.push({ source: 'interakt_leads', customer_type: r.customer_type }));
      (email.data || []).forEach(r => result.push({ source: 'email_leads', customer_type: r.customer_type }));
      (calls.data || []).forEach(r => result.push({ source: 'call_logs', customer_type: r.customer_type }));
      (forms.data || []).forEach(r => result.push({ source: 'form_leads', customer_type: r.customer_type }));
      return result;
    },
  });

  const { totalStats, pieData, sourceBreakdown, taggedRate } = useMemo(() => {
    if (!allData) return { totalStats: [], pieData: [], sourceBreakdown: [], taggedRate: 0 };

    const tagged = allData.filter(d => d.customer_type);
    const rate = allData.length > 0 ? Math.round((tagged.length / allData.length) * 100) : 0;

    // Total counts per type
    const typeCounts: Record<string, number> = {};
    CUSTOMER_TYPES.forEach(t => { typeCounts[t] = 0; });
    tagged.forEach(d => {
      if (d.customer_type && typeCounts[d.customer_type] !== undefined) {
        typeCounts[d.customer_type]++;
      }
    });

    const stats = CUSTOMER_TYPES.map(t => ({
      type: t,
      count: typeCounts[t],
      config: TYPE_CONFIG[t],
    }));

    const pie = stats.filter(s => s.count > 0).map(s => ({
      name: s.config.short,
      value: s.count,
      color: s.config.color,
    }));

    // Source x Type breakdown for stacked bar
    const breakdown = SOURCES.map(source => {
      const sourceData = tagged.filter(d => d.source === source);
      const row: Record<string, string | number> = { source: SOURCE_LABELS[source] };
      CUSTOMER_TYPES.forEach(t => {
        row[TYPE_CONFIG[t].short] = sourceData.filter(d => d.customer_type === t).length;
      });
      return row;
    });

    return { totalStats: stats, pieData: pie, sourceBreakdown: breakdown, taggedRate: rate };
  }, [allData]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Customer Type Analytics
        </h3>
        <Badge variant="outline" className="text-xs">
          {taggedRate}% Tagged
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {totalStats.map(stat => {
          const Icon = stat.config.icon;
          return (
            <Card key={stat.type} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.config.label}</p>
                    <p className="text-2xl font-bold mt-1">{stat.count}</p>
                  </div>
                  <div
                    className="p-2.5 rounded-lg"
                    style={{ backgroundColor: `${stat.config.color}15` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: stat.config.color }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart - Overall Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                No customer type data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stacked Bar - Source Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Lead Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sourceBreakdown}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="source" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                {CUSTOMER_TYPES.map(t => (
                  <Bar
                    key={t}
                    dataKey={TYPE_CONFIG[t].short}
                    stackId="a"
                    fill={TYPE_CONFIG[t].color}
                    radius={t === 'Reseller' ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
