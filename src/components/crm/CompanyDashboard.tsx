import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Company } from '@/hooks/useCompanies';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(262, 83%, 58%)', 'hsl(0, 84%, 60%)'];

export function CompanyDashboard({ companies }: { companies: Company[] }) {
  const statusData = useMemo(() => {
    const leads = companies.filter(c => c.status === 'lead').length;
    const customers = companies.filter(c => c.status === 'customer').length;
    return [
      { name: 'Leads', value: leads, fill: 'hsl(217, 91%, 60%)' },
      { name: 'Customers', value: customers, fill: 'hsl(142, 76%, 36%)' },
    ].filter(d => d.value > 0);
  }, [companies]);

  const recurringData = useMemo(() => {
    const recurring = companies.filter(c => c.is_recurring).length;
    const oneTime = companies.filter(c => !c.is_recurring && c.total_orders_count > 0).length;
    const noOrders = companies.filter(c => c.total_orders_count === 0).length;
    return [
      { name: 'Recurring', value: recurring, fill: 'hsl(38, 92%, 50%)' },
      { name: 'One-time', value: oneTime, fill: 'hsl(262, 83%, 58%)' },
      { name: 'No Orders', value: noOrders, fill: 'hsl(var(--muted-foreground))' },
    ].filter(d => d.value > 0);
  }, [companies]);

  const topCompanies = useMemo(() => {
    return [...companies]
      .filter(c => c.total_order_value > 0)
      .sort((a, b) => b.total_order_value - a.total_order_value)
      .slice(0, 10)
      .map(c => ({
        name: c.name.length > 22 ? c.name.substring(0, 22) + '…' : c.name,
        value: Math.round(c.total_order_value / 1000),
        orders: c.total_orders_count,
        recurring: c.is_recurring,
      }));
  }, [companies]);

  const industryData = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    companies.forEach(c => {
      const ind = c.industry || 'Unknown';
      if (!map[ind]) map[ind] = { count: 0, value: 0 };
      map[ind].count++;
      map[ind].value += c.total_order_value || 0;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([name, d], i) => ({ name, count: d.count, value: Math.round(d.value / 1000), fill: COLORS[i % COLORS.length] }));
  }, [companies]);

  if (companies.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Lead vs Customer */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Lead vs Customer</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4}>
                {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(v: number) => v} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recurring Breakdown */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Order Frequency</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={recurringData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4}>
                {recurringData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(v: number) => v} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Companies by Value */}
      <Card className="border-border/50 md:col-span-2">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top 10 Companies by Revenue (₹K)</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          {topCompanies.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topCompanies} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} interval={0} />
                <Tooltip
                  formatter={(v: number) => [`₹${v}K`, 'Revenue']}
                  labelFormatter={(name) => {
                    const c = topCompanies.find(t => t.name === name);
                    return `${name}${c?.recurring ? ' 🔄' : ''} (${c?.orders} orders)`;
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">No order data yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
