import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import type { CreditCard, CCStatement, CCTransaction, CCPayment } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  transactions: CCTransaction[];
  payments: CCPayment[];
  getCardMetrics: (id: string) => any;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', '#f59e0b', '#10b981', '#6366f1', '#ec4899'];

export function CCCharts({ cards, statements, transactions, payments, getCardMetrics }: Props) {
  // Utilization bar chart
  const utilizationData = cards.filter(c => c.is_active).map(c => {
    const m = getCardMetrics(c.id);
    return { name: c.card_name, utilization: m?.utilization || 0 };
  });

  // Category pie chart
  const categoryMap: Record<string, number> = {};
  transactions.forEach(t => {
    categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
  });
  const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  // Monthly trend - get unique months, aggregate outstanding vs payments
  const monthMap: Record<string, { outstanding: number; paid: number }> = {};
  statements.forEach(s => {
    if (!monthMap[s.billing_month]) monthMap[s.billing_month] = { outstanding: 0, paid: 0 };
    monthMap[s.billing_month].outstanding += s.outstanding_balance;
  });
  payments.forEach(p => {
    if (!monthMap[p.billing_month]) monthMap[p.billing_month] = { outstanding: 0, paid: 0 };
    monthMap[p.billing_month].paid += p.amount_paid;
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
        <CardHeader className="pb-2"><CardTitle className="text-sm">Expense by Category</CardTitle></CardHeader>
        <CardContent>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-16">No transactions yet</p>
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
