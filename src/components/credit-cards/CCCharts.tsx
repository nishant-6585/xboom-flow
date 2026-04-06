import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { CreditCard, CCStatement } from '@/hooks/useCreditCards';
import { getStatementCreditLimit, getStatementOutstanding } from '@/lib/creditCardMetrics';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#f97316', '#ef4444', '#8b5cf6', '#06b6d4'];

export function CCCharts({ cards, statements }: Props) {
  if (statements.length === 0) return null;

  // Utilization per card (latest statement)
  const latestByCard = new Map<string, CCStatement>();
  statements.forEach(s => {
    if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s);
  });

  const utilizationData = Array.from(latestByCard.entries()).map(([cardId, s]) => {
    const card = cards.find(c => c.id === cardId);
    const limit = getStatementCreditLimit(s, card);
    const outstanding = getStatementOutstanding(s, card);
    const util = limit > 0 ? Math.round((outstanding / limit) * 100) : 0;
    return { name: card?.card_name || 'Unknown', utilization: util, outstanding };
  });

  // Payment status distribution
  const statusCounts = { FULL: 0, PARTIAL: 0, UNPAID: 0 };
  Array.from(latestByCard.values()).forEach(s => {
    const key = (s.payment_status || 'UNPAID') as keyof typeof statusCounts;
    if (key in statusCounts) statusCounts[key]++;
  });
  const statusData = [
    { name: 'Paid Full', value: statusCounts.FULL, color: '#22c55e' },
    { name: 'Partial', value: statusCounts.PARTIAL, color: '#f59e0b' },
    { name: 'Unpaid', value: statusCounts.UNPAID, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Monthly trend (last 6 months)
  const monthMap = new Map<string, { outstanding: number; interest: number }>();
  statements.forEach(s => {
    const card = cards.find(c => c.id === s.card_id);
    const existing = monthMap.get(s.billing_month) || { outstanding: 0, interest: 0 };
    monthMap.set(s.billing_month, {
      outstanding: existing.outstanding + getStatementOutstanding(s, card),
      interest: existing.interest + s.interest_charged,
    });
  });
  const trendData = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, data]) => ({
      month: month.slice(5), // MM
      outstanding: Math.round(data.outstanding / 1000),
      interest: Math.round(data.interest),
    }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Utilization */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Utilization by Card</CardTitle>
        </CardHeader>
        <CardContent className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={utilizationData}>
              <XAxis type="category" dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
                {utilizationData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Payment Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Payment Status</CardTitle>
        </CardHeader>
        <CardContent className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {statusData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Trend (₹K)</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="outstanding" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="interest" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
