import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import type { CreditCard, CCStatement } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  getCardMetrics: (id: string) => any;
}

const UTIL_COLORS = { safe: '#10b981', warning: '#f59e0b', danger: '#ef4444' };
const PIE_COLORS = { FULL: '#10b981', PARTIAL: '#f59e0b', UNPAID: '#ef4444' };

const CustomBarShape = (props: any) => {
  const { x, y, width, height, utilization } = props;
  let fill = UTIL_COLORS.safe;
  if (utilization > 80) fill = UTIL_COLORS.danger;
  else if (utilization > 50) fill = UTIL_COLORS.warning;
  return <rect x={x} y={y} width={width} height={height} rx={4} ry={4} fill={fill} />;
};

export function CCCharts({ cards, statements, getCardMetrics }: Props) {
  const utilizationData = cards.filter(c => c.is_active).map(c => {
    const m = getCardMetrics(c.id);
    return { name: c.card_name, utilization: m?.utilization || 0 };
  });

  const statusMap: Record<string, number> = { FULL: 0, PARTIAL: 0, UNPAID: 0 };
  const latestByCard = new Map<string, CCStatement>();
  statements.forEach(s => { if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s); });
  Array.from(latestByCard.values()).forEach(s => {
    const st = s.payment_status || 'UNPAID';
    statusMap[st] = (statusMap[st] || 0) + 1;
  });
  const statusData = Object.entries(statusMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const totalStatus = statusData.reduce((s, d) => s + d.value, 0);

  const monthMap: Record<string, { outstanding: number; paid: number }> = {};
  statements.forEach(s => {
    if (!monthMap[s.billing_month]) monthMap[s.billing_month] = { outstanding: 0, paid: 0 };
    monthMap[s.billing_month].outstanding += s.outstanding_balance;
    monthMap[s.billing_month].paid += (s.amount_paid || 0);
  });
  const trendData = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, data]) => ({ month, ...data }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Card Utilization</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={utilizationData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v: number) => [`${v}%`, 'Utilization']}
              />
              <Bar dataKey="utilization" shape={<CustomBarShape />} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Status</CardTitle></CardHeader>
        <CardContent>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="hsl(var(--card))"
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {statusData.map((d) => <Cell key={d.name} fill={PIE_COLORS[d.name as keyof typeof PIE_COLORS] || '#6366f1'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Legend
                  formatter={(value: string) => {
                    const count = statusMap[value] || 0;
                    const pct = totalStatus > 0 ? Math.round((count / totalStatus) * 100) : 0;
                    return <span className="text-xs">{value} · {count} ({pct}%)</span>;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-16">No data yet</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Outstanding vs Payments</CardTitle></CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`}
                />
                <Legend />
                <Line type="monotone" dataKey="outstanding" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="paid" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-16">No data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
