import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import type { CreditCard, CCStatement } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  getCardMetrics: (id: string) => any;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', '#f59e0b', '#10b981', '#6366f1', '#ec4899'];

export function CCCharts({ cards, statements, getCardMetrics }: Props) {
  const utilizationData = cards.filter(c => c.is_active).map(c => {
    const m = getCardMetrics(c.id);
    return { name: c.card_name, utilization: m?.utilization || 0 };
  });

  // Payment status distribution
  const statusMap: Record<string, number> = { FULL: 0, PARTIAL: 0, UNPAID: 0 };
  const latestByCard = new Map<string, CCStatement>();
  statements.forEach(s => { if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s); });
  Array.from(latestByCard.values()).forEach(s => {
    const st = s.payment_status || 'UNPAID';
    statusMap[st] = (statusMap[st] || 0) + 1;
  });
  const statusData = Object.entries(statusMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  // Monthly trend
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
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Card Utilization %</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={utilizationData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="utilization" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Status</CardTitle></CardHeader>
        <CardContent>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-16">No data yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding vs Payments</CardTitle></CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Legend />
                <Line type="monotone" dataKey="outstanding" stroke="hsl(var(--destructive))" strokeWidth={2} />
                <Line type="monotone" dataKey="paid" stroke="hsl(var(--primary))" strokeWidth={2} />
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
